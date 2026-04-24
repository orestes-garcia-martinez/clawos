// ─────────────────────────────────────────────────────────────────────────────
// ScrapeClaw — End-to-end smoke test — full pipeline with real APIs.
//
// Requires .env.test to be populated (see .env.test.example).
// Run with: npm run test:integration
//
// Pipeline under test:
//   1. Discovery  — Google Places API → scrapeclaw_businesses (DB write)
//   2. Research   — Anthropic → in-memory prospect + evidence drafts (pure)
//   3. Enrichment — Anthropic → in-memory enriched prospect (pure)
//   4. Persist    — direct Supabase insert of enriched results (stand-in for
//                   the future persist adapter mode, not yet implemented)
//   5. Package    — reads DB, runs insight engine, writes scrapeclaw_demo_packages
//                   + scrapeclaw_package_attachments (Phase 5 — what we built)
//   6. Idempotency — re-run returns already_packaged
//   7. Results    — timestamped JSON written to .integration-test-results/
//
// Cleanup guarantee:
//   afterAll deletes every row written during the run in FK-safe reverse order,
//   scoped by the IDs accumulated in outer-scope `let` variables. Rows from
//   runs that crashed mid-way are still cleaned up for the steps that did run.
// ─────────────────────────────────────────────────────────────────────────────

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type {
  ScrapeClawDiscoveryWorkerResult,
  ScrapeClawEnrichmentWorkerResult,
  ScrapeClawPackageWorkerResult,
  ScrapeClawProspectInsert,
  ScrapeClawEvidenceItemInsert,
  ScrapeClawResearchWorkerResult,
  TypedSupabaseClient,
  VerifiedSkillExecutionContext,
} from '@clawos/shared'
import { createServerClient } from '@clawos/shared'
import { scrapeClawAdapter } from './adapter.js'

// ── Env guard ─────────────────────────────────────────────────────────────────

const REQUIRED_ENV = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SCRAPECLAW_GOOGLE_PLACES_API_KEY',
  'SCRAPECLAW_ANTHROPIC_API_KEY',
  'TEST_USER_ID',
] as const

const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k])

