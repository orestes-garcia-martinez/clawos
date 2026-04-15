import {
  SCRAPECLAW_CLAY_COUNTY_BOUNDING_BOX,
  SCRAPECLAW_CLAY_COUNTY_HUBS,
  SCRAPECLAW_DEFAULT_FETCH_TIMEOUT_MS,
  SCRAPECLAW_DEFAULT_MIN_PRIMARY_RESULTS_BEFORE_FALLBACK,
  SCRAPECLAW_DEFAULT_TEXT_SEARCH_PAGE_SIZE,
  SCRAPECLAW_FALLBACK_DISCOVERY_CATEGORY,
  SCRAPECLAW_FALLBACK_DISCOVERY_TEMPLATE,
  SCRAPECLAW_PRIMARY_DISCOVERY_TEMPLATE,
  SCRAPECLAW_PRIMARY_DISCOVERY_WEDGE,
} from './constants.js'
import { getGooglePlaceDetails, textSearchGooglePlaces } from './google-places.js'
import type {
  RunScrapeClawDiscoveryOptions,
  ScrapeClawDiscoveredPlaceSeed,
  ScrapeClawDiscoveryHubQueryPlan,
  ScrapeClawResolvedWebsiteCandidate,
} from './types.js'
import type { ScrapeClawDiscoveryWorkerInput } from '@clawos/shared'

function normaliseHubName(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

/**
 * Creates an AbortSignal that fires after `timeoutMs` milliseconds.
 * Call `clear()` in a finally block to cancel the timer if the request
 * resolves before the timeout.
 */
function createTimeoutSignal(timeoutMs: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return { signal: controller.signal, clear: () => clearTimeout(timer) }
}

function queryFromTemplate(template: string, replacements: Record<string, string>): string {
  return Object.entries(replacements).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value),
    template,
  )
}

export function planClayCountyDiscoveryQueries(
  input: ScrapeClawDiscoveryWorkerInput,
): ScrapeClawDiscoveryHubQueryPlan[] {
  const pageSize = input.textSearchPageSize ?? SCRAPECLAW_DEFAULT_TEXT_SEARCH_PAGE_SIZE
  const hubs = (input.hubNames?.length ? input.hubNames : [...SCRAPECLAW_CLAY_COUNTY_HUBS]).map(
    normaliseHubName,
  )

  return hubs.map((hubName) => ({
    hubName,
    queryKind: 'primary',
    queryText: queryFromTemplate(SCRAPECLAW_PRIMARY_DISCOVERY_TEMPLATE, {
      wedge: SCRAPECLAW_PRIMARY_DISCOVERY_WEDGE,
      hub: hubName,
    }),
    pageSize,
    locationRestriction: { rectangle: SCRAPECLAW_CLAY_COUNTY_BOUNDING_BOX },
  }))
}

