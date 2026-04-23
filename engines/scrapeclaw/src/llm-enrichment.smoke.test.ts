/**
 * Smoke tests for the end-to-end ScrapeClaw enrichment pipeline.
 *
 * Requires both API keys — skipped automatically when either is absent:
 *
 *   PowerShell:
 *   $env:SCRAPECLAW_GOOGLE_PLACES_API_KEY="<key>"
 *   $env:SCRAPECLAW_ANTHROPIC_API_KEY="<key>"
 *   npx vitest run llm-enrichment.smoke.test.ts
 *
 * Test 1 — plumbing (discovery order):
 *   Discovers 20 places → resolves websites → researches the first 5 with
 *   websites → enriches the top 3 by deterministic fitScore.
 *   Purpose: verify the full pipeline wires together without errors.
 *
 * Test 2 — Phase 4a production pipeline:
 *   Discovers 20 places → resolves ALL websites in parallel → runs the
 *   PRODUCTION pre-rank module (URL eligibility + decomposed pre-rank) →
 *   researches the top 5 by pre-rank → enriches the top 3 by deterministic
 *   fitScore.
 *   Purpose: exercise the production path end-to-end, including URL
 *   eligibility filtering, pre-rank rationale, deterministic score
 *   decomposition, and quality summaries.
 *
 * Assertions are structural by design (smoke, not contract): we verify shapes,
 * ranges, and that the LLM did not fall back on any prospect.
 *
 * How to run?
 * PowerShell:
 *   $env:SCRAPECLAW_GOOGLE_PLACES_API_KEY="<your-google-key>"
 *   $env:SCRAPECLAW_ANTHROPIC_API_KEY="<your-anthropic-key>"
 *
 *   To run only the production-pipeline test (Test 2 by name pattern):
 *   cd engines/scrapeclaw
 *   npx vitest run --reporter=verbose llm-enrichment.smoke.test.ts -t "production pipeline"
 *
 *   To run both smoke tests:
 *   cd engines/scrapeclaw
 *   npx vitest run --reporter=verbose llm-enrichment.smoke.test.ts
 *
 *   From the monorepo root (either):
 *   npx vitest run --reporter=verbose --project scrapeclaw engines/scrapeclaw/src/llm-enrichment.smoke.test.ts -t "production pipeline"
 */

import { describe, expect, it } from 'vitest'
import { discoverPlaceSeeds, resolvePlaceSeedWebsite } from './discovery.js'
import { runScrapeClawProductionPreRank } from './ranking.js'
import { runScrapeClawAgent1Research } from './research.js'
import { runScrapeClawAgent1Enrichment } from './llm-enrichment.js'
import { SCRAPECLAW_DEFAULT_ENRICHMENT_MODEL } from './constants.js'

const GOOGLE_API_KEY = process.env['SCRAPECLAW_GOOGLE_PLACES_API_KEY']
const ANTHROPIC_API_KEY = process.env['SCRAPECLAW_ANTHROPIC_API_KEY']
const ENRICHMENT_MODEL =
  process.env['SCRAPECLAW_ENRICHMENT_MODEL'] ?? SCRAPECLAW_DEFAULT_ENRICHMENT_MODEL

const HUB = 'Orange Park'
const WEDGE_SLUG = 'residential_property_management' as const
const MARKET_CITY = 'Orange Park'
const MARKET_REGION = 'Clay County'