describe.skipIf(missingEnv.length > 0)(
  `ScrapeClaw E2E smoke — full pipeline${missingEnv.length ? ` [SKIPPED: missing ${missingEnv.join(', ')}]` : ''}`,
  () => {
    // ── Shared state ────────────────────────────────────────────────────────────
    // Each phase populates one or more of these. afterAll uses them for cleanup.

    let supabase: TypedSupabaseClient
    let userId: string
    let ctx: VerifiedSkillExecutionContext

    let runStartedAt: string
    let businessId: string | null = null
    let prospectId: string | null = null
    let packageId: string | null = null

    let discoveryResult: ScrapeClawDiscoveryWorkerResult | null = null
    let researchResult: ScrapeClawResearchWorkerResult | null = null
    let enrichmentResult: ScrapeClawEnrichmentWorkerResult | null = null
    let packageResult: ScrapeClawPackageWorkerResult | null = null

    // ── Setup ───────────────────────────────────────────────────────────────────

    beforeAll(async () => {
      supabase = createServerClient()
      userId = process.env['TEST_USER_ID']!
      ctx = {
        source: 'clawos',
        verified: true,
        userId,
        skill: 'scrapeclaw',
        tier: 'free',
        features: [],
        requestId: 'e2e-smoke-scrapeclaw',
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 7200,
      }

      // Pre-run cleanup: remove all scrapeclaw rows for the test user left
      // behind by any previously crashed run. Order matters: children first.
      const db = createServerClient()
      await db.from('scrapeclaw_package_attachments').delete().eq('user_id', userId)
      await db.from('scrapeclaw_demo_packages').delete().eq('user_id', userId)
      await db.from('scrapeclaw_evidence_items').delete().eq('user_id', userId)
      await db.from('scrapeclaw_prospects').delete().eq('user_id', userId)
      await db.from('scrapeclaw_businesses').delete().eq('user_id', userId)
      await db.from('scrapeclaw_discovery_discards').delete().eq('user_id', userId)
    })

    // ── Cleanup ─────────────────────────────────────────────────────────────────

    afterAll(async () => {
      const db = createServerClient()

      try {
        if (packageId) {
          await db.from('scrapeclaw_package_attachments').delete().eq('package_id', packageId)
          await db.from('scrapeclaw_demo_packages').delete().eq('id', packageId)
        }

        if (prospectId) {
          await db.from('scrapeclaw_evidence_items').delete().eq('prospect_id', prospectId)
          await db.from('scrapeclaw_prospects').delete().eq('id', prospectId)
        }

        // Discovery inserts multiple businesses per run. Use the run start
        // timestamp to scope the delete to every row written in this run.
        if (runStartedAt) {
          await db
            .from('scrapeclaw_businesses')
            .delete()
            .eq('user_id', userId)
            .gte('created_at', runStartedAt)
          await db
            .from('scrapeclaw_discovery_discards')
            .delete()
            .eq('user_id', userId)
            .gte('created_at', runStartedAt)
        }
      } catch (err) {
        console.error('[E2E cleanup] Error during cleanup — some rows may remain:', err)
      }
    })

    // ── Phase 1: Discovery ───────────────────────────────────────────────────────

    it('phase 1 — discovery: calls Google Places and writes a business to Supabase', async () => {
      runStartedAt = new Date().toISOString()

      const input = scrapeClawAdapter.validateInput({
        mode: 'discover',
        wedgeSlug: 'residential_property_management',
        marketRegion: 'Clay County',
        textSearchPageSize: 5,
      })

      discoveryResult = (await scrapeClawAdapter.execute(
        input,
        ctx,
      )) as unknown as ScrapeClawDiscoveryWorkerResult

      expect(discoveryResult.mode).toBe('discover')

      // At least one genuinely new business must be inserted. If the test
      // user's DB already has all discovered businesses, the test can't proceed.
      expect(
        discoveryResult.insertedBusinesses.length,
        'Discovery found no new businesses for this market — try a different marketRegion',
      ).toBeGreaterThan(0)

      businessId = discoveryResult.insertedBusinesses[0]!.businessId

      console.log(
        `[E2E] Phase 1 ✓  Discovered: "${discoveryResult.insertedBusinesses[0]!.name}"` +
          ` → businessId: ${businessId}`,
      )
    }, 60_000)

    // ── Phase 2: Research ────────────────────────────────────────────────────────

    it('phase 2 — research: calls Anthropic to analyze the business website', async () => {
      expect(businessId, 'Phase 1 must pass first').not.toBeNull()

      // Fetch the business row so we have the canonical URL and city.
      const { data: business, error } = await supabase
        .from('scrapeclaw_businesses')
        .select('*')
        .eq('id', businessId!)
        .single()
      if (error) throw error

      const input = scrapeClawAdapter.validateInput({
        wedgeSlug: 'residential_property_management',
        marketCity: business.city ?? 'Orange Park',
        marketRegion: 'Clay County, FL',
        candidates: [
          {
            name: business.name,
            canonicalWebsiteUrl: business.canonical_website_url!,
            businessType: business.business_type ?? undefined,
            city: business.city ?? undefined,
            state: business.state ?? undefined,
          },
        ],
        maxCandidates: 1,
        maxPagesPerBusiness: 3,
      })

      researchResult = (await scrapeClawAdapter.execute(
        input,
        ctx,
      )) as unknown as ScrapeClawResearchWorkerResult

      expect(researchResult.mode).toBe('research')
      expect(
        researchResult.rankedProspects.length,
        'Research returned no qualified prospects',
      ).toBeGreaterThan(0)

      console.log(
        `[E2E] Phase 2 ✓  Research: ${researchResult.rankedProspects.length} ranked prospect(s),` +
          ` ${researchResult.discardedBusinesses.length} discarded`,
      )
    }, 120_000)

    // ── Phase 3: Enrichment ──────────────────────────────────────────────────────

    it('phase 3 — enrichment: calls Anthropic to enrich the prospect', async () => {
      expect(researchResult, 'Phase 2 must pass first').not.toBeNull()
      expect(researchResult!.rankedProspects.length).toBeGreaterThan(0)

      const input = scrapeClawAdapter.validateInput({
        mode: 'enrich',
        wedgeSlug: 'residential_property_management',
        marketCity: researchResult!.marketCity,
        marketRegion: researchResult!.marketRegion,
        // Take the top-ranked prospect only to keep the run fast.
        prospects: researchResult!.rankedProspects.slice(0, 1),
        maxProspects: 1,
      })

      enrichmentResult = (await scrapeClawAdapter.execute(
        input,
        ctx,
      )) as unknown as ScrapeClawEnrichmentWorkerResult

      expect(enrichmentResult.mode).toBe('enrich')
      expect(
        enrichmentResult.enrichedProspects.length,
        'Enrichment returned no prospects',
      ).toBeGreaterThan(0)

      if (enrichmentResult.warnings.length > 0) {
        console.warn('[E2E] Enrichment warnings:', enrichmentResult.warnings)
      }

      console.log(
        `[E2E] Phase 3 ✓  Enrichment: ${enrichmentResult.enrichedProspects.length} prospect(s)` +
          ` (usedFallback=${enrichmentResult.enrichedProspects[0]!.usedFallback})`,
      )
    }, 120_000)

    // ── Phase 4: Persist ─────────────────────────────────────────────────────────
    // runScrapeClawAgent1Enrichment is a pure function — it does not write to
    // Supabase. This step inserts the enrichment output directly, standing in
    // for the future 'persist' adapter mode.

    it('phase 4 — persist: writes enriched prospect and evidence items to Supabase', async () => {
      expect(businessId, 'Phase 1 must pass first').not.toBeNull()
      expect(enrichmentResult, 'Phase 3 must pass first').not.toBeNull()

      const enriched = enrichmentResult!.enrichedProspects[0]!

      const prospectInsert: ScrapeClawProspectInsert = {
        user_id: userId,
        business_id: businessId!,
        status: enriched.enrichedProspect.status,
        wedge_slug: enriched.enrichedProspect.wedgeSlug,
        market_city: enriched.enrichedProspect.marketCity,
        market_region: enriched.enrichedProspect.marketRegion,
        fit_score: enriched.enrichedProspect.fitScore,
        use_case_hypothesis: enriched.enrichedProspect.useCaseHypothesis,
        data_need_hypothesis: enriched.enrichedProspect.dataNeedHypothesis,
        demo_type_recommendation: enriched.enrichedProspect.demoTypeRecommendation,
        outreach_angle: enriched.enrichedProspect.outreachAngle,
        confidence_level: enriched.enrichedProspect.confidenceLevel,
      }

      const { data: prospect, error: prospectError } = await supabase
        .from('scrapeclaw_prospects')
        .insert(prospectInsert)
        .select('id')
        .single()
      if (prospectError) throw prospectError

      prospectId = prospect.id

      // Insert all evidence items, binding them to the new prospect.
      const evidenceInserts: ScrapeClawEvidenceItemInsert[] = enriched.evidenceItems.map(
        (item) => ({
          user_id: userId,
          prospect_id: prospectId!,
          page_kind: item.pageKind,
          source_url: item.sourceUrl,
          observed_at: item.observedAt,
          title: item.title,
          snippet: item.snippet,
          extracted_facts: item.extractedFacts,
          source_confidence: item.sourceConfidence,
        }),
      )

      const { error: evidenceError } = await supabase
        .from('scrapeclaw_evidence_items')
        .insert(evidenceInserts)
      if (evidenceError) throw evidenceError

      console.log(
        `[E2E] Phase 4 ✓  Persisted prospect → ${prospectId}` +
          ` with ${evidenceInserts.length} evidence item(s)`,
      )
    }, 30_000)

    // ── Phase 5: Package ─────────────────────────────────────────────────────────

    it('phase 5 — package: runs insight engine and writes demo package to Supabase', async () => {
      expect(prospectId, 'Phase 4 must pass first').not.toBeNull()

      const input = scrapeClawAdapter.validateInput({
        mode: 'package',
        prospectId: prospectId!,
      })

      packageResult = (await scrapeClawAdapter.execute(
        input,
        ctx,
      )) as unknown as ScrapeClawPackageWorkerResult

      expect(packageResult.mode).toBe('package')
      expect(packageResult.status).toBe('draft')
      expect(packageResult.packageId).toBeTruthy()
      expect(packageResult.package).not.toBeNull()
      expect(packageResult.validationErrors).toHaveLength(0)

      packageId = packageResult.packageId

      // Three attachment kinds: csv, json, manifest.
      const kinds = packageResult.attachments.map((a) => a.kind).sort()
      expect(kinds).toEqual(['csv', 'json', 'manifest'])

      // Every attachment must have a valid sha256 and non-zero byte size.
      for (const a of packageResult.attachments) {
        expect(a.sha256).toMatch(/^[a-f0-9]{64}$/)
        expect(a.byteSize).toBeGreaterThan(0)
      }

      // Verify prospect status was flipped to 'packaged' in the DB.
      const { data: updatedProspect } = await supabase
        .from('scrapeclaw_prospects')
        .select('status')
        .eq('id', prospectId!)
        .single()
      expect(updatedProspect?.status).toBe('packaged')

      // Verify the package row in the DB reflects 'draft' status.
      const { data: pkgRow } = await supabase
        .from('scrapeclaw_demo_packages')
        .select('status, summary_markdown')
        .eq('id', packageId)
        .single()
      expect(pkgRow?.status).toBe('draft')
      expect(pkgRow?.summary_markdown).toBeTruthy()

      const pkg = packageResult.package!
      console.log(
        `[E2E] Phase 5 ✓  Package generated → ${packageId}` +
          `\n          Threat: ${pkg.report.threat.level.toUpperCase()} (score ${pkg.report.threat.score})` +
          `\n          Headline: "${pkg.report.headline}"`,
      )
    }, 60_000)

    // ── Phase 6: Idempotency ────────────────────────────────────────────────────

    it('phase 6 — idempotency: re-packaging the same prospect returns already_packaged', async () => {
      expect(prospectId, 'Phase 4 must pass first').not.toBeNull()

      const input = scrapeClawAdapter.validateInput({
        mode: 'package',
        prospectId: prospectId!,
      })

      const result = (await scrapeClawAdapter.execute(
        input,
        ctx,
      )) as unknown as ScrapeClawPackageWorkerResult

      expect(result.status).toBe('failed')
      expect(result.validationErrors[0]?.code).toBe('already_packaged')
      console.log('[E2E] Phase 6 ✓  Idempotency guard confirmed')
    }, 30_000)

    // ── Phase 7: Save results ────────────────────────────────────────────────────

    it('phase 7 — saves full pipeline results to .integration-test-results/', () => {
      expect(packageResult, 'Phase 5 must pass first').not.toBeNull()

      const pkg = packageResult!.package!

      // Decode the four artifacts from base64 for human-readable output.
      const summaryText = Buffer.from(pkg.summary.bytesBase64, 'base64').toString('utf8')
      const csvText = Buffer.from(pkg.csv.bytesBase64, 'base64').toString('utf8')
      const jsonContent = JSON.parse(
        Buffer.from(pkg.json.bytesBase64, 'base64').toString('utf8'),
      ) as unknown
      const manifestContent = JSON.parse(
        Buffer.from(pkg.manifest.bytesBase64, 'base64').toString('utf8'),
      ) as unknown

      const output = {
        runAt: new Date().toISOString(),
        userId,
        businessId,
        prospectId,
        packageId,

        // ── Phase outputs ──────────────────────────────────────────────────────
        discovery: {
          insertedBusinesses: discoveryResult!.insertedBusinesses,
          discardedCount: discoveryResult!.discardedCandidates.length,
          plannedQueries: discoveryResult!.plannedQueries,
        },

        research: {
          marketCity: researchResult!.marketCity,
          marketRegion: researchResult!.marketRegion,
          rankedProspects: researchResult!.rankedProspects.map((p) => ({
            business: p.business,
            prospect: p.prospect,
            evidenceCount: p.evidenceItems.length,
            reasoning: p.reasoning,
          })),
          discardedCount: researchResult!.discardedBusinesses.length,
        },

        enrichment: {
          enrichedProspects: enrichmentResult!.enrichedProspects.map((p) => ({
            business: p.business,
            enrichedProspect: p.enrichedProspect,
            evidenceCount: p.evidenceItems.length,
            provider: p.provider,
            model: p.model,
            promptVersion: p.promptVersion,
            usedFallback: p.usedFallback,
            llmReasoning: p.llmReasoning,
          })),
          warnings: enrichmentResult!.warnings,
        },

        // ── Package output (Phase 5) ───────────────────────────────────────────
        package: {
          packageId,
          prospectId,
          status: packageResult!.status,
          generatedAt: packageResult!.generatedAt,
          schemaVersion: pkg.schemaVersion,

          // Insight report
          report: {
            businessName: pkg.report.businessName,
            wedgeSlug: pkg.report.wedgeSlug,
            marketCity: pkg.report.marketCity,
            marketRegion: pkg.report.marketRegion,
            threat: pkg.report.threat,
            headline: pkg.report.headline,
            callToAction: pkg.report.callToAction,
            insights: pkg.report.insights,
          },

          // Attachment metadata (no base64 — use decoded text below)
          attachments: packageResult!.attachments,

          // Decoded artifact content
          artifacts: {
            summary: {
              filename: pkg.summary.filename,
              mimeType: pkg.summary.mimeType,
              byteSize: pkg.summary.byteSize,
              sha256: pkg.summary.sha256,
              text: summaryText,
            },
            csv: {
              filename: pkg.csv.filename,
              mimeType: pkg.csv.mimeType,
              byteSize: pkg.csv.byteSize,
              sha256: pkg.csv.sha256,
              rowCount: pkg.csv.rowCount,
              text: csvText,
            },
            json: {
              filename: pkg.json.filename,
              mimeType: pkg.json.mimeType,
              byteSize: pkg.json.byteSize,
              sha256: pkg.json.sha256,
              content: jsonContent,
            },
            manifest: {
              filename: pkg.manifest.filename,
              mimeType: pkg.manifest.mimeType,
              byteSize: pkg.manifest.byteSize,
              sha256: pkg.manifest.sha256,
              content: manifestContent,
            },
          },
        },
      }

      const __dirname = dirname(fileURLToPath(import.meta.url))
      const resultsDir = resolve(__dirname, '.integration-test-results')
      mkdirSync(resultsDir, { recursive: true })

      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
      const filepath = resolve(resultsDir, `${timestamp}.json`)
      writeFileSync(filepath, JSON.stringify(output, null, 2), 'utf8')

      console.log(`[E2E] Phase 7 ✓  Results saved → ${filepath}`)
      console.log(`\n${'─'.repeat(60)}`)
      console.log('EXECUTIVE SUMMARY (decoded from base64):')
      console.log('─'.repeat(60))
      console.log(summaryText)
      console.log('─'.repeat(60))
    })
  },
)