export async function discoverPlaceSeeds(
  input: ScrapeClawDiscoveryWorkerInput,
  options: RunScrapeClawDiscoveryOptions,
): Promise<{
  generatedAt: string
  plannedQueries: ScrapeClawDiscoveryHubQueryPlan[]
  placeSeeds: ScrapeClawDiscoveredPlaceSeed[]
}> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  if (!fetchImpl) throw new Error('Global fetch is not available in this runtime')

  const timeoutMs = options.fetchTimeoutMs ?? SCRAPECLAW_DEFAULT_FETCH_TIMEOUT_MS

  // Hub routing is currently hardcoded to the Clay County, FL pilot market.
  // input.marketRegion is validated by the caller but is not used to select hubs here.
  // When adding a second market, replace planClayCountyDiscoveryQueries with a
  // market-aware dispatcher keyed on input.marketRegion.
  const primaryPlans = planClayCountyDiscoveryQueries(input)
  const minPrimaryResults =
    input.minPrimaryResultsBeforeFallback ?? SCRAPECLAW_DEFAULT_MIN_PRIMARY_RESULTS_BEFORE_FALLBACK
  const plannedQueries: ScrapeClawDiscoveryHubQueryPlan[] = []
  const placeSeeds = new Map<string, ScrapeClawDiscoveredPlaceSeed>()

  const collect = (
    places: Array<{ id: string; displayName?: { text: string }; formattedAddress?: string }>,
    plan: ScrapeClawDiscoveryHubQueryPlan,
  ) => {
    for (const place of places) {
      if (!place.id || placeSeeds.has(place.id)) continue
      placeSeeds.set(place.id, {
        provider: 'google_places',
        placeId: place.id,
        name: place.displayName?.text?.trim() || 'Unknown business',
        formattedAddress: place.formattedAddress ?? null,
        hubName: plan.hubName,
        queryKind: plan.queryKind,
        queryText: plan.queryText,
      })
    }
  }

  for (const primaryPlan of primaryPlans) {
    plannedQueries.push(primaryPlan)

    const primaryTimeout = createTimeoutSignal(timeoutMs)
    let primaryResults: Array<{
      id: string
      displayName?: { text: string }
      formattedAddress?: string
    }>
    try {
      const primaryResponse = await textSearchGooglePlaces(fetchImpl, {
        apiKey: options.apiKey,
        textQuery: primaryPlan.queryText,
        pageSize: primaryPlan.pageSize,
        locationRestriction: primaryPlan.locationRestriction,
        signal: primaryTimeout.signal,
      })
      primaryResults = primaryResponse.places ?? []
    } finally {
      primaryTimeout.clear()
    }

    collect(primaryResults, primaryPlan)

    if (primaryResults.length >= minPrimaryResults) {
      continue
    }

    const fallbackPlan: ScrapeClawDiscoveryHubQueryPlan = {
      ...primaryPlan,
      queryKind: 'fallback',
      queryText: queryFromTemplate(SCRAPECLAW_FALLBACK_DISCOVERY_TEMPLATE, {
        fallback: SCRAPECLAW_FALLBACK_DISCOVERY_CATEGORY,
        hub: primaryPlan.hubName,
      }),
    }

    plannedQueries.push(fallbackPlan)

    const fallbackTimeout = createTimeoutSignal(timeoutMs)
    try {
      const fallbackResponse = await textSearchGooglePlaces(fetchImpl, {
        apiKey: options.apiKey,
        textQuery: fallbackPlan.queryText,
        pageSize: fallbackPlan.pageSize,
        locationRestriction: fallbackPlan.locationRestriction,
        signal: fallbackTimeout.signal,
      })
      collect(fallbackResponse.places ?? [], fallbackPlan)
    } finally {
      fallbackTimeout.clear()
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    plannedQueries,
    placeSeeds: [...placeSeeds.values()],
  }
}

export async function resolvePlaceSeedWebsite(
  seed: ScrapeClawDiscoveredPlaceSeed,
  options: RunScrapeClawDiscoveryOptions,
): Promise<ScrapeClawResolvedWebsiteCandidate | null> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  if (!fetchImpl) throw new Error('Global fetch is not available in this runtime')

  const timeoutMs = options.fetchTimeoutMs ?? SCRAPECLAW_DEFAULT_FETCH_TIMEOUT_MS
  const timeout = createTimeoutSignal(timeoutMs)
  let details: Awaited<ReturnType<typeof getGooglePlaceDetails>>
  try {
    details = await getGooglePlaceDetails(fetchImpl, {
      apiKey: options.apiKey,
      placeId: seed.placeId,
      signal: timeout.signal,
    })
  } finally {
    timeout.clear()
  }

  const websiteUri = details.websiteUri?.trim()
  if (!websiteUri) return null

  return {
    ...seed,
    name: details.displayName?.text?.trim() || seed.name,
    formattedAddress: details.formattedAddress ?? seed.formattedAddress,
    websiteUri,
  }
}
