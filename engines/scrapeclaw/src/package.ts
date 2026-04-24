// ─────────────────────────────────────────────────────────────────────────────
// ScrapeClaw — Phase 5 — Artifact renderers & package assembler.
//
// Takes a `ScrapeClawInsightReport` and emits four byte-stable artifacts:
//
//   1. Executive_Summary.md         — sales-facing narrative (≤ 400 words)
//   2. Competitive_Matrix.csv       — one row per insight, CRM-portable
//   3. Evidence_Manifest.json       — machine-ready for Responder skills
//   4. ClawOS_Verification.manifest — sha256 integrity document
//
// All four are rendered from the same report. Same report → same bytes →
// same hashes. No `Date.now()` calls here; `generatedAt` comes from the
// report.
//
// JSON determinism: we write via `canonicalJsonStringify`, which sorts all
// object keys recursively. Node's stock `JSON.stringify` does not guarantee
// key order for arbitrary inputs, so we sort explicitly.
//
// The `ClawOS_Verification.manifest` embeds its own sha256 (`manifestSha256`).
// We compute it by first writing the manifest with `manifestSha256: ''`,
// hashing those bytes, then re-writing with the hash populated. Verifiers
// in Phase 6/7 reverse the process.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto'
import type {
  ScrapeClawArtifactRole,
  ScrapeClawAssembledPackage,
  ScrapeClawBusinessRow,
  ScrapeClawClientBaseline,
  ScrapeClawEvidenceItemRow,
  ScrapeClawInsightReport,
  ScrapeClawPackageArtifact,
  ScrapeClawProspectRow,
  ScrapeClawVerificationManifest,
} from '@clawos/shared'
import {
  SCRAPECLAW_PACKAGE_ARTIFACT_FILENAMES,
  SCRAPECLAW_PACKAGE_SCHEMA_VERSION,
} from '@clawos/shared'
import { buildInsightReport } from './package-insights.js'

// ── Canonical JSON ──────────────────────────────────────────────────────────

/**
 * JSON.stringify with deterministic, recursive key ordering. Ensures that
 * two runs over identical data produce byte-identical output.
 */
export function canonicalJsonStringify(value: unknown, indent = 2): string {
  return JSON.stringify(sortValue(value), null, indent)
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortValue(obj[key])
    }
    return sorted
  }
  return value
}

// ── Byte + hash helpers ─────────────────────────────────────────────────────

function utf8Bytes(text: string): Buffer {
  return Buffer.from(text, 'utf8')
}

function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function bufferToBase64(bytes: Buffer): string {
  return bytes.toString('base64')
}

// ── CSV ─────────────────────────────────────────────────────────────────────

const CSV_HEADER = [
  'insight_id',
  'category',
  'dimension',
  'client_value',
  'prospect_value',
  'gap_type',
  'detection_confidence',
  'threat_contribution',
  'action_hook',
  'action',
  'evidence_ids',
] as const

/**
 * Hand-rolled RFC 4180 CSV escape. No third-party deps.
 * Doubles internal double-quotes; wraps fields containing `,`, `"`, `\n`, or `\r`.
 */