describe.skipIf(!GOOGLE_API_KEY || !ANTHROPIC_API_KEY)(
  'ScrapeClaw enrichment smoke test (live — requires Google Places + Anthropic API keys)',
  () => {
    it('discovers 20 places, researches the first 5 with websites, and enriches the top 3 prospects', async () => {
      // ── Phase 1: Discovery ───────────────────────────────────────────────
      console.log(`\n[Phase 1] Discovering places in ${HUB} via Google Places (pageSize 20)…`)

      const discovery = await discoverPlaceSeeds(
        {
          mode: 'discover',
          wedgeSlug: WEDGE_SLUG,
          marketRegion: MARKET_REGION,
          hubNames: [HUB],
          textSearchPageSize: 20,
          minPrimaryResultsBeforeFallback: 1,
        },
        { apiKey: GOOGLE_API_KEY! },
      )

      console.log(`[Phase 1] Seeds discovered: ${discovery.placeSeeds.length}`)
      console.log('[Phase 1] placeSeeds:', JSON.stringify(discovery.placeSeeds, null, 2))

      expect(discovery.placeSeeds.length).toBeGreaterThan(0)

      // ── Phase 2: Website resolution (parallel) ───────────────────────────
      console.log(
        `\n[Phase 2] Resolving websites for ${discovery.placeSeeds.length} seeds (parallel)…`,
      )

      const resolved = (
        await Promise.all(
          discovery.placeSeeds.map((seed) =>
            resolvePlaceSeedWebsite(seed, { apiKey: GOOGLE_API_KEY! }),
          ),
        )
      ).filter((c) => c !== null)

      console.log(
        `[Phase 2] Seeds with a website: ${resolved.length} / ${discovery.placeSeeds.length}`,
      )
      console.log('[Phase 2] resolvedCandidates:', JSON.stringify(resolved, null, 2))

      expect(resolved.length).toBeGreaterThan(0)

      // ── Phase 3: Research (first 5 resolved candidates) ──────────────────
      const researchCandidates = resolved.slice(0, 5).map((c) => ({
        name: c.name,
        canonicalWebsiteUrl: c.websiteUri,
      }))

      console.log(
        `\n[Phase 3] Running deterministic research on ${researchCandidates.length} candidates…`,
      )
      researchCandidates.forEach((c, i) => {
        console.log(`  [${i + 1}] ${c.name} — ${c.canonicalWebsiteUrl}`)
      })

      const research = await runScrapeClawAgent1Research({
        wedgeSlug: WEDGE_SLUG,
        marketCity: MARKET_CITY,
        marketRegion: MARKET_REGION,
        candidates: researchCandidates,
      })

      console.log(`\n[Phase 3] rankedProspects (${research.rankedProspects.length}):`)
      research.rankedProspects.forEach((p, i) => {
        console.log(
          `  [${i + 1}] ${p.business.name} — fitScore: ${p.prospect.fitScore} — confidence: ${p.prospect.confidenceLevel}`,
        )
      })
      console.log(
        `[Phase 3] discardedBusinesses (${research.discardedBusinesses.length}):`,
        JSON.stringify(research.discardedBusinesses, null, 2),
      )

      expect(research.rankedProspects.length).toBeGreaterThan(0)

      // ── Phase 4: Enrichment (top 3 by fitScore) ──────────────────────────
      const top3 = research.rankedProspects.slice(0, 3)

      console.log(`\n[Phase 4] Enriching top ${top3.length} prospect(s) with ${ENRICHMENT_MODEL}…`)
      top3.forEach((p, i) => {
        console.log(`  [${i + 1}] ${p.business.name} — baseline fitScore: ${p.prospect.fitScore}`)
      })

      const enrichment = await runScrapeClawAgent1Enrichment(
        {
          mode: 'enrich',
          wedgeSlug: WEDGE_SLUG,
          marketCity: MARKET_CITY,
          marketRegion: MARKET_REGION,
          prospects: top3,
          maxProspects: 3,
        },
        {
          apiKey: ANTHROPIC_API_KEY!,
          model: ENRICHMENT_MODEL,
        },
      )

      // ── Results ──────────────────────────────────────────────────────────
      console.log('\n[Phase 4] ── Enrichment results ──')
      enrichment.enrichedProspects.forEach((ep, i) => {
        console.log(`\n  [${i + 1}] ${ep.business.name}`)
        console.log(`        usedFallback:             ${ep.usedFallback}`)
        console.log(`        model:                    ${ep.model}`)
        console.log(`        baseline fitScore:         ${ep.baseProspect.fitScore}`)
        console.log(`        enriched fitScore:         ${ep.enrichedProspect.fitScore}`)
        console.log(`        confidence:                ${ep.enrichedProspect.confidenceLevel}`)
        console.log(
          `        demoTypeRecommendation:    ${ep.enrichedProspect.demoTypeRecommendation}`,
        )
        console.log(`        useCaseHypothesis:         ${ep.enrichedProspect.useCaseHypothesis}`)
        console.log(`        dataNeedHypothesis:        ${ep.enrichedProspect.dataNeedHypothesis}`)
        console.log(`        outreachAngle:             ${ep.enrichedProspect.outreachAngle}`)
        console.log(`        llmReasoning (${ep.llmReasoning.length}):`)
        ep.llmReasoning.forEach((r) => console.log(`          - ${r}`))
        console.log(`        deterministicReasoning (${ep.deterministicReasoning.length}):`)
        ep.deterministicReasoning.forEach((r) => console.log(`          - ${r}`))
      })

      if (enrichment.warnings.length > 0) {
        console.warn('\n[Phase 4] warnings:', JSON.stringify(enrichment.warnings, null, 2))
      }

      console.log('\n[Phase 4] Full enrichment result (JSON):')
      console.log(JSON.stringify(enrichment, null, 2))

      // ── Assertions ───────────────────────────────────────────────────────
      expect(enrichment.mode).toBe('enrich')
      expect(enrichment.wedgeSlug).toBe(WEDGE_SLUG)
      expect(enrichment.enrichedProspects.length).toBeGreaterThanOrEqual(1)
      expect(enrichment.enrichedProspects.length).toBeLessThanOrEqual(3)

      for (const ep of enrichment.enrichedProspects) {
        expect(ep.usedFallback).toBe(false)
        expect(ep.enrichedProspect.fitScore).toBeGreaterThanOrEqual(0)
        expect(ep.enrichedProspect.fitScore).toBeLessThanOrEqual(1)
        expect(ep.llmReasoning.length).toBeGreaterThanOrEqual(1)
        expect(['low', 'medium', 'high']).toContain(ep.enrichedProspect.confidenceLevel)
      }
    }, 180_000)

    it('production pipeline: discovery → resolve → production pre-rank → research top 5 → enrich top 3', async () => {
      // ── Phase 1: Discovery ─────────────────────────────────────────────
      console.log(`\n[Phase 1] Discovering places in ${HUB} via Google Places (pageSize 20)…`)

      const discovery = await discoverPlaceSeeds(
        {
          mode: 'discover',
          wedgeSlug: WEDGE_SLUG,
          marketRegion: MARKET_REGION,
          hubNames: [HUB],
          textSearchPageSize: 20,
          minPrimaryResultsBeforeFallback: 1,
        },
        { apiKey: GOOGLE_API_KEY! },
      )

      console.log(`[Phase 1] Seeds discovered: ${discovery.placeSeeds.length}`)
      expect(discovery.placeSeeds.length).toBeGreaterThan(0)

      // ── Phase 2: Resolve ALL websites in parallel ──────────────────────
      console.log(
        `\n[Phase 2] Resolving websites for all ${discovery.placeSeeds.length} seeds in parallel…`,
      )

      const resolved = (
        await Promise.all(
          discovery.placeSeeds.map((seed) =>
            resolvePlaceSeedWebsite(seed, { apiKey: GOOGLE_API_KEY! }),
          ),
        )
      ).filter((c) => c !== null)

      console.log(
        `[Phase 2] Seeds with a website: ${resolved.length} / ${discovery.placeSeeds.length}`,
      )
      console.log('[Phase 2] resolvedCandidates:')
      resolved.forEach((c, i) => {
        console.log(`  [${i + 1}] ${c.name} — ${c.websiteUri}  (kind=${c.queryKind})`)
      })
      expect(resolved.length).toBeGreaterThan(0)

      // ── Phase 3: Production pre-rank ───────────────────────────────────
      console.log(`\n[Phase 3] Running production pre-rank…`)
      const preRank = runScrapeClawProductionPreRank({
        candidates: resolved,
        wedgeSlug: WEDGE_SLUG,
      })

      console.log(`[Phase 3] Ranked candidates (${preRank.ranked.length}):`)
      preRank.ranked.forEach((c, i) => {
        console.log(
          `  [${i + 1}] score=${c.preRankScore.toFixed(4).padStart(6)}  kind=${c.queryKind.padEnd(8)}  ${c.name}  —  ${c.canonicalWebsiteUrl}`,
        )
        console.log(`        breakdown: ${JSON.stringify(c.scoreBreakdown)}`)
        c.rationale.forEach((r) => console.log(`        - ${r}`))
      })

      if (preRank.discarded.length > 0) {
        console.log(`\n[Phase 3] Discarded by pre-rank (${preRank.discarded.length}):`)
        preRank.discarded.forEach((d, i) => {
          console.log(
            `  [${i + 1}] ${d.name} — ${d.originalUrl}  (${d.eligibility?.reason ?? d.reason})`,
          )
        })
      }

      const top5 = preRank.ranked.slice(0, 5)
      console.log(`\n[Phase 3] Top 5 by pre-rank selected for research:`)
      top5.forEach((c, i) => {
        console.log(`  [${i + 1}] ${c.name} — ${c.canonicalWebsiteUrl}  (${c.preRankScore})`)
      })

      // ── Phase 4: Research top 5 ────────────────────────────────────────
      const researchCandidates = top5.map((c) => ({
        name: c.name,
        canonicalWebsiteUrl: c.canonicalWebsiteUrl,
      }))

      console.log(
        `\n[Phase 4] Running deterministic research on ${researchCandidates.length} pre-ranked candidates…`,
      )

      const research = await runScrapeClawAgent1Research({
        wedgeSlug: WEDGE_SLUG,
        marketCity: MARKET_CITY,
        marketRegion: MARKET_REGION,
        candidates: researchCandidates,
      })

      console.log(
        `\n[Phase 4] rankedProspects after research (${research.rankedProspects.length}):`,
      )
      research.rankedProspects.forEach((p, i) => {
        console.log(
          `  [${i + 1}] fitScore=${p.prospect.fitScore.toFixed(4)}  confidence=${p.prospect.confidenceLevel.padEnd(6)}  ${p.business.name}`,
        )
        if (p.scoreBreakdown) {
          console.log(`        breakdown:`)
          console.log(
            `          wedge:${p.scoreBreakdown.wedgeMatchScore} inv:${p.scoreBreakdown.inventorySignalScore} loc:${p.scoreBreakdown.localityScore} site:${p.scoreBreakdown.websiteQualityScore} contact:${p.scoreBreakdown.contactQualityScore} richness:${p.scoreBreakdown.evidenceRichnessScore} → ${p.scoreBreakdown.finalScore}`,
          )
          p.scoreBreakdown.rationale.forEach((r) => console.log(`        - ${r}`))
        }
        if (p.contactSummary) {
          console.log(
            `        contacts: primary=${p.contactSummary.primaryBusinessEmail ?? '(none)'} phone=${p.contactSummary.primaryBusinessPhone ?? '(none)'} confidence=${p.contactSummary.contactConfidence}`,
          )
          if (p.contactSummary.rejectedContacts.length > 0) {
            console.log(
              `        rejected: ${p.contactSummary.rejectedContacts.length} (${p.contactSummary.rejectedContacts
                .map((r) => r.reason)
                .join(', ')})`,
            )
          }
        }
        if (p.qualitySummary) {
          console.log(
            `        quality: distinctPages=${p.qualitySummary.distinctEvidencePageCount} homepageOnly=${p.qualitySummary.homepageOnly} compromised=${p.qualitySummary.compromisedPages.length} warnings=[${p.qualitySummary.warnings.join(', ') || '(none)'}]`,
          )
        }
      })
      console.log(
        `[Phase 4] discardedBusinesses (${research.discardedBusinesses.length}):`,
        JSON.stringify(research.discardedBusinesses, null, 2),
      )

      expect(research.rankedProspects.length).toBeGreaterThan(0)

      // ── Phase 5: Enrich top 3 by deterministic fitScore ────────────────
      const top3 = research.rankedProspects.slice(0, 3)

      console.log(`\n[Phase 5] Enriching top ${top3.length} prospect(s) with ${ENRICHMENT_MODEL}…`)
      top3.forEach((p, i) => {
        console.log(`  [${i + 1}] ${p.business.name} — baseline fitScore: ${p.prospect.fitScore}`)
      })

      const enrichment = await runScrapeClawAgent1Enrichment(
        {
          mode: 'enrich',
          wedgeSlug: WEDGE_SLUG,
          marketCity: MARKET_CITY,
          marketRegion: MARKET_REGION,
          prospects: top3,
          maxProspects: 3,
        },
        {
          apiKey: ANTHROPIC_API_KEY!,
          model: ENRICHMENT_MODEL,
        },
      )

      // ── Results ────────────────────────────────────────────────────────
      console.log('\n[Phase 5] ── Enrichment deltas (baseline → enriched) ──')
      enrichment.enrichedProspects.forEach((ep, i) => {
        console.log(`\n  [${i + 1}] ${ep.business.name}`)
        console.log(`        usedFallback:           ${ep.usedFallback}`)
        console.log(`        model:                  ${ep.model}`)
        console.log(
          `        fitScore:               ${ep.baseProspect.fitScore} → ${ep.enrichedProspect.fitScore}`,
        )
        console.log(
          `        confidence:             ${ep.baseProspect.confidenceLevel} → ${ep.enrichedProspect.confidenceLevel}`,
        )
        console.log(
          `        demoTypeRecommendation: ${ep.baseProspect.demoTypeRecommendation} → ${ep.enrichedProspect.demoTypeRecommendation}`,
        )
        console.log(`        useCaseHypothesis:      ${ep.enrichedProspect.useCaseHypothesis}`)
        console.log(`        dataNeedHypothesis:     ${ep.enrichedProspect.dataNeedHypothesis}`)
        console.log(`        outreachAngle:          ${ep.enrichedProspect.outreachAngle}`)
        console.log(`        llmReasoning (${ep.llmReasoning.length}):`)
        ep.llmReasoning.forEach((r) => console.log(`          - ${r}`))
      })

      if (enrichment.warnings.length > 0) {
        console.warn('\n[Phase 5] warnings:', JSON.stringify(enrichment.warnings, null, 2))
      }

      console.log('\n[Phase 5] Full enrichment result (JSON):')
      console.log(JSON.stringify(enrichment, null, 2))

      // ── Assertions ─────────────────────────────────────────────────────
      expect(enrichment.mode).toBe('enrich')
      expect(enrichment.wedgeSlug).toBe(WEDGE_SLUG)
      expect(enrichment.enrichedProspects.length).toBeGreaterThanOrEqual(1)
      expect(enrichment.enrichedProspects.length).toBeLessThanOrEqual(3)

      for (const ep of enrichment.enrichedProspects) {
        expect(ep.usedFallback).toBe(false)
        expect(ep.enrichedProspect.fitScore).toBeGreaterThanOrEqual(0)
        expect(ep.enrichedProspect.fitScore).toBeLessThanOrEqual(1)
        expect(ep.llmReasoning.length).toBeGreaterThanOrEqual(1)
        expect(['low', 'medium', 'high']).toContain(ep.enrichedProspect.confidenceLevel)
      }

      // Phase 4a: deterministic prospects must carry the new metadata.
      for (const p of research.rankedProspects) {
        expect(p.scoreBreakdown).toBeDefined()
        expect(p.scoreBreakdown!.finalScore).toBe(p.prospect.fitScore)
        expect(p.contactSummary).toBeDefined()
        expect(p.qualitySummary).toBeDefined()
        expect(p.qualitySummary!.distinctEvidencePageCount).toBeGreaterThan(0)
      }
    }, 180_000)
  },
)
