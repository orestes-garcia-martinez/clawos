// ─────────────────────────────────────────────────────────────────────────────
// ScrapeClaw skill types — domain interfaces, enums, and constants.
//
// These types define the ScrapeClaw data model shared between the API,
// worker, and web app. They map 1:1 to the scrapeclaw_* Supabase tables
// but use camelCase for TypeScript ergonomics.
//
// Constants (e.g. SCRAPECLAW_PROSPECT_STATUSES) are exported as readonly
// tuples so they can be used both as runtime values and as type sources.
// ─────────────────────────────────────────────────────────────────────────────

import type { Json } from '../../types/database.types.js'

// ── Enums / Constants ─────────────────────────────────────────────────────────

export const SCRAPECLAW_WEDGE_SLUGS = ['residential_property_management'] as const
export type ScrapeClawWedgeSlug = (typeof SCRAPECLAW_WEDGE_SLUGS)[number]

export const SCRAPECLAW_BUSINESS_STATUSES = ['discovered', 'researched', 'archived'] as const
export type ScrapeClawBusinessStatus = (typeof SCRAPECLAW_BUSINESS_STATUSES)[number]

export const SCRAPECLAW_DISCOVERY_PROVIDERS = ['google_places'] as const
export type ScrapeClawDiscoveryProvider = (typeof SCRAPECLAW_DISCOVERY_PROVIDERS)[number]

export const SCRAPECLAW_DISCOVERY_QUERY_KINDS = ['primary', 'fallback'] as const
export type ScrapeClawDiscoveryQueryKind = (typeof SCRAPECLAW_DISCOVERY_QUERY_KINDS)[number]

export const SCRAPECLAW_DISCOVERY_DISCARD_REASONS = [
  'no_website',
  'duplicate_place',
  'duplicate_website',
] as const
export type ScrapeClawDiscoveryDiscardReason = (typeof SCRAPECLAW_DISCOVERY_DISCARD_REASONS)[number]

export const SCRAPECLAW_PROSPECT_STATUSES = [
  'discovered',
  'qualified',
  'disqualified',
  'packaged',
  'contacted',
  'archived',
] as const
export type ScrapeClawProspectStatus = (typeof SCRAPECLAW_PROSPECT_STATUSES)[number]

export const SCRAPECLAW_EVIDENCE_PAGE_KINDS = [
  'homepage',
  'about',
  'services',
  'contact',
  'niche_relevant',
  'other',
] as const
export type ScrapeClawEvidencePageKind = (typeof SCRAPECLAW_EVIDENCE_PAGE_KINDS)[number]

export const SCRAPECLAW_CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const
export type ScrapeClawConfidenceLevel = (typeof SCRAPECLAW_CONFIDENCE_LEVELS)[number]

export const SCRAPECLAW_PACKAGE_STATUSES = [
  'generating',
  'draft',
  'approved',
  'queued',
  'sent',
  'failed',
  'archived',
  'rejected',
] as const
export type ScrapeClawPackageStatus = (typeof SCRAPECLAW_PACKAGE_STATUSES)[number]

export const SCRAPECLAW_ATTACHMENT_KINDS = ['csv', 'json', 'manifest', 'summary_pdf'] as const
export type ScrapeClawAttachmentKind = (typeof SCRAPECLAW_ATTACHMENT_KINDS)[number]

export const SCRAPECLAW_OUTBOUND_DRAFT_STATUSES = [
  'draft',
  'approved',
  'queued',
  'sent',
  'failed',
  'archived',
] as const
export type ScrapeClawOutboundDraftStatus = (typeof SCRAPECLAW_OUTBOUND_DRAFT_STATUSES)[number]

// ── Domain interfaces ─────────────────────────────────────────────────────────

