import {
  assembleDemoPackage,
  CLAY_COUNTY_RESIDENTIAL_PM_BASELINE,
  discoverPlaceSeeds,
  resolvePlaceSeedWebsite,
  runScrapeClawAgent1Enrichment,
  runScrapeClawAgent1Research,
  type ScrapeClawResolvedWebsiteCandidate,
} from '@clawos/scrapeclaw-engine'
import {
  buildScrapeClawAttachmentPath,
  createServerClient,
  SCRAPECLAW_PACKAGE_ARTIFACT_FILENAMES,
  SCRAPECLAW_PACKAGE_SCHEMA_VERSION,
  type Json,
  type ScrapeClawAssembledPackage,
  type ScrapeClawBusinessInsert,
  type ScrapeClawBusinessRow,
  type ScrapeClawDemoPackageInsert,
  type ScrapeClawDiscoveryDiscardReason,
  type ScrapeClawDiscoveryDiscardedCandidate,
  type ScrapeClawDiscoveryInsertedBusiness,
  type ScrapeClawDiscoveryWorkerInput,
  type ScrapeClawEnrichmentWorkerInput,
  type ScrapeClawPackageAttachmentInsert,
  type ScrapeClawPackageWorkerInput,
  type ScrapeClawPackageWorkerResult,
  type ScrapeClawResearchWorkerInput,
  type ScrapeClawWorkerInput,
  type VerifiedSkillExecutionContext,
} from '@clawos/shared'
import { ScrapeClawWorkerInputSchema } from '@clawos/security'
import { buildDiscardInsert, ScrapeClawDiscoveryStore } from './discovery-store.js'
import { ScrapeClawPackageStore } from './package-store.js'

function getGooglePlacesApiKey(): string {
  const apiKey =
    process.env['SCRAPECLAW_GOOGLE_PLACES_API_KEY'] ?? process.env['GOOGLE_PLACES_API_KEY']

  if (!apiKey) {
    throw new Error('SCRAPECLAW_GOOGLE_PLACES_API_KEY is required for ScrapeClaw discovery')
  }

  return apiKey
}

function getScrapeClawAnthropicApiKey(): string {
  const apiKey =
    process.env['SCRAPECLAW_ANTHROPIC_API_KEY'] ??
    process.env['CLAWOS_ANTHROPIC_KEY'] ??
    process.env['CAREERCLAW_ANTHROPIC_KEY']

  if (!apiKey) {
    throw new Error('SCRAPECLAW_ANTHROPIC_API_KEY is required for ScrapeClaw enrichment')
  }

  return apiKey
}

function getScrapeClawEnrichmentModel(): string | undefined {
  return process.env['SCRAPECLAW_ENRICHMENT_MODEL']?.trim() || undefined
}

function normaliseCanonicalWebsiteUrl(value: string): string {
  const url = new URL(value)
  url.hash = ''
  url.search = ''
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '')
  if (url.pathname !== '/') {
    url.pathname = url.pathname.replace(/\/+$/, '') || '/'
  }
  return url.toString()
}

function inferCityStateFromAddress(formattedAddress: string | null): {
  city: string | null
  state: string | null
} {
  if (!formattedAddress) return { city: null, state: null }

  const parts = formattedAddress
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

  const city = parts.length >= 3 ? (parts.at(-3) ?? null) : null
  const statePart = parts.length >= 2 ? (parts.at(-2) ?? null) : null
  const state = statePart ? (statePart.split(/\s+/)[0] ?? null) : null

  return { city, state }
}

