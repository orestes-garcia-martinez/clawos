// ─────────────────────────────────────────────────────────────────────────────
// ScrapeClaw — Phase 5 — Demo Package types.
//
// Shared contract for the package generation flow:
//
//   1. The worker receives a `ScrapeClawPackageWorkerInput` with a prospectId
//      (and optional caller-supplied `generatedAt` for deterministic hashing).
//   2. The worker loads the prospect, business, and evidence rows from
//      Supabase, hands them to the pure-function insight engine in
//      `@clawos/scrapeclaw-engine`, and receives a `ScrapeClawInsightReport`.
//   3. The engine renders four artifacts from that same report:
//        - Executive_Summary.md         (sales-facing narrative)
//        - Competitive_Matrix.csv       (one row per insight; CRM-portable)
//        - Evidence_Manifest.json       (machine-ready for Responder skills)
//        - ClawOS_Verification.manifest (sha256 integrity document)
//   4. The worker persists a `scrapeclaw_demo_packages` row in `status='draft'`
//      and three `scrapeclaw_package_attachments` rows (csv/json/manifest)
//      with logical storage paths + sha256 + byte_size + row_count. The
//      actual Supabase Storage upload is deferred to Phase 6.
//
// Determinism rule (Q&A with operator):
//   Same input → same hashes. `generatedAt` is an input, never `new Date()`
//   at render time. Canonical JSON serialization + sorted keys are used
//   inside the engine so the four artifacts are byte-stable across runs.
// ─────────────────────────────────────────────────────────────────────────────

import type { Json } from '../../types/database.types.js'
import type { ScrapeClawWedgeSlug } from './types.js'

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Schema version embedded in every manifest and attachment row. Bump this
 * whenever the insight report shape or artifact layout changes in a way
 * that would legitimately alter hashes for the same prospect.
 */
export const SCRAPECLAW_PACKAGE_SCHEMA_VERSION = 'scrapeclaw.package.v1' as const
export type ScrapeClawPackageSchemaVersion = typeof SCRAPECLAW_PACKAGE_SCHEMA_VERSION

/**
 * Fixed artifact filenames. Used as both on-disk names and attachment-kind
 * lookup keys. Keep alphabetized in serialized manifests for determinism.
 */
export const SCRAPECLAW_PACKAGE_ARTIFACT_FILENAMES = {
  summary: 'Executive_Summary.md',
  csv: 'Competitive_Matrix.csv',
  json: 'Evidence_Manifest.json',
  manifest: 'ClawOS_Verification.manifest',
} as const

// ── Recommended action hooks (closed taxonomy) ───────────────────────────────

/**
 * Closed taxonomy of automation hooks the future Responder skill will pick
 * up. Each insight is tagged with exactly one. Closed now to prevent sprawl;
 * extend when Responder actually ships.
 */
export const SCRAPECLAW_ACTION_HOOKS = [
  /** Prospect has a contact form but no detectable auto-response; operator is losing leads. */
  'INBOUND_LEAD_INTAKE',
  /** Internal workflow gap (e.g. no visible vacancy tracking, no maintenance portal). */
  'INTERNAL_STATUS_TRIGGER',
  /** Competitive/market-facing action (pricing, service mix, availability). */
  'OUTBOUND_MARKET_SYNC',
] as const
export type ScrapeClawActionHook = (typeof SCRAPECLAW_ACTION_HOOKS)[number]

// ── Detection confidence ─────────────────────────────────────────────────────

/**
 * How the insight engine arrived at a given value:
 *  - `observed`: Directly extracted from evidence (e.g. a fee listed on a
 *    pricing page).
 *  - `inferred`: Derived from a proxy signal (e.g. an "after-hours emergency"
 *    phrase implies extended response coverage).
 *  - `absent`: Not found on any evidence page. Downgrades an insight's
 *    action to a safer variant (e.g. REQUEST_RATE_CARD instead of
 *    PROPOSE_PRICE_MATCH) rather than fabricating a number.
 */
export const SCRAPECLAW_DETECTION_CONFIDENCE = ['observed', 'inferred', 'absent'] as const
export type ScrapeClawDetectionConfidence = (typeof SCRAPECLAW_DETECTION_CONFIDENCE)[number]

// ── Gap taxonomy ─────────────────────────────────────────────────────────────