export interface ScrapeClawBusiness {
  id: string
  userId: string
  name: string
  status: ScrapeClawBusinessStatus
  canonicalWebsiteUrl: string | null
  sourceUrl: string | null
  businessType: string | null
  city: string | null
  state: string | null
  formattedAddress: string | null
  serviceAreaText: string | null
  nicheSlug: string
  discoveryProvider: ScrapeClawDiscoveryProvider | null
  discoveryExternalId: string | null
  discoveryQuery: string | null
  discoveredAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ScrapeClawDiscoveryDiscard {
  id: string
  userId: string
  provider: ScrapeClawDiscoveryProvider
  externalId: string
  reason: ScrapeClawDiscoveryDiscardReason
  linkedBusinessId: string | null
  metadata: Json
  createdAt: string
  updatedAt: string
}

export interface ScrapeClawProspect {
  id: string
  userId: string
  businessId: string
  status: ScrapeClawProspectStatus
  wedgeSlug: ScrapeClawWedgeSlug
  marketCity: string | null
  marketRegion: string | null
  fitScore: number | null
  useCaseHypothesis: string | null
  dataNeedHypothesis: string | null
  demoTypeRecommendation: string | null
  outreachAngle: string | null
  confidenceLevel: ScrapeClawConfidenceLevel | null
  createdAt: string
  updatedAt: string
}

export interface ScrapeClawEvidenceItem {
  id: string
  userId: string
  prospectId: string
  pageKind: ScrapeClawEvidencePageKind
  sourceUrl: string
  observedAt: string
  title: string | null
  snippet: string | null
  extractedFacts: Json
  sourceConfidence: ScrapeClawConfidenceLevel | null
  createdAt: string
}

export interface ScrapeClawDemoPackage {
  id: string
  userId: string
  prospectId: string
  status: ScrapeClawPackageStatus
  templateSlug: string | null
  summaryMarkdown: string | null
  manifest: Json
  evidenceReferences: Json
  validationErrors: Json
  schemaVersion: string
  finalizedAt: string | null
  approvedAt: string | null
  queuedAt: string | null
  sentAt: string | null
  failedAt: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ScrapeClawPackageAttachment {
  id: string
  userId: string
  packageId: string
  kind: ScrapeClawAttachmentKind
  storagePath: string
  mimeType: string
  byteSize: number | null
  sha256: string | null
  rowCount: number | null
  schemaVersion: string
  createdAt: string
}

export interface ScrapeClawOutboundDraft {
  id: string
  userId: string
  prospectId: string
  packageId: string
  status: ScrapeClawOutboundDraftStatus
  toEmail: string | null
  ccEmail: string | null
  subject: string
  bodyMarkdown: string
  providerMessageId: string | null
  createdAt: string
  updatedAt: string
  sentAt: string | null
}

export interface ScrapeClawResearchCandidateBusinessInput {
  name: string
  canonicalWebsiteUrl: string
  sourceUrl?: string | null
  businessType?: string | null
  city?: string | null
  state?: string | null
  serviceAreaText?: string | null
  nicheSlug?: ScrapeClawWedgeSlug | null
}

export interface ScrapeClawEvidenceDraft {
  pageKind: ScrapeClawEvidencePageKind
  sourceUrl: string
  observedAt: string
  title: string | null
  snippet: string | null
  extractedFacts: Json
  sourceConfidence: ScrapeClawConfidenceLevel | null
}

export interface ScrapeClawProspectDraft {
  status: Extract<ScrapeClawProspectStatus, 'qualified' | 'disqualified'>
  wedgeSlug: ScrapeClawWedgeSlug
  marketCity: string
  marketRegion: string
  fitScore: number
  useCaseHypothesis: string
  dataNeedHypothesis: string
  demoTypeRecommendation: string
  outreachAngle: string
  confidenceLevel: ScrapeClawConfidenceLevel
}

export interface ScrapeClawResearchProspectResult {
  business: ScrapeClawResearchCandidateBusinessInput
  prospect: ScrapeClawProspectDraft
  evidenceItems: ScrapeClawEvidenceDraft[]
  reasoning: string[]
  // ── Phase 4a additions (optional for backward compatibility) ────────────────
  /** Decomposed deterministic score with rationale. */
  scoreBreakdown?: ScrapeClawScoreBreakdown
  /** Normalized contacts extracted across all evidence pages. */
  contactSummary?: ScrapeClawContactSummary
  /** Compromised-page reports + evidence distinctness signals. */
  qualitySummary?: ScrapeClawQualitySummary
}

export interface ScrapeClawResearchWorkerInput {
  mode?: 'research'
  wedgeSlug: ScrapeClawWedgeSlug
  marketCity: string
  marketRegion: string
  candidates: ScrapeClawResearchCandidateBusinessInput[]
  maxCandidates?: number
  maxPagesPerBusiness?: number
  fetchTimeoutMs?: number
  userAgent?: string | null
}

export interface ScrapeClawResearchWorkerResult {
  mode: 'research'
  wedgeSlug: ScrapeClawWedgeSlug
  marketCity: string
  marketRegion: string
  generatedAt: string
  rankedProspects: ScrapeClawResearchProspectResult[]
  discardedBusinesses: Array<{ business: ScrapeClawResearchCandidateBusinessInput; reason: string }>
}

export interface ScrapeClawDiscoveryQueryPlan {
  hubName: string
  queryKind: ScrapeClawDiscoveryQueryKind
  queryText: string
  pageSize: number
}

export interface ScrapeClawDiscoveryWorkerInput {
  mode: 'discover'
  wedgeSlug: ScrapeClawWedgeSlug
  marketRegion: 'Clay County'
  hubNames?: string[]
  minPrimaryResultsBeforeFallback?: number
  textSearchPageSize?: number
}

export interface ScrapeClawDiscoveryInsertedBusiness {
  businessId: string
  name: string
  canonicalWebsiteUrl: string
  discoveryExternalId: string
  hubName: string
  queryText: string
}

export interface ScrapeClawDiscoveryDiscardedCandidate {
  placeId: string
  name: string
  reason: ScrapeClawDiscoveryDiscardReason
  hubName: string
  queryText: string
  existingBusinessId?: string | null
}

export interface ScrapeClawDiscoveryWorkerResult {
  mode: 'discover'
  wedgeSlug: ScrapeClawWedgeSlug
  marketRegion: string
  generatedAt: string
  plannedQueries: ScrapeClawDiscoveryQueryPlan[]
  insertedBusinesses: ScrapeClawDiscoveryInsertedBusiness[]
  discardedCandidates: ScrapeClawDiscoveryDiscardedCandidate[]
}

export interface ScrapeClawEnrichedProspectResult {
  business: ScrapeClawResearchCandidateBusinessInput
  baseProspect: ScrapeClawProspectDraft
  enrichedProspect: ScrapeClawProspectDraft
  evidenceItems: ScrapeClawEvidenceDraft[]
  deterministicReasoning: string[]
  llmReasoning: string[]
  provider: 'anthropic'
  model: string
  promptVersion: string
  usedFallback: boolean
}

export interface ScrapeClawEnrichmentWarning {
  businessName: string
  reason: string
}

export interface ScrapeClawEnrichmentWorkerInput {
  mode: 'enrich'
  wedgeSlug: ScrapeClawWedgeSlug
  marketCity: string
  marketRegion: string
  prospects: ScrapeClawResearchProspectResult[]
  maxProspects?: number
  model?: string | null
}

export interface ScrapeClawEnrichmentWorkerResult {
  mode: 'enrich'
  wedgeSlug: ScrapeClawWedgeSlug
  marketCity: string
  marketRegion: string
  generatedAt: string
  enrichedProspects: ScrapeClawEnrichedProspectResult[]
  warnings: ScrapeClawEnrichmentWarning[]
}

export type ScrapeClawWorkerInput =
  | ScrapeClawResearchWorkerInput
  | ScrapeClawDiscoveryWorkerInput
  | ScrapeClawEnrichmentWorkerInput

export type ScrapeClawWorkerResult =
  | ScrapeClawResearchWorkerResult
  | ScrapeClawDiscoveryWorkerResult
  | ScrapeClawEnrichmentWorkerResult

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4a — Production hardening shared types.
//
// These types describe the engine outputs added in Phase 4a:
//   - URL eligibility decisions
//   - Production pre-rank breakdown + rationale
//   - Deterministic score decomposition
//   - Contact summary (post-extraction normalization)
//   - Quality summary (compromised pages, evidence distinctness)
//
// All fields are additive on existing result shapes and remain optional so
// that:
//   (a) older callers compile without changes, and
//   (b) the security worker-input schemas continue to accept enrichment
//       prospects without round-trip loss.
//
// Persistence is intentionally out of scope for Phase 4a — these shapes
// exist as worker JSON output only. DB schema updates land in a later phase
// once we know which fields are worth storing long-term.
// ─────────────────────────────────────────────────────────────────────────────

// ── URL eligibility ───────────────────────────────────────────────────────────

export const SCRAPECLAW_URL_INELIGIBILITY_REASONS = [
  'malformed_url',
  'unsupported_scheme',
  'private_or_loopback_host',
  'forbidden_host_pattern',
  'empty_host',
] as const
export type ScrapeClawUrlIneligibilityReason = (typeof SCRAPECLAW_URL_INELIGIBILITY_REASONS)[number]

export interface ScrapeClawUrlEligibilityResult {
  /** True only when the URL is safe to fetch and well-formed. */
  eligible: boolean
  /** Original URL as supplied. Useful for audit logs. */
  originalUrl: string
  /** Normalized URL (lowercased host, http→https where safe, trimmed). Null when ineligible. */
  normalizedUrl: string | null
  /** Reason the URL was rejected. Null when eligible. */
  reason: ScrapeClawUrlIneligibilityReason | null
  /** Short human-readable explanation. Null when eligible. */
  rationale: string | null
}

// ── Production pre-rank ───────────────────────────────────────────────────────

export interface ScrapeClawPreRankBreakdown {
  /** Wedge-fit signal from the business name (e.g. "property management"). 0–1. */
  nameWedgeScore: number
  /** Locality fit derived from hub/city tokens in the name or URL. 0–1. */
  localityScore: number
  /** Coarse website quality hints (length, hostname shape). 0–1. */
  websiteQualityScore: number
  /** Penalty for out-of-scope candidates (HOAs, community associations). 0 or negative. */
  exclusionPenalty: number
  /** Tie-breaker: primary query > fallback query. 0–0.05. */
  queryQualityScore: number
}

export interface ScrapeClawPreRankCandidate {
  name: string
  /** Already-normalized canonical website URL. */
  canonicalWebsiteUrl: string
  /** Original Google Places ID. */
  placeId: string
  /** Hub the seed came from (e.g. "Orange Park"). */
  hubName: string
  /** Discovery query kind. */
  queryKind: ScrapeClawDiscoveryQueryKind
  /** Final aggregate pre-rank score after combining sub-scores. */
  preRankScore: number
  /** Machine-readable score decomposition. */
  scoreBreakdown: ScrapeClawPreRankBreakdown
  /** Human-readable rationale lines, in order of contribution. */
  rationale: string[]
  /** True when the candidate should be excluded from research entirely. */
  excluded: boolean
  /** Reason for exclusion when `excluded` is true. */
  exclusionReason: string | null
}

export interface ScrapeClawPreRankDiscarded {
  name: string
  originalUrl: string
  /** Eligibility decision (when discarded for URL reasons). */
  eligibility: ScrapeClawUrlEligibilityResult | null
  /** Free-form reason if discarded for non-URL reasons (e.g. wedge exclusion). */
  reason: string
}

export interface ScrapeClawPreRankResult {
  /** Sorted descending by preRankScore. Excluded candidates are NOT included here. */
  ranked: ScrapeClawPreRankCandidate[]
  /** Candidates dropped before ranking (ineligible URL or hard-excluded). */
  discarded: ScrapeClawPreRankDiscarded[]
  generatedAt: string
}

// ── Deterministic score decomposition ─────────────────────────────────────────

export interface ScrapeClawScoreBreakdown {
  /** Direct wedge vocabulary matches across evidence pages. 0–1. */
  wedgeMatchScore: number
  /** Listing/availability/inventory signals. 0–1. */
  inventorySignalScore: number
  /** Local market terminology + candidate locality. 0–1. */
  localityScore: number
  /** Page kinds present; multiplied by SCRAPECLAW_COMPROMISED_PAGE_QUALITY_PENALTY when any page is flagged. 0–1. */
  websiteQualityScore: number
  /** Quality of extracted contacts (presence, validity, role-based prefix). 0–1. */
  contactQualityScore: number
  /** Distinct evidence pages contributing signal. 0–1. */
  evidenceRichnessScore: number
  /** Final weighted aggregate. 0–1. Should rarely saturate at 1.0. */
  finalScore: number
  /** Human-readable rationale for the breakdown. */
  rationale: string[]
}

// ── Contact summary ───────────────────────────────────────────────────────────

export const SCRAPECLAW_CONTACT_REJECTION_REASONS = [
  'invalid_email_syntax',
  'noreply_mailbox',
  'duplicate',
  'asset_host_email',
  'too_short',
  'invalid_phone_format',
  'looks_like_zip_or_id',
] as const
export type ScrapeClawContactRejectionReason = (typeof SCRAPECLAW_CONTACT_REJECTION_REASONS)[number]

export interface ScrapeClawRejectedContact {
  /** Raw value as observed before normalization. */
  raw: string
  reason: ScrapeClawContactRejectionReason
}

export interface ScrapeClawContactSummary {
  /**
   * Best business email per heuristic ranking:
   *   1. role-based mailbox on same domain as website
   *      (info, contact, hello, office, leasing, sales, admin)
   *   2. any mailbox on same domain as website
   *   3. role-based mailbox off-domain
   * `null` when no acceptable email was extracted.
   */
  primaryBusinessEmail: string | null
  secondaryEmails: string[]
  /** Best business phone in E.164-ish form (leading +1 stripped). */
  primaryBusinessPhone: string | null
  secondaryPhones: string[]
  rejectedContacts: ScrapeClawRejectedContact[]
  /** Confidence in the chosen primaries. */
  contactConfidence: ScrapeClawConfidenceLevel
}

// ── Quality summary ───────────────────────────────────────────────────────────

export const SCRAPECLAW_QUALITY_WARNINGS = [
  'compromised_page_detected',
  'thin_evidence',
  'fallback_pages_only',
  'homepage_only',
] as const
export type ScrapeClawQualityWarning = (typeof SCRAPECLAW_QUALITY_WARNINGS)[number]

export interface ScrapeClawCompromisedPageReport {
  url: string
  /** Suspicious terms observed on the page. */
  matchedTerms: string[]
  /** True when the page also has zero wedge-vocabulary signal. */
  hasNoWedgeSignal: boolean
}

export interface ScrapeClawQualitySummary {
  /**
   * Number of distinct, successfully-fetched URLs that contributed evidence.
   * Excludes pages that returned errors or fell back to the homepage shape.
   */
  distinctEvidencePageCount: number
  /** True when only the homepage produced evidence. */
  homepageOnly: boolean
  /** Pages flagged as compromised. */
  compromisedPages: ScrapeClawCompromisedPageReport[]
  /** Coarse warnings to surface in UI/rationale. */
  warnings: ScrapeClawQualityWarning[]
}
