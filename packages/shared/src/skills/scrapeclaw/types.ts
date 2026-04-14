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
  canonicalWebsiteUrl: string | null
  sourceUrl: string | null
  businessType: string | null
  city: string | null
  state: string | null
  serviceAreaText: string | null
  nicheSlug: string
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