/**
 * Per-insight direction of the comparison against the client baseline.
 *  - `service_gap`: Client offers something the prospect does not
 *    (differentiator for the client — contributes to threat score with
 *    weight 1).
 *  - `differentiator`: Prospect offers something the client does not
 *    (existential threat — contributes with weight 2).
 *  - `parity`: Both offer the dimension; no action needed.
 *  - `unknown`: Neither side could be measured reliably.
 */
export const SCRAPECLAW_GAP_TYPES = ['service_gap', 'differentiator', 'parity', 'unknown'] as const
export type ScrapeClawGapType = (typeof SCRAPECLAW_GAP_TYPES)[number]

// ── Market threat level ──────────────────────────────────────────────────────

export const SCRAPECLAW_THREAT_LEVELS = ['low', 'medium', 'high'] as const
export type ScrapeClawThreatLevel = (typeof SCRAPECLAW_THREAT_LEVELS)[number]

// ── Client baseline (Clay County, FL residential property management) ───────

/**
 * Hardcoded wedge baseline for Phase 5. Replace with a real client profile
 * source when ClawOS adds multi-tenant operator profiles.
 *
 * Values per operator decision:
 *   10% management fee, 100% leasing fee, 9–5 maintenance only,
 *   24-hour response time.
 */
export interface ScrapeClawClientBaseline {
  wedgeSlug: ScrapeClawWedgeSlug
  region: string
  managementFeePercent: number
  leasingFeePercent: number
  maintenanceHoursLabel: string
  responseTimeLabel: string
  offeredServices: readonly string[]
}

// ── Suggested payload envelope ───────────────────────────────────────────────

/**
 * Envelope the Responder skill reads from each insight. `parameters` is
 * intentionally loose (`Record<string, unknown>`) for Phase 5 — tighten per
 * hook when Responder lands. `detection_confidence` is always required so
 * downstream consumers can reject low-confidence inputs.
 */
export interface ScrapeClawSuggestedPayload {
  skill_target: ScrapeClawActionHook
  action: string
  parameters: Record<string, unknown>
  detection_confidence: ScrapeClawDetectionConfidence
}

// ── Evidence anchor ──────────────────────────────────────────────────────────

/**
 * Links an insight back to the evidence rows that support it. Evidence IDs
 * are UUIDs of `scrapeclaw_evidence_items.id`. An insight may cite multiple.
 */
export interface ScrapeClawInsightEvidenceAnchor {
  evidenceId: string
  sourceUrl: string
  pageKind: string
}

// ── The insight itself ───────────────────────────────────────────────────────

/**
 * One row in the Competitive Matrix, one block in the JSON, one bullet in
 * the MD. Everything about an insight (the gap, the hook, the payload, the
 * evidence) lives together so the four renderers can all project from the
 * same object.
 */
export interface ScrapeClawInsight {
  /** Stable short id, e.g. 'management_fee', 'maintenance_hours'. Determines ordering. */
  id: string
  /** Short human label: "Management Fee". */
  dimension: string
  /** Category grouping: "Pricing" | "Operations" | "Reachability" | "Service Mix". */
  category: string
  /** What the client baseline says. */
  clientValue: string
  /** What was observed (or inferred, or found absent) on the prospect. */
  prospectValue: string
  gapType: ScrapeClawGapType
  /** How the value was detected. Drives payload action selection. */
  detectionConfidence: ScrapeClawDetectionConfidence
  /** Hook tag for the Responder skill. */
  actionHook: ScrapeClawActionHook
  /** Weight contributed to the market threat score. 0 for parity/unknown. */
  threatContribution: number
  /** Full payload envelope the Responder will act on. */
  suggestedPayload: ScrapeClawSuggestedPayload
  /** Evidence rows that support this insight. Empty for `absent` detections. */
  evidence: ScrapeClawInsightEvidenceAnchor[]
  /** One-sentence narrative for the MD summary. */
  narrative: string
}

// ── Threat score ─────────────────────────────────────────────────────────────

/**
 * Explanation for how the threat level was computed. Rendered verbatim in
 * the summary so operators can defend the number when a prospect pushes back.
 */
export interface ScrapeClawThreatScore {
  level: ScrapeClawThreatLevel
  score: number
  rationale: string[]
}

// ── The full insight report ──────────────────────────────────────────────────

/**
 * Pure engine output. All four artifacts project from this object; no
 * renderer ever reads raw evidence. If the report serializes identically,
 * the artifacts hash identically.
 */
