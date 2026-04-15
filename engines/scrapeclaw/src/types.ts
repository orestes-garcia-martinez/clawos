import type {
  Json,
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
  /** Injectable DNS resolver — defaults to node:dns/promises lookup. Override in tests to avoid real DNS. */
  dnsLookupImpl?: DnsLookupFn
}

export type { ScrapeClawResearchWorkerInput, ScrapeClawResearchWorkerResult }
