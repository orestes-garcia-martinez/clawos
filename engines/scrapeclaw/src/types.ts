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

export interface RunScrapeClawResearchOptions {
  fetchImpl?: typeof fetch
}

export type { ScrapeClawResearchWorkerInput, ScrapeClawResearchWorkerResult }