function buildBusinessInsert(params: {
  userId: string
  wedgeSlug: ScrapeClawDiscoveryWorkerInput['wedgeSlug']
  candidate: ScrapeClawResolvedWebsiteCandidate
}): ScrapeClawBusinessInsert {
  const canonicalWebsiteUrl = normaliseCanonicalWebsiteUrl(params.candidate.websiteUri)
  const { city, state } = inferCityStateFromAddress(params.candidate.formattedAddress)

  return {
    user_id: params.userId,
    name: params.candidate.name,
    status: 'discovered',
    canonical_website_url: canonicalWebsiteUrl,
    source_url: null,
    business_type:
      params.candidate.queryKind === 'primary' ? 'Property Management' : 'Real Estate Agency',
    city,
    state,
    formatted_address: params.candidate.formattedAddress,
    service_area_text: null,
    niche_slug: params.wedgeSlug,
    discovery_provider: params.candidate.provider,
    discovery_external_id: params.candidate.placeId,
    discovery_query: params.candidate.queryText,
    discovered_at: new Date().toISOString(),
  }
}

async function executeResearch(
  input: ScrapeClawResearchWorkerInput,
): Promise<Record<string, unknown>> {
  return (await runScrapeClawAgent1Research(input)) as unknown as Record<string, unknown>
}

async function executeEnrichment(
  input: ScrapeClawEnrichmentWorkerInput,
): Promise<Record<string, unknown>> {
  return (await runScrapeClawAgent1Enrichment(input, {
    apiKey: getScrapeClawAnthropicApiKey(),
    model: getScrapeClawEnrichmentModel(),
  })) as unknown as Record<string, unknown>
}

function buildMergePatch(
  existing: ScrapeClawBusinessRow,
  incoming: ReturnType<typeof buildBusinessInsert>,
): Partial<ScrapeClawBusinessInsert> {
  return {
    business_type: existing.business_type ?? incoming.business_type,
    city: existing.city ?? incoming.city,
    state: existing.state ?? incoming.state,
    formatted_address: existing.formatted_address ?? incoming.formatted_address,
    discovery_query: existing.discovery_query ?? incoming.discovery_query,
  }
}