export interface ScrapeClawInsightReport {
  schemaVersion: ScrapeClawPackageSchemaVersion
  prospectId: string
  businessId: string
  businessName: string
  wedgeSlug: ScrapeClawWedgeSlug
  marketCity: string
  marketRegion: string
  /** Caller-supplied timestamp — identical across deterministic re-runs. */
  generatedAt: string
  clientBaseline: ScrapeClawClientBaseline
  threat: ScrapeClawThreatScore
  insights: ScrapeClawInsight[]
  /** Short human headline for the MD summary. */
  headline: string
  /** One-sentence call to action for the MD summary. */
  callToAction: string
}

// ── Artifacts (engine output → worker) ───────────────────────────────────────

export const SCRAPECLAW_ARTIFACT_ROLES = ['summary', 'csv', 'json', 'manifest'] as const
export type ScrapeClawArtifactRole = (typeof SCRAPECLAW_ARTIFACT_ROLES)[number]

/**
 * One rendered artifact. Bytes are held as base64 so the worker can hand
 * them to the operator UI without touching the filesystem. SHA-256 is over
 * the raw bytes, not the base64 string.
 */
export interface ScrapeClawPackageArtifact {
  role: ScrapeClawArtifactRole
  filename: string
  mimeType: string
  /** Raw byte count (not base64 length). */
  byteSize: number
  /** Hex-encoded sha256 over the raw bytes. */
  sha256: string
  /** Row count for the CSV; null for other roles. */
  rowCount: number | null
  /** UTF-8 bytes encoded as base64 for safe JSON transport. */
  bytesBase64: string
}

/**
 * The full four-artifact set plus the report that produced them. Returned
 * from the engine's `assembleDemoPackage` and forwarded to the operator UI.
 */
export interface ScrapeClawAssembledPackage {
  schemaVersion: ScrapeClawPackageSchemaVersion
  prospectId: string
  generatedAt: string
  report: ScrapeClawInsightReport
  summary: ScrapeClawPackageArtifact
  csv: ScrapeClawPackageArtifact
  json: ScrapeClawPackageArtifact
  manifest: ScrapeClawPackageArtifact
}

// ── Manifest file content (what goes inside ClawOS_Verification.manifest) ───

/**
 * Structured content of the verification manifest file. The engine writes
 * it to disk/bytes via canonical JSON and computes `manifestSha256` as the
 * sha256 of the bytes with the `manifestSha256` field replaced by a
 * zero-length placeholder — a small ceremony that lets Phase 6/7 verify the
 * manifest against its own embedded hash.
 */
export interface ScrapeClawVerificationManifest {
  schemaVersion: ScrapeClawPackageSchemaVersion
  packageId: string
  prospectId: string
  generatedAt: string
  threatLevel: ScrapeClawThreatLevel
  artifacts: Array<{
    filename: string
    role: ScrapeClawArtifactRole
    sha256: string
    byteSize: number
    rowCount: number | null
    mimeType: string
  }>
  /** Sha256 over the canonical bytes of this manifest (with this field replaced by empty string). */
  manifestSha256: string
}

// ── Worker I/O ───────────────────────────────────────────────────────────────

/**
 * Worker input for `mode === 'package'`. Intentionally minimal: everything
 * else is loaded from Supabase by the worker, under the caller's RLS
 * identity, so the request cannot be spoofed to package someone else's
 * prospect.
 */
export interface ScrapeClawPackageWorkerInput {
  mode: 'package'
  prospectId: string
  templateSlug?: string | null
  /**
   * Optional caller-supplied timestamp for deterministic hashing. Defaults
   * to the prospect row's `updated_at`. Using `new Date()` at render time
   * would break determinism.
   */
  generatedAt?: string
}

/**
 * Worker output for `mode === 'package'`. Always returns artifact bytes so
 * the operator UI can preview without another round-trip.
 */
export interface ScrapeClawPackageWorkerResult {
  mode: 'package'
  packageId: string
  prospectId: string
  status: 'draft' | 'failed'
  generatedAt: string
  package: ScrapeClawAssembledPackage | null
  attachments: Array<{
    kind: 'csv' | 'json' | 'manifest'
    storagePath: string
    mimeType: string
    byteSize: number
    sha256: string
    rowCount: number | null
  }>
  validationErrors: Array<{ code: string; message: string; details?: Json }>
}
