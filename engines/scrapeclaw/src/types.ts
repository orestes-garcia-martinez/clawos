import type {
  Json,
  ScrapeClawDiscoveryDiscardReason,
  ScrapeClawDiscoveryQueryPlan,
  ScrapeClawDiscoveryQueryKind,
  ScrapeClawDiscoveryWorkerInput,
  ScrapeClawDiscoveryWorkerResult,
  ScrapeClawEnrichmentWorkerInput,
  ScrapeClawEnrichmentWorkerResult,
  ScrapeClawResearchWorkerInput,
  ScrapeClawResearchWorkerResult,
} from '@clawos/shared'

export interface PageSummary {
  url: string
  pageKind: 'homepage' | 'about' | 'services' | 'contact' | 'niche_relevant' | 'other'
  title: string | null
  snippet: string | null
  visibleText: string
  emails: string[]
  phones: string[]
  matchedTerms: string[]
  localTerms: string[]
  extractedFacts: Json
}

export type DnsLookupFn = (hostname: string) => Promise<Array<{ address: string; family: number }>>

export interface RunScrapeClawResearchOptions {
  fetchImpl?: typeof fetch
  dnsLookupImpl?: DnsLookupFn
}

export interface GooglePlacesLocationRestriction {
  rectangle: {
    low: { latitude: number; longitude: number }
    high: { latitude: number; longitude: number }
  }
}

export interface ScrapeClawDiscoveryHubQueryPlan extends ScrapeClawDiscoveryQueryPlan {
  locationRestriction: GooglePlacesLocationRestriction
}

export interface GooglePlacesDisplayName {
  text: string
  languageCode?: string
}

export interface GooglePlacesTextSearchPlace {
  id: string
  displayName?: GooglePlacesDisplayName
  formattedAddress?: string
}

export interface GooglePlacesTextSearchResponse {
  places?: GooglePlacesTextSearchPlace[]
}

export interface GooglePlaceDetails {
  id: string
  displayName?: GooglePlacesDisplayName
  formattedAddress?: string
  websiteUri?: string
}

export interface ScrapeClawDiscoveredPlaceSeed {
  provider: 'google_places'
  placeId: string
  name: string
  formattedAddress: string | null
  hubName: string
  queryKind: ScrapeClawDiscoveryQueryKind
  queryText: string
}

export interface ScrapeClawResolvedWebsiteCandidate extends ScrapeClawDiscoveredPlaceSeed {
  websiteUri: string
}

export interface ScrapeClawDiscoveryDiscardCandidate {
  placeId: string
  name: string
  reason: ScrapeClawDiscoveryDiscardReason
  hubName: string
  queryText: string
}

export interface RunScrapeClawDiscoveryOptions {
  fetchImpl?: typeof fetch
  apiKey: string
  /** Per-request fetch timeout in ms. Defaults to SCRAPECLAW_DEFAULT_FETCH_TIMEOUT_MS. */
  fetchTimeoutMs?: number
}

export interface RunScrapeClawEnrichmentOptions {
  fetchImpl?: typeof fetch
  apiKey: string
  model?: string
}

export interface PersistedScrapeClawDiscoveryOutcome {
  businessId: string
  canonicalWebsiteUrl: string
  placeId: string
  name: string
  hubName: string
  queryText: string
}

export type ScrapeClawDiscoveryWorkerEngineResult = Omit<
  ScrapeClawDiscoveryWorkerResult,
  'insertedBusinesses' | 'discardedCandidates'
> & {
  placeSeeds: ScrapeClawDiscoveredPlaceSeed[]
}

export type { ScrapeClawResearchWorkerInput, ScrapeClawResearchWorkerResult }
export type { ScrapeClawDiscoveryWorkerInput, ScrapeClawDiscoveryWorkerResult }

export type { ScrapeClawEnrichmentWorkerInput, ScrapeClawEnrichmentWorkerResult }
