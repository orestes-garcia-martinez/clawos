import {
  discoverPlaceSeeds,
  resolvePlaceSeedWebsite,
  runScrapeClawAgent1Enrichment,
  runScrapeClawAgent1Research,
  type ScrapeClawResolvedWebsiteCandidate,
} from '@clawos/scrapeclaw-engine'
import {
  createServerClient,
  type ScrapeClawBusinessInsert,
  type ScrapeClawBusinessRow,
  type ScrapeClawDiscoveryDiscardReason,
  type ScrapeClawDiscoveryDiscardedCandidate,
  type ScrapeClawDiscoveryInsertedBusiness,
  type ScrapeClawDiscoveryWorkerInput,
  type ScrapeClawEnrichmentWorkerInput,
  type ScrapeClawResearchWorkerInput,
  type ScrapeClawWorkerInput,
  type VerifiedSkillExecutionContext,
} from '@clawos/shared'
import { ScrapeClawWorkerInputSchema } from '@clawos/security'
import { buildDiscardInsert, ScrapeClawDiscoveryStore } from './discovery-store.js'

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
  return process.env['SCRAPECLAW_ENRICHMENT_MODEL'] ?? undefined
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

    return executeResearch(input)
  },
}

export const scrapeClawResearchAdapter = scrapeClawAdapter