async function executeDiscovery(
  input: ScrapeClawDiscoveryWorkerInput,
  ctx: VerifiedSkillExecutionContext,
): Promise<Record<string, unknown>> {
  const apiKey = getGooglePlacesApiKey()
  const discovery = await discoverPlaceSeeds(input, { apiKey })
  const store = new ScrapeClawDiscoveryStore(createServerClient())

  // ── Phase 1: parallel dedup reads ───────────────────────────────────────────
  // Check every seed against existing discards and known place IDs simultaneously.
  const phase1 = await Promise.all(
    discovery.placeSeeds.map(async (seed) => {
      const [existingDiscard, existingPlace] = await Promise.all([
        store.findDiscard(ctx.userId, seed.provider, seed.placeId),
        store.findBusinessByPlaceId(ctx.userId, seed.provider, seed.placeId),
      ])
      return { seed, existingDiscard, existingPlace }
    }),
  )

  const needsResolution = phase1.filter((c) => !c.existingDiscard && !c.existingPlace)

  // ── Phase 2: parallel website resolution (HTTP) ──────────────────────────────
  // Only seeds that passed Phase 1 reach the Places Details API.
  const phase2 = await Promise.all(
    needsResolution.map(async ({ seed }) => ({
      seed,
      resolved: await resolvePlaceSeedWebsite(seed, { apiKey }),
    })),
  )

  const hasWebsite = phase2.filter((c) => c.resolved !== null) as Array<{
    seed: (typeof phase2)[number]['seed']
    resolved: NonNullable<(typeof phase2)[number]['resolved']>
  }>

  // ── Phase 3: parallel canonical-website dedup reads ──────────────────────────
  // Build the insert payload and check for an existing business at each URL.
  const phase3 = await Promise.all(
    hasWebsite.map(async ({ seed, resolved }) => {
      const businessInsert = buildBusinessInsert({
        userId: ctx.userId,
        wedgeSlug: input.wedgeSlug,
        candidate: resolved,
      })
      const existingWebsite = await store.findBusinessByCanonicalWebsite(
        ctx.userId,
        businessInsert.canonical_website_url!,
      )
      return { seed, resolved, businessInsert, existingWebsite }
    }),
  )

  // ── Phase 4: serial writes ───────────────────────────────────────────────────
  // Reads are done; writes are kept serial to avoid constraint races.
  // A Set guards against two seeds in the same run resolving to the same
  // canonical URL: the second seed is treated as duplicate_website without
  // hitting the unique index.
  const insertedBusinesses: ScrapeClawDiscoveryInsertedBusiness[] = []
  const discardedCandidates: ScrapeClawDiscoveryDiscardedCandidate[] = []
  const writtenWebsites = new Set<string>()

  for (const { seed, existingDiscard, existingPlace } of phase1) {
    if (existingDiscard) {
      discardedCandidates.push({
        placeId: seed.placeId,
        name: seed.name,
        reason: existingDiscard.reason as ScrapeClawDiscoveryDiscardReason,
        hubName: seed.hubName,
        queryText: seed.queryText,
        existingBusinessId: existingDiscard.linked_business_id,
      })
    } else if (existingPlace) {
      discardedCandidates.push({
        placeId: seed.placeId,
        name: seed.name,
        reason: 'duplicate_place',
        hubName: seed.hubName,
        queryText: seed.queryText,
        existingBusinessId: existingPlace.id,
      })
    }
  }

  for (const { seed, resolved } of phase2) {
    if (!resolved) {
      await store.upsertDiscard(
        buildDiscardInsert({
          userId: ctx.userId,
          provider: seed.provider,
          externalId: seed.placeId,
          reason: 'no_website',
          metadata: {
            name: seed.name,
            hubName: seed.hubName,
            queryText: seed.queryText,
            formattedAddress: seed.formattedAddress,
          },
        }),
      )
      discardedCandidates.push({
        placeId: seed.placeId,
        name: seed.name,
        reason: 'no_website',
        hubName: seed.hubName,
        queryText: seed.queryText,
      })
    }
  }

  for (const { seed, businessInsert, existingWebsite } of phase3) {
    const canonicalUrl = businessInsert.canonical_website_url!
    const isDuplicateInRun = writtenWebsites.has(canonicalUrl)

    if (existingWebsite || isDuplicateInRun) {
      if (existingWebsite) {
        await store.mergeBusinessMetadata(
          existingWebsite.id,
          ctx.userId,
          buildMergePatch(existingWebsite, businessInsert),
        )
      }
      await store.upsertDiscard(
        buildDiscardInsert({
          userId: ctx.userId,
          provider: seed.provider,
          externalId: seed.placeId,
          reason: 'duplicate_website',
          linkedBusinessId: existingWebsite?.id ?? null,
          metadata: {
            canonicalWebsiteUrl: canonicalUrl,
            hubName: seed.hubName,
            queryText: seed.queryText,
          },
        }),
      )
      discardedCandidates.push({
        placeId: seed.placeId,
        name: seed.name,
        reason: 'duplicate_website',
        hubName: seed.hubName,
        queryText: seed.queryText,
        existingBusinessId: existingWebsite?.id ?? null,
      })
      continue
    }

    writtenWebsites.add(canonicalUrl)
    const inserted = await store.insertBusiness(businessInsert)
    insertedBusinesses.push({
      businessId: inserted.id,
      name: inserted.name,
      canonicalWebsiteUrl: inserted.canonical_website_url ?? canonicalUrl,
      discoveryExternalId: inserted.discovery_external_id ?? seed.placeId,
      hubName: seed.hubName,
      queryText: seed.queryText,
    })
  }

  return {
    mode: 'discover',
    wedgeSlug: input.wedgeSlug,
    marketRegion: input.marketRegion,
    generatedAt: discovery.generatedAt,
    plannedQueries: discovery.plannedQueries,
    insertedBusinesses,
    discardedCandidates,
  }
}

// ── Phase 5 — Demo Package generation ────────────────────────────────────────

interface AttachmentPlan {
  kind: 'csv' | 'json' | 'manifest'
  filename: string
  mimeType: string
  byteSize: number
  sha256: string
  rowCount: number | null
}