function escapeCsvField(raw: string): string {
  const needsQuoting = /[",\r\n]/.test(raw)
  const escaped = raw.replace(/"/g, '""')
  return needsQuoting ? `"${escaped}"` : escaped
}

function buildCsvBytes(report: ScrapeClawInsightReport): {
  bytes: Buffer
  rowCount: number
} {
  const lines: string[] = [CSV_HEADER.join(',')]
  for (const insight of report.insights) {
    const row = [
      insight.id,
      insight.category,
      insight.dimension,
      insight.clientValue,
      insight.prospectValue,
      insight.gapType,
      insight.detectionConfidence,
      String(insight.threatContribution),
      insight.actionHook,
      insight.suggestedPayload.action,
      insight.evidence.map((a) => a.evidenceId).join('|'),
    ].map(escapeCsvField)
    lines.push(row.join(','))
  }
  // Join with \n (not \r\n) for determinism and POSIX compatibility.
  const text = lines.join('\n') + '\n'
  return { bytes: utf8Bytes(text), rowCount: report.insights.length }
}

// ── JSON (Evidence Manifest) ────────────────────────────────────────────────

/**
 * Structured, machine-ready view of every insight. The Responder skill
 * reads this file. Each insight carries a `suggested_payload` envelope the
 * Responder can dispatch on.
 */
interface EvidenceManifestFile {
  schemaVersion: string
  generatedAt: string
  prospect: {
    id: string
    businessId: string
    businessName: string
    wedgeSlug: string
    marketCity: string
    marketRegion: string
  }
  clientBaseline: {
    region: string
    managementFeePercent: number
    leasingFeePercent: number
    maintenanceHoursLabel: string
    responseTimeLabel: string
    offeredServices: string[]
  }
  threat: {
    level: string
    score: number
    rationale: string[]
  }
  insights: Array<{
    id: string
    category: string
    dimension: string
    clientValue: string
    prospectValue: string
    gapType: string
    detectionConfidence: string
    threatContribution: number
    actionHook: string
    narrative: string
    suggestedPayload: {
      skill_target: string
      action: string
      parameters: Record<string, unknown>
      detection_confidence: string
    }
    evidence: Array<{ evidenceId: string; sourceUrl: string; pageKind: string }>
  }>
}

function buildJsonBytes(report: ScrapeClawInsightReport): Buffer {
  const file: EvidenceManifestFile = {
    schemaVersion: report.schemaVersion,
    generatedAt: report.generatedAt,
    prospect: {
      id: report.prospectId,
      businessId: report.businessId,
      businessName: report.businessName,
      wedgeSlug: report.wedgeSlug,
      marketCity: report.marketCity,
      marketRegion: report.marketRegion,
    },
    clientBaseline: {
      region: report.clientBaseline.region,
      managementFeePercent: report.clientBaseline.managementFeePercent,
      leasingFeePercent: report.clientBaseline.leasingFeePercent,
      maintenanceHoursLabel: report.clientBaseline.maintenanceHoursLabel,
      responseTimeLabel: report.clientBaseline.responseTimeLabel,
      offeredServices: [...report.clientBaseline.offeredServices],
    },
    threat: {
      level: report.threat.level,
      score: report.threat.score,
      rationale: [...report.threat.rationale],
    },
    insights: report.insights.map((insight) => ({
      id: insight.id,
      category: insight.category,
      dimension: insight.dimension,
      clientValue: insight.clientValue,
      prospectValue: insight.prospectValue,
      gapType: insight.gapType,
      detectionConfidence: insight.detectionConfidence,
      threatContribution: insight.threatContribution,
      actionHook: insight.actionHook,
      narrative: insight.narrative,
      suggestedPayload: {
        skill_target: insight.suggestedPayload.skill_target,
        action: insight.suggestedPayload.action,
        parameters: { ...insight.suggestedPayload.parameters },
        detection_confidence: insight.suggestedPayload.detection_confidence,
      },
      evidence: insight.evidence.map((a) => ({
        evidenceId: a.evidenceId,
        sourceUrl: a.sourceUrl,
        pageKind: a.pageKind,
      })),
    })),
  }
  const text = canonicalJsonStringify(file) + '\n'
  return utf8Bytes(text)
}

// ── Markdown (Executive Summary) ────────────────────────────────────────────

/**
 * ≤ 400 words, plain English, no technical jargon. Lead with the threat
 * level and the single CTA. Follow with at most the top three insights (by
 * threat contribution) — the CSV/JSON carries the full set.
 */
function buildMarkdownBytes(report: ScrapeClawInsightReport): Buffer {
  const top = [...report.insights]
    .filter((i) => i.threatContribution > 0)
    .sort((a, b) => b.threatContribution - a.threatContribution)
    .slice(0, 3)

  const lines: string[] = []
  lines.push(`# ${report.businessName} — Strategic Audit`)
  lines.push('')
  lines.push(`**Market Threat Level:** ${report.threat.level.toUpperCase()}`)
  lines.push('')
  lines.push(report.headline)
  lines.push('')

  if (top.length > 0) {
    lines.push('## What we observed')
    lines.push('')
    for (const insight of top) {
      lines.push(`- **${insight.dimension}** — ${insight.narrative}`)
    }
    lines.push('')
  } else {
    lines.push('No measurable competitive gaps were detected on public pages.')
    lines.push('')
  }

  lines.push('## Baseline comparison')
  lines.push('')
  lines.push(`- Client management fee: **${report.clientBaseline.managementFeePercent}%**`)
  lines.push(`- Client leasing fee: **${report.clientBaseline.leasingFeePercent}%**`)
  lines.push(`- Client maintenance coverage: **${report.clientBaseline.maintenanceHoursLabel}**`)
  lines.push(`- Client response SLA: **${report.clientBaseline.responseTimeLabel}**`)
  lines.push('')

  lines.push('## Recommended next step')
  lines.push('')
  lines.push(report.callToAction)
  lines.push('')

  lines.push('---')
  lines.push(
    `*Generated ${report.generatedAt} · schema ${report.schemaVersion} · prospect ${report.prospectId}*`,
  )
  lines.push('')

  return utf8Bytes(lines.join('\n'))
}

// ── Verification manifest (self-hashing) ────────────────────────────────────

function buildVerificationManifestBytes(params: {
  report: ScrapeClawInsightReport
  packageId: string
  summary: { sha256: string; byteSize: number }
  csv: { sha256: string; byteSize: number; rowCount: number }
  json: { sha256: string; byteSize: number }
}): Buffer {
  const stub: ScrapeClawVerificationManifest = {
    schemaVersion: SCRAPECLAW_PACKAGE_SCHEMA_VERSION,
    packageId: params.packageId,
    prospectId: params.report.prospectId,
    generatedAt: params.report.generatedAt,
    threatLevel: params.report.threat.level,
    artifacts: [
      {
        filename: SCRAPECLAW_PACKAGE_ARTIFACT_FILENAMES.summary,
        role: 'summary',
        sha256: params.summary.sha256,
        byteSize: params.summary.byteSize,
        rowCount: null,
        mimeType: 'text/markdown; charset=utf-8',
      },
      {
        filename: SCRAPECLAW_PACKAGE_ARTIFACT_FILENAMES.csv,
        role: 'csv',
        sha256: params.csv.sha256,
        byteSize: params.csv.byteSize,
        rowCount: params.csv.rowCount,
        mimeType: 'text/csv; charset=utf-8',
      },
      {
        filename: SCRAPECLAW_PACKAGE_ARTIFACT_FILENAMES.json,
        role: 'json',
        sha256: params.json.sha256,
        byteSize: params.json.byteSize,
        rowCount: null,
        mimeType: 'application/json; charset=utf-8',
      },
    ],
    manifestSha256: '', // placeholder for self-hash
  }

  // Round 1: compute the hash over the stubbed form (manifestSha256 = '').
  const stubBytes = utf8Bytes(canonicalJsonStringify(stub) + '\n')
  const selfHash = sha256Hex(stubBytes)

  // Round 2: re-serialize with the real self-hash.
  const finalManifest: ScrapeClawVerificationManifest = { ...stub, manifestSha256: selfHash }
  return utf8Bytes(canonicalJsonStringify(finalManifest) + '\n')
}

// ── Top-level assembler ─────────────────────────────────────────────────────

export interface AssemblePackageInput {
  prospect: ScrapeClawProspectRow
  business: ScrapeClawBusinessRow
  evidence: ScrapeClawEvidenceItemRow[]
  baseline: ScrapeClawClientBaseline
  /** Caller-supplied. Never defaulted to `new Date()` here. */
  generatedAt: string
  /** Server-generated package UUID used inside the verification manifest. */
  packageId: string
}

/**
 * Pure function. Takes raw DB rows + baseline + packageId and returns the
 * full four-artifact set plus the insight report. No I/O.
 */
export function assembleDemoPackage(input: AssemblePackageInput): ScrapeClawAssembledPackage {
  const report = buildInsightReport({
    prospect: input.prospect,
    business: input.business,
    evidence: input.evidence,
    baseline: input.baseline,
    generatedAt: input.generatedAt,
  })

  // Markdown
  const mdBytes = buildMarkdownBytes(report)
  const summaryArtifact: ScrapeClawPackageArtifact = {
    role: 'summary',
    filename: SCRAPECLAW_PACKAGE_ARTIFACT_FILENAMES.summary,
    mimeType: 'text/markdown; charset=utf-8',
    byteSize: mdBytes.byteLength,
    sha256: sha256Hex(mdBytes),
    rowCount: null,
    bytesBase64: bufferToBase64(mdBytes),
  }

  // CSV
  const { bytes: csvBytes, rowCount } = buildCsvBytes(report)
  const csvArtifact: ScrapeClawPackageArtifact = {
    role: 'csv',
    filename: SCRAPECLAW_PACKAGE_ARTIFACT_FILENAMES.csv,
    mimeType: 'text/csv; charset=utf-8',
    byteSize: csvBytes.byteLength,
    sha256: sha256Hex(csvBytes),
    rowCount,
    bytesBase64: bufferToBase64(csvBytes),
  }

  // JSON (Evidence Manifest)
  const jsonBytes = buildJsonBytes(report)
  const jsonArtifact: ScrapeClawPackageArtifact = {
    role: 'json',
    filename: SCRAPECLAW_PACKAGE_ARTIFACT_FILENAMES.json,
    mimeType: 'application/json; charset=utf-8',
    byteSize: jsonBytes.byteLength,
    sha256: sha256Hex(jsonBytes),
    rowCount: null,
    bytesBase64: bufferToBase64(jsonBytes),
  }

  // Verification manifest (self-hashing)
  const manifestBytes = buildVerificationManifestBytes({
    report,
    packageId: input.packageId,
    summary: { sha256: summaryArtifact.sha256, byteSize: summaryArtifact.byteSize },
    csv: {
      sha256: csvArtifact.sha256,
      byteSize: csvArtifact.byteSize,
      rowCount: csvArtifact.rowCount ?? 0,
    },
    json: { sha256: jsonArtifact.sha256, byteSize: jsonArtifact.byteSize },
  })
  const manifestArtifact: ScrapeClawPackageArtifact = {
    role: 'manifest',
    filename: SCRAPECLAW_PACKAGE_ARTIFACT_FILENAMES.manifest,
    mimeType: 'application/json; charset=utf-8',
    byteSize: manifestBytes.byteLength,
    sha256: sha256Hex(manifestBytes),
    rowCount: null,
    bytesBase64: bufferToBase64(manifestBytes),
  }

  return {
    schemaVersion: SCRAPECLAW_PACKAGE_SCHEMA_VERSION,
    prospectId: report.prospectId,
    generatedAt: report.generatedAt,
    report,
    summary: summaryArtifact,
    csv: csvArtifact,
    json: jsonArtifact,
    manifest: manifestArtifact,
  }
}

// ── Role helpers (for tests / consumers) ────────────────────────────────────

export function artifactForRole(
  pkg: ScrapeClawAssembledPackage,
  role: ScrapeClawArtifactRole,
): ScrapeClawPackageArtifact {
  switch (role) {
    case 'summary':
      return pkg.summary
    case 'csv':
      return pkg.csv
    case 'json':
      return pkg.json
    case 'manifest':
      return pkg.manifest
  }
}