function buildAttachmentPlans(pkg: ScrapeClawAssembledPackage): AttachmentPlan[] {
  return [
    {
      kind: 'csv',
      filename: SCRAPECLAW_PACKAGE_ARTIFACT_FILENAMES.csv,
      mimeType: pkg.csv.mimeType,
      byteSize: pkg.csv.byteSize,
      sha256: pkg.csv.sha256,
      rowCount: pkg.csv.rowCount,
    },
    {
      kind: 'json',
      filename: SCRAPECLAW_PACKAGE_ARTIFACT_FILENAMES.json,
      mimeType: pkg.json.mimeType,
      byteSize: pkg.json.byteSize,
      sha256: pkg.json.sha256,
      rowCount: null,
    },
    {
      kind: 'manifest',
      filename: SCRAPECLAW_PACKAGE_ARTIFACT_FILENAMES.manifest,
      mimeType: pkg.manifest.mimeType,
      byteSize: pkg.manifest.byteSize,
      sha256: pkg.manifest.sha256,
      rowCount: null,
    },
  ]
}

async function executePackage(
  input: ScrapeClawPackageWorkerInput,
  ctx: VerifiedSkillExecutionContext,
): Promise<Record<string, unknown>> {
  const store = new ScrapeClawPackageStore(createServerClient())

  // 1. Load the prospect (scoped to the caller). RLS also enforces this, but
  //    we pass userId explicitly for defense-in-depth.
  const prospect = await store.findProspect(ctx.userId, input.prospectId)
  if (!prospect) {
    const result: ScrapeClawPackageWorkerResult = {
      mode: 'package',
      packageId: '',
      prospectId: input.prospectId,
      status: 'failed',
      generatedAt: input.generatedAt ?? new Date().toISOString(),
      package: null,
      attachments: [],
      validationErrors: [
        {
          code: 'prospect_not_found',
          message: 'Prospect not found or not owned by the requesting user.',
        },
      ],
    }
    return result as unknown as Record<string, unknown>
  }

  // Guard: reject re-packaging a prospect that already has a finalized package.
  if (prospect.status === 'packaged') {
    const result: ScrapeClawPackageWorkerResult = {
      mode: 'package',
      packageId: '',
      prospectId: prospect.id,
      status: 'failed',
      generatedAt: input.generatedAt ?? prospect.updated_at,
      package: null,
      attachments: [],
      validationErrors: [
        {
          code: 'already_packaged',
          message: 'Prospect already has a finalized package; re-packaging is not allowed.',
        },
      ],
    }
    return result as unknown as Record<string, unknown>
  }

  // 2. Load the originating business.
  const business = await store.findBusiness(ctx.userId, prospect.business_id)
  if (!business) {
    const result: ScrapeClawPackageWorkerResult = {
      mode: 'package',
      packageId: '',
      prospectId: prospect.id,
      status: 'failed',
      generatedAt: input.generatedAt ?? prospect.updated_at,
      package: null,
      attachments: [],
      validationErrors: [
        {
          code: 'business_not_found',
          message: 'Business row missing for prospect; cannot build package.',
        },
      ],
    }
    return result as unknown as Record<string, unknown>
  }

  // 3. Load evidence. Empty evidence is not fatal — the report will flag
  //    every dimension as absent and the threat score will be 0.
  const evidence = await store.listEvidence(ctx.userId, prospect.id)

  // 4. Determine `generatedAt` deterministically.
  const generatedAt = input.generatedAt ?? prospect.updated_at

  // 5. Insert the demo package row FIRST so we have a stable UUID that the
  //    verification manifest can embed. Status is 'generating' briefly —
  //    flipped to 'draft' after attachments insert.
  const pkgInsert: ScrapeClawDemoPackageInsert = {
    user_id: ctx.userId,
    prospect_id: prospect.id,
    status: 'generating',
    template_slug: input.templateSlug ?? null,
    summary_markdown: null,
    manifest: {},
    evidence_references: [],
    validation_errors: [],
    schema_version: SCRAPECLAW_PACKAGE_SCHEMA_VERSION,
  }
  const pkgRow = await store.insertPackage(pkgInsert)

  // 6–9. Build artifacts and persist. On any failure, flip the row to 'failed'
  //      so it does not remain stuck in 'generating' indefinitely.
  try {
    // 6. Assemble artifacts.
    const assembled = assembleDemoPackage({
      prospect,
      business,
      evidence,
      baseline: CLAY_COUNTY_RESIDENTIAL_PM_BASELINE,
      generatedAt,
      packageId: pkgRow.id,
    })

    // 7. Insert attachment rows with logical storage paths (no upload yet).
    const plans = buildAttachmentPlans(assembled)
    const attachmentPayloads: ScrapeClawPackageAttachmentInsert[] = plans.map((plan) => ({
      user_id: ctx.userId,
      package_id: pkgRow.id,
      kind: plan.kind,
      storage_path: buildScrapeClawAttachmentPath({
        userId: ctx.userId,
        packageId: pkgRow.id,
        filename: plan.filename,
      }),
      mime_type: plan.mimeType,
      byte_size: plan.byteSize,
      sha256: plan.sha256,
      row_count: plan.rowCount,
      schema_version: SCRAPECLAW_PACKAGE_SCHEMA_VERSION,
    }))
    await store.insertAttachments(attachmentPayloads)

    // 8. Finalize the package row: promote to 'draft', stamp summary MD, and
    //    store evidence references inline. Phase 6 will handle the
    //    'draft' → 'approved' → 'finalized' transitions.
    const summaryText = Buffer.from(assembled.summary.bytesBase64, 'base64').toString('utf8')

    // Spread nested anchor objects into plain records so the values are
    // verifiably Json-compatible (specific interfaces lack the index signature).
    const evidenceReferences: Json = assembled.report.insights.map((i) => ({
      insightId: i.id,
      dimension: i.dimension,
      evidence: i.evidence.map((e) => ({
        evidenceId: e.evidenceId,
        sourceUrl: e.sourceUrl,
        pageKind: e.pageKind,
      })),
    }))

    await store.finalizePackageAsDraft({
      userId: ctx.userId,
      packageId: pkgRow.id,
      summaryMarkdown: summaryText,
      manifest: {
        schemaVersion: assembled.schemaVersion,
        threatLevel: assembled.report.threat.level,
        threatScore: assembled.report.threat.score,
        artifacts: plans.map((p) => ({
          filename: p.filename,
          kind: p.kind,
          sha256: p.sha256,
          byteSize: p.byteSize,
          rowCount: p.rowCount,
        })),
      } as Json,
      evidenceReferences,
    })

    // 9. Move the prospect to 'packaged' state.
    await store.markProspectPackaged(ctx.userId, prospect.id)

    const result: ScrapeClawPackageWorkerResult = {
      mode: 'package',
      packageId: pkgRow.id,
      prospectId: prospect.id,
      status: 'draft',
      generatedAt,
      package: assembled,
      attachments: attachmentPayloads.map((a) => ({
        kind: a.kind as 'csv' | 'json' | 'manifest',
        storagePath: a.storage_path,
        mimeType: a.mime_type,
        byteSize: a.byte_size ?? 0,
        sha256: a.sha256 ?? '',
        rowCount: a.row_count ?? null,
      })),
      validationErrors: [],
    }
    return result as unknown as Record<string, unknown>
  } catch (err) {
    await store.markPackageFailed(ctx.userId, pkgRow.id)
    throw err
  }
}

export const scrapeClawAdapter = {
  slug: 'scrapeclaw' as const,

  validateInput(input: unknown): ScrapeClawWorkerInput {
    return ScrapeClawWorkerInputSchema.parse(input) as unknown as ScrapeClawWorkerInput
  },

  async execute(
    input: ScrapeClawWorkerInput,
    ctx: VerifiedSkillExecutionContext,
  ): Promise<Record<string, unknown>> {
    if (input.mode === 'discover') {
      return executeDiscovery(input, ctx)
    }

    if (input.mode === 'enrich') {
      return executeEnrichment(input)
    }

    if (input.mode === 'package') {
      return executePackage(input, ctx)
    }

    return executeResearch(input)
  },
}

export const scrapeClawResearchAdapter = scrapeClawAdapter
