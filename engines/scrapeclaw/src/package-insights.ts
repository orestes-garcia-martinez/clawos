// ─────────────────────────────────────────────────────────────────────────────
// ScrapeClaw — Phase 5 — Insight analyzer.
//
// Pure function. Consumes:
//   - the prospect row
//   - the business row
//   - evidence items (already persisted, with UUIDs)
//   - the client baseline
// and produces a `ScrapeClawInsightReport`. No I/O, no LLM, no `Date.now()`.
//
// Detection is tiered (observed | inferred | absent):
//
//   - observed: A direct regex or keyword match produced the value.
//   - inferred: A proxy signal exists (e.g. "emergency line 24/7" → response
//     time is likely < 24h even without a stated SLA).
//   - absent:   Nothing on the evidence pages spoke to this dimension.
//               We never fabricate numbers.
//
// When detection is `absent`, the suggested_payload action downgrades to a
// safer variant (e.g. REQUEST_RATE_CARD instead of PROPOSE_PRICE_MATCH) so
// the Responder skill cannot act on a value we never actually saw.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ScrapeClawActionHook,
  ScrapeClawBusinessRow,
  ScrapeClawClientBaseline,
  ScrapeClawDetectionConfidence,
  ScrapeClawEvidenceItemRow,
  ScrapeClawGapType,
  ScrapeClawInsight,
  ScrapeClawInsightEvidenceAnchor,
  ScrapeClawInsightReport,
  ScrapeClawProspectRow,
  ScrapeClawSuggestedPayload,
  ScrapeClawThreatLevel,
  ScrapeClawThreatScore,
} from '@clawos/shared'
import { SCRAPECLAW_PACKAGE_SCHEMA_VERSION } from '@clawos/shared'
import { SCRAPECLAW_DIMENSION_CATALOG, SCRAPECLAW_THREAT_BANDS } from './package-baseline.js'

// ── Detection primitives ────────────────────────────────────────────────────

/** Matches `24 hours`, `24-hour`, `24hr`, `24 hr`, `within 24 hours`. */
const HOURS_RE = /\b(\d{1,3})\s*(?:-|\s)?(?:hour|hours|hr|hrs)\b/gi

function collectEvidenceText(evidence: ScrapeClawEvidenceItemRow[]): string {
  const parts: string[] = []
  for (const e of evidence) {
    if (e.title) parts.push(e.title)
    if (e.snippet) parts.push(e.snippet)
    // extracted_facts may contain text-bearing fields; stringify defensively
    if (e.extracted_facts && typeof e.extracted_facts === 'object') {
      try {
        parts.push(JSON.stringify(e.extracted_facts))
      } catch {
        // ignore non-serializable
      }
    }
  }
  return parts.join(' \n ').toLowerCase()
}

function collectAnchorsByPredicate(
  evidence: ScrapeClawEvidenceItemRow[],
  predicate: (text: string) => boolean,
): ScrapeClawInsightEvidenceAnchor[] {
  const anchors: ScrapeClawInsightEvidenceAnchor[] = []
  for (const e of evidence) {
    const haystack = [
      e.title ?? '',
      e.snippet ?? '',
      e.extracted_facts && typeof e.extracted_facts === 'object'
        ? safeStringify(e.extracted_facts)
        : '',
    ]
      .join(' ')
      .toLowerCase()
    if (predicate(haystack)) {
      anchors.push({ evidenceId: e.id, sourceUrl: e.source_url, pageKind: e.page_kind })
    }
  }
  // Deterministic ordering — by evidence_id ascending.
  anchors.sort((a, b) => (a.evidenceId < b.evidenceId ? -1 : a.evidenceId > b.evidenceId ? 1 : 0))
  return anchors
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v)
  } catch {
    return ''
  }
}

// ── Per-dimension detectors ─────────────────────────────────────────────────

interface DetectedValue {
  label: string
  confidence: ScrapeClawDetectionConfidence
  anchors: ScrapeClawInsightEvidenceAnchor[]
  /** Numeric value when available (e.g. percent for fees, hours for response). */
  numeric: number | null
}

const ABSENT: DetectedValue = {
  label: 'not publicly advertised',
  confidence: 'absent',
  anchors: [],
  numeric: null,
}

function findPercentNearPhrase(text: string, phrases: RegExp[]): number | null {
  // Scope: look only at the substring starting at each phrase match up to
  // the next sentence-ending boundary (. or ; or newline). This avoids
  // picking up an earlier, unrelated percent that happens to be physically
  // closer, e.g. "Management fee: 10% of rent. Leasing fee: 100% ..." — when
  // scoping to "leasing fee" we must see 100%, not 10%.
  const lower = text.toLowerCase()
  const fragments: string[] = []
  for (const re of phrases) {
    const globalRe = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`)
    let m: RegExpExecArray | null
    while ((m = globalRe.exec(lower)) !== null) {
      const start = m.index
      // Find the next sentence boundary (., ;, or newline) or end-of-text.
      let end = lower.length
      for (let i = start + m[0].length; i < lower.length; i++) {
        const ch = lower.charCodeAt(i)
        // 46='.', 59=';', 10='\n', 13='\r'
        if (ch === 46 || ch === 59 || ch === 10 || ch === 13) {
          end = i
          break
        }
      }
      fragments.push(lower.slice(start, end))
    }
  }
  if (fragments.length === 0) return null

  const percentRe = /\b(\d{1,3}(?:\.\d+)?)\s*(?:%|percent\b)/i
  for (const frag of fragments) {
    const m = percentRe.exec(frag)
    if (!m) continue
    const num = Number.parseFloat(m[1]!)
    if (Number.isFinite(num) && num > 0 && num < 300) return num
  }
  return null
}

function detectManagementFee(evidence: ScrapeClawEvidenceItemRow[]): DetectedValue {
  for (const e of evidence) {
    const hay = [e.title ?? '', e.snippet ?? ''].join(' ')
    const num = findPercentNearPhrase(hay, [/management fee/i])
    if (num !== null && num < 100) {
      return {
        label: `${num}% management fee`,
        confidence: 'observed',
        anchors: [{ evidenceId: e.id, sourceUrl: e.source_url, pageKind: e.page_kind }],
        numeric: num,
      }
    }
  }
  return ABSENT
}

function detectLeasingFee(evidence: ScrapeClawEvidenceItemRow[]): DetectedValue {
  for (const e of evidence) {
    const hay = [e.title ?? '', e.snippet ?? ''].join(' ')
    // Prefer explicit leasing-fee phrasing; "tenant placement" is a service
    // noun, not a fee keyword, so we don't use it here.
    const num = findPercentNearPhrase(hay, [
      /leasing fee/i,
      /placement fee/i,
      /tenant[- ]placement fee/i,
    ])
    if (num !== null && num <= 200) {
      return {
        label: `${num}% leasing fee`,
        confidence: 'observed',
        anchors: [{ evidenceId: e.id, sourceUrl: e.source_url, pageKind: e.page_kind }],
        numeric: num,
      }
    }
  }
  return ABSENT
}

function detectMaintenanceHours(evidence: ScrapeClawEvidenceItemRow[]): DetectedValue {
  const text = collectEvidenceText(evidence)
  const has24x7 = /\b24\s*\/\s*7|24x7|24-7|around[-\s]the[-\s]clock|round[-\s]the[-\s]clock\b/.test(
    text,
  )
  const hasAfterHours = /after[-\s]hours|emergency (?:line|service|maintenance)/.test(text)
  const hasBusinessHoursOnly = /(?:9|nine)\s*[-–to]+\s*(?:5|five)|business hours only/.test(text)

  if (has24x7) {
    const anchors = collectAnchorsByPredicate(evidence, (h) =>
      /24\s*\/\s*7|24x7|24-7|around[-\s]the[-\s]clock|round[-\s]the[-\s]clock/.test(h),
    )
    return { label: '24/7 maintenance', confidence: 'observed', anchors, numeric: 24 }
  }
  if (hasAfterHours) {
    const anchors = collectAnchorsByPredicate(evidence, (h) =>
      /after[-\s]hours|emergency (?:line|service|maintenance)/.test(h),
    )
    return {
      label: 'after-hours / emergency maintenance',
      confidence: 'inferred',
      anchors,
      numeric: null,
    }
  }
  if (hasBusinessHoursOnly) {
    const anchors = collectAnchorsByPredicate(evidence, (h) =>
      /(?:9|nine)\s*[-–to]+\s*(?:5|five)|business hours only/.test(h),
    )
    return {
      label: 'business hours only',
      confidence: 'observed',
      anchors,
      numeric: null,
    }
  }
  return ABSENT
}

function detectResponseTime(evidence: ScrapeClawEvidenceItemRow[]): DetectedValue {
  // Explicit SLA in hours.
  for (const e of evidence) {
    const hay = [e.title ?? '', e.snippet ?? ''].join(' ').toLowerCase()
    if (!/respond|response|call back|reply/.test(hay)) continue
    HOURS_RE.lastIndex = 0
    const m = HOURS_RE.exec(hay)
    if (m) {
      const hours = Number.parseInt(m[1]!, 10)
      if (Number.isFinite(hours) && hours > 0 && hours <= 168) {
        return {
          label: `${hours}-hour response SLA`,
          confidence: 'observed',
          anchors: [{ evidenceId: e.id, sourceUrl: e.source_url, pageKind: e.page_kind }],
          numeric: hours,
        }
      }
    }
  }
  // Proxy: "fast", "prompt", "same-day" → inferred, no number.
  const text = collectEvidenceText(evidence)
  if (/same[-\s]day|within (?:the|one) (?:hour|day)|prompt(?:ly)? respond/.test(text)) {
    const anchors = collectAnchorsByPredicate(evidence, (h) =>
      /same[-\s]day|within (?:the|one) (?:hour|day)|prompt(?:ly)? respond/.test(h),
    )
    return { label: 'same-day response (implied)', confidence: 'inferred', anchors, numeric: null }
  }
  return ABSENT
}

function detectPublicEmail(
  _business: ScrapeClawBusinessRow,
  evidence: ScrapeClawEvidenceItemRow[],
): DetectedValue {
  // Look at evidence extracted_facts for any email address string.
  const emailRe = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i
  const hit = evidence.find((e) => {
    const hay = [e.title ?? '', e.snippet ?? '', safeStringify(e.extracted_facts)].join(' ')
    return emailRe.test(hay)
  })
  if (hit) {
    return {
      label: 'public business email listed',
      confidence: 'observed',
      anchors: [{ evidenceId: hit.id, sourceUrl: hit.source_url, pageKind: hit.page_kind }],
      numeric: null,
    }
  }
  // Inferred if there's a contact-page URL but no email was extracted.
  const contactPage = evidence.find((e) => e.page_kind === 'contact')
  if (contactPage) {
    return {
      label: 'contact form only, no direct email',
      confidence: 'inferred',
      anchors: [
        {
          evidenceId: contactPage.id,
          sourceUrl: contactPage.source_url,
          pageKind: contactPage.page_kind,
        },
      ],
      numeric: null,
    }
  }
  return ABSENT
}

function detectPublicPhone(evidence: ScrapeClawEvidenceItemRow[]): DetectedValue {
  // NANP-ish phone pattern: allow common separators.
  const phoneRe = /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/
  const hit = evidence.find((e) => {
    const hay = [e.title ?? '', e.snippet ?? '', safeStringify(e.extracted_facts)].join(' ')
    return phoneRe.test(hay)
  })
  if (hit) {
    return {
      label: 'public business phone listed',
      confidence: 'observed',
      anchors: [{ evidenceId: hit.id, sourceUrl: hit.source_url, pageKind: hit.page_kind }],
      numeric: null,
    }
  }
  return ABSENT
}

function detectServiceMix(evidence: ScrapeClawEvidenceItemRow[]): DetectedValue {
  const text = collectEvidenceText(evidence)
  const matched: string[] = []
  const ALL_SERVICES: Array<[string, RegExp]> = [
    ['tenant placement', /tenant placement|placing tenants?|finding tenants?/],
    ['rent collection', /rent collection|collect(?:ing)? rent/],
    ['lease administration', /lease administration|lease management|lease renewals?/],
    ['property inspections', /property inspections?|routine inspections?/],
    [
      'maintenance coordination',
      /maintenance coordination|coordinate maintenance|maintenance requests?/,
    ],
    ['eviction support', /eviction(?:s)?|eviction support/],
    ['owner portal', /owner portal|owner login/],
    ['tenant portal', /tenant portal|resident portal/],
    [
      'vacancy marketing',
      /vacancy marketing|listing (?:marketing|promotion)|market(?:ing)? vacancies/,
    ],
    ['accounting statements', /monthly statements?|owner statements?|financial statements?/],
  ]
  for (const [name, re] of ALL_SERVICES) {
    if (re.test(text)) matched.push(name)
  }
  if (matched.length === 0) return ABSENT
  const anchors = collectAnchorsByPredicate(evidence, (h) =>
    ALL_SERVICES.some(([, re]) => re.test(h)),
  )
  return {
    label: matched.join(', '),
    confidence: 'observed',
    anchors,
    numeric: matched.length,
  }
}

// ── Gap classification + action-hook selection ──────────────────────────────

function classifyFeeGap(
  clientPercent: number,
  detected: DetectedValue,
): { gapType: ScrapeClawGapType; threatContribution: number; narrative: string } {
  if (detected.confidence === 'absent') {
    return {
      gapType: 'unknown',
      threatContribution: 0,
      narrative: 'Prospect does not publicly advertise pricing; rate card required to compare.',
    }
  }
  const prospectPercent = detected.numeric!
  if (Math.abs(prospectPercent - clientPercent) < 0.5) {
    return {
      gapType: 'parity',
      threatContribution: 0,
      narrative: `Pricing at parity (${prospectPercent}% vs ${clientPercent}%).`,
    }
  }
  if (prospectPercent < clientPercent) {
    const deltaPct = +(prospectPercent - clientPercent).toFixed(2)
    return {
      gapType: 'differentiator',
      // Scaled by magnitude of the gap, capped at the dimension's max weight.
      threatContribution: Math.min(2, Math.abs(deltaPct) >= 2 ? 2 : 1),
      narrative: `Prospect undercuts by ${Math.abs(deltaPct)} points (${prospectPercent}% vs ${clientPercent}%).`,
    }
  }
  const deltaPct = +(prospectPercent - clientPercent).toFixed(2)
  return {
    gapType: 'service_gap',
    threatContribution: 1,
    narrative: `Client is priced lower by ${Math.abs(deltaPct)} points (${clientPercent}% vs ${prospectPercent}%).`,
  }
}

function classifyMaintenanceHoursGap(detected: DetectedValue): {
  gapType: ScrapeClawGapType
  threatContribution: number
  narrative: string
} {
  if (detected.confidence === 'absent') {
    return {
      gapType: 'unknown',
      threatContribution: 0,
      narrative: 'Prospect does not publicly state maintenance coverage hours.',
    }
  }
  if (detected.label.startsWith('24/7')) {
    return {
      gapType: 'differentiator',
      threatContribution: 4,
      narrative: 'Prospect advertises 24/7 maintenance; client offers 9–5 only.',
    }
  }
  if (detected.label.includes('after-hours') || detected.label.includes('emergency')) {
    return {
      gapType: 'differentiator',
      threatContribution: 2,
      narrative: 'Prospect advertises after-hours emergency coverage; client offers 9–5 only.',
    }
  }
  // business hours only → parity
  return {
    gapType: 'parity',
    threatContribution: 0,
    narrative: 'Prospect also limits maintenance to business hours.',
  }
}

function classifyResponseTimeGap(detected: DetectedValue): {
  gapType: ScrapeClawGapType
  threatContribution: number
  narrative: string
} {
  if (detected.confidence === 'absent') {
    return {
      gapType: 'unknown',
      threatContribution: 0,
      narrative: 'Prospect does not publish a response-time SLA.',
    }
  }
  if (detected.numeric !== null && detected.numeric < 24) {
    return {
      gapType: 'differentiator',
      threatContribution: 4,
      narrative: `Prospect advertises a ${detected.numeric}-hour response; client states 24-hour.`,
    }
  }
  if (detected.confidence === 'inferred') {
    return {
      gapType: 'differentiator',
      threatContribution: 2,
      narrative: 'Prospect implies same-day response; client states 24-hour.',
    }
  }
  // explicit 24h or longer
  return {
    gapType: 'parity',
    threatContribution: 0,
    narrative: 'Prospect states a response SLA at or above 24 hours.',
  }
}

function classifyReachabilityGap(
  detected: DetectedValue,
  dimension: 'email' | 'phone',
): { gapType: ScrapeClawGapType; threatContribution: number; narrative: string } {
  if (detected.confidence === 'absent') {
    return {
      gapType: 'service_gap',
      threatContribution: 1,
      narrative: `Prospect does not publish a direct ${dimension}; inbound leads likely lost.`,
    }
  }
  if (detected.confidence === 'inferred' && dimension === 'email') {
    return {
      gapType: 'service_gap',
      threatContribution: 1,
      narrative: 'Prospect uses a contact form only; no direct email reachability.',
    }
  }
  return {
    gapType: 'parity',
    threatContribution: 0,
    narrative: `Prospect publishes a direct ${dimension}.`,
  }
}

function classifyServiceMixGap(
  baseline: ScrapeClawClientBaseline,
  detected: DetectedValue,
): { gapType: ScrapeClawGapType; threatContribution: number; narrative: string } {
  if (detected.confidence === 'absent') {
    return {
      gapType: 'unknown',
      threatContribution: 0,
      narrative: 'Prospect service coverage not detected on public pages.',
    }
  }
  const detectedServices = new Set(detected.label.split(', ').map((s) => s.trim().toLowerCase()))
  const clientServices = new Set(baseline.offeredServices.map((s) => s.toLowerCase()))
  const prospectOnly = [...detectedServices].filter((s) => !clientServices.has(s))
  const clientOnly = [...clientServices].filter((s) => !detectedServices.has(s))

  if (prospectOnly.length > 0 && prospectOnly.length >= clientOnly.length) {
    return {
      gapType: 'differentiator',
      threatContribution: 2,
      narrative: `Prospect offers ${prospectOnly.length} service(s) the client does not: ${prospectOnly.join(', ')}.`,
    }
  }
  if (clientOnly.length > 0) {
    return {
      gapType: 'service_gap',
      threatContribution: 1,
      narrative: `Client offers ${clientOnly.length} service(s) the prospect does not: ${clientOnly.join(', ')}.`,
    }
  }
  return {
    gapType: 'parity',
    threatContribution: 0,
    narrative: 'Service coverage at rough parity.',
  }
}

// ── Payload builders ─────────────────────────────────────────────────────────

function buildPricingPayload(
  hook: ScrapeClawActionHook,
  dimensionId: 'management_fee' | 'leasing_fee',
  clientPercent: number,
  detected: DetectedValue,
): ScrapeClawSuggestedPayload {
  if (detected.confidence === 'absent') {
    return {
      skill_target: hook,
      action: 'REQUEST_RATE_CARD',
      parameters: {
        dimension: dimensionId,
        client_current_percent: clientPercent,
        reasoning:
          'Prospect pricing not publicly advertised; request rate card before proposing match.',
      },
      detection_confidence: 'absent',
    }
  }
  const prospectPercent = detected.numeric!
  const delta = +(prospectPercent - clientPercent).toFixed(2)
  return {
    skill_target: hook,
    action: delta < 0 ? 'PROPOSE_PRICE_MATCH' : 'MONITOR_PRICE_DRIFT',
    parameters: {
      dimension: dimensionId,
      client_current_percent: clientPercent,
      prospect_detected_percent: prospectPercent,
      adjustment_delta_percent: delta,
      reasoning:
        delta < 0
          ? `Detected ${Math.abs(delta)}-point gap below client rate.`
          : `Prospect priced ${Math.abs(delta)} points above client; monitor for drift.`,
    },
    detection_confidence: detected.confidence,
  }
}

function buildMaintenancePayload(
  hook: ScrapeClawActionHook,
  baseline: ScrapeClawClientBaseline,
  detected: DetectedValue,
): ScrapeClawSuggestedPayload {
  if (detected.confidence === 'absent') {
    return {
      skill_target: hook,
      action: 'SURVEY_MAINTENANCE_COVERAGE',
      parameters: {
        client_current: baseline.maintenanceHoursLabel,
        reasoning: 'Prospect maintenance coverage not stated publicly.',
      },
      detection_confidence: 'absent',
    }
  }
  return {
    skill_target: hook,
    action: 'ENABLE_AFTER_HOURS_TRIAGE',
    parameters: {
      client_current: baseline.maintenanceHoursLabel,
      prospect_detected: detected.label,
      reasoning:
        'Prospect competes on after-hours coverage. Enabling triage automation closes the gap without adding headcount.',
    },
    detection_confidence: detected.confidence,
  }
}

function buildResponseTimePayload(
  hook: ScrapeClawActionHook,
  baseline: ScrapeClawClientBaseline,
  detected: DetectedValue,
): ScrapeClawSuggestedPayload {
  if (detected.confidence === 'absent') {
    return {
      skill_target: hook,
      action: 'PROBE_RESPONSE_SLA',
      parameters: {
        client_current: baseline.responseTimeLabel,
        reasoning: 'Prospect response-time SLA not published.',
      },
      detection_confidence: 'absent',
    }
  }
  return {
    skill_target: hook,
    action: 'AUTOMATE_INBOUND_REPLY',
    parameters: {
      client_current: baseline.responseTimeLabel,
      prospect_detected: detected.label,
      prospect_hours_numeric: detected.numeric,
      reasoning:
        'Prospect competes on reply speed. Automated inbound reply brings client below the prospect SLA.',
    },
    detection_confidence: detected.confidence,
  }
}

function buildReachabilityPayload(
  hook: ScrapeClawActionHook,
  dimensionId: 'public_contact_email' | 'public_contact_phone',
  detected: DetectedValue,
): ScrapeClawSuggestedPayload {
  if (detected.confidence === 'absent') {
    return {
      skill_target: hook,
      action:
        dimensionId === 'public_contact_email'
          ? 'ENABLE_LEAD_CAPTURE_FORM'
          : 'ENABLE_CALL_FORWARDING',
      parameters: {
        dimension: dimensionId,
        reasoning: 'Prospect lacks public contact channel; inbound leads likely lost.',
      },
      detection_confidence: 'absent',
    }
  }
  return {
    skill_target: hook,
    action: 'MONITOR_INBOUND_CHANNEL',
    parameters: { dimension: dimensionId },
    detection_confidence: detected.confidence,
  }
}

function buildServiceMixPayload(
  hook: ScrapeClawActionHook,
  baseline: ScrapeClawClientBaseline,
  detected: DetectedValue,
): ScrapeClawSuggestedPayload {
  if (detected.confidence === 'absent') {
    return {
      skill_target: hook,
      action: 'SURVEY_SERVICE_COVERAGE',
      parameters: {
        client_services: [...baseline.offeredServices],
        reasoning: 'Prospect service list not detected publicly.',
      },
      detection_confidence: 'absent',
    }
  }
  return {
    skill_target: hook,
    action: 'COMPARE_SERVICE_COVERAGE',
    parameters: {
      client_services: [...baseline.offeredServices],
      prospect_services: detected.label.split(', ').map((s) => s.trim()),
    },
    detection_confidence: detected.confidence,
  }
}

// ── Main entry point ────────────────────────────────────────────────────────

export interface AnalyzeInsightsInput {
  prospect: ScrapeClawProspectRow
  business: ScrapeClawBusinessRow
  evidence: ScrapeClawEvidenceItemRow[]
  baseline: ScrapeClawClientBaseline
  /** Caller-supplied timestamp. Never defaults to `new Date()` here. */
  generatedAt: string
}

export function buildInsightReport(input: AnalyzeInsightsInput): ScrapeClawInsightReport {
  const { prospect, business, evidence, baseline, generatedAt } = input

  // Sort evidence deterministically by id to guarantee stable anchor ordering.
  const orderedEvidence = [...evidence].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  // Run each detector once.
  const mgmtFee = detectManagementFee(orderedEvidence)
  const leasingFee = detectLeasingFee(orderedEvidence)
  const maintenance = detectMaintenanceHours(orderedEvidence)
  const responseTime = detectResponseTime(orderedEvidence)
  const email = detectPublicEmail(business, orderedEvidence)
  const phone = detectPublicPhone(orderedEvidence)
  const services = detectServiceMix(orderedEvidence)

  // Build insights in catalog order.
  const insights: ScrapeClawInsight[] = []

  for (const dim of SCRAPECLAW_DIMENSION_CATALOG) {
    let detected: DetectedValue
    let classification: {
      gapType: ScrapeClawGapType
      threatContribution: number
      narrative: string
    }
    let payload: ScrapeClawSuggestedPayload
    let clientLabel: string

    switch (dim.id) {
      case 'management_fee':
        detected = mgmtFee
        classification = classifyFeeGap(baseline.managementFeePercent, detected)
        payload = buildPricingPayload(
          dim.defaultActionHook,
          'management_fee',
          baseline.managementFeePercent,
          detected,
        )
        clientLabel = `${baseline.managementFeePercent}% management fee`
        break
      case 'leasing_fee':
        detected = leasingFee
        classification = classifyFeeGap(baseline.leasingFeePercent, detected)
        payload = buildPricingPayload(
          dim.defaultActionHook,
          'leasing_fee',
          baseline.leasingFeePercent,
          detected,
        )
        clientLabel = `${baseline.leasingFeePercent}% leasing fee`
        break
      case 'maintenance_hours':
        detected = maintenance
        classification = classifyMaintenanceHoursGap(detected)
        payload = buildMaintenancePayload(dim.defaultActionHook, baseline, detected)
        clientLabel = baseline.maintenanceHoursLabel
        break
      case 'response_time':
        detected = responseTime
        classification = classifyResponseTimeGap(detected)
        payload = buildResponseTimePayload(dim.defaultActionHook, baseline, detected)
        clientLabel = baseline.responseTimeLabel
        break
      case 'public_contact_email':
        detected = email
        classification = classifyReachabilityGap(detected, 'email')
        payload = buildReachabilityPayload(dim.defaultActionHook, 'public_contact_email', detected)
        clientLabel = 'public business email'
        break
      case 'public_contact_phone':
        detected = phone
        classification = classifyReachabilityGap(detected, 'phone')
        payload = buildReachabilityPayload(dim.defaultActionHook, 'public_contact_phone', detected)
        clientLabel = 'public business phone'
        break
      case 'service_mix':
        detected = services
        classification = classifyServiceMixGap(baseline, detected)
        payload = buildServiceMixPayload(dim.defaultActionHook, baseline, detected)
        clientLabel = baseline.offeredServices.join(', ')
        break
      default:
        continue
    }

    insights.push({
      id: dim.id,
      dimension: dim.dimension,
      category: dim.category,
      clientValue: clientLabel,
      prospectValue: detected.label,
      gapType: classification.gapType,
      detectionConfidence: detected.confidence,
      actionHook: dim.defaultActionHook,
      threatContribution: classification.threatContribution,
      suggestedPayload: payload,
      evidence: detected.anchors,
      narrative: classification.narrative,
    })
  }

  // ── Threat score ───────────────────────────────────────────────────────────
  const subtotal = insights.reduce((sum, i) => sum + i.threatContribution, 0)
  const rationaleLines: string[] = []
  for (const i of insights) {
    if (i.threatContribution > 0) {
      rationaleLines.push(`+${i.threatContribution} — ${i.dimension}: ${i.narrative}`)
    }
  }

  const threat: ScrapeClawThreatScore = {
    level: bandFor(subtotal),
    score: subtotal,
    rationale: rationaleLines.length > 0 ? rationaleLines : ['No measurable gaps detected.'],
  }

  // ── Narrative headline + CTA ──────────────────────────────────────────────
  const headline = buildHeadline(business.name, threat.level, insights)
  const callToAction = buildCallToAction(threat.level)

  return {
    schemaVersion: SCRAPECLAW_PACKAGE_SCHEMA_VERSION,
    prospectId: prospect.id,
    businessId: business.id,
    businessName: business.name,
    wedgeSlug: baseline.wedgeSlug,
    marketCity: prospect.market_city ?? '',
    marketRegion: prospect.market_region ?? baseline.region,
    generatedAt,
    clientBaseline: baseline,
    threat,
    insights,
    headline,
    callToAction,
  }
}

function bandFor(score: number): ScrapeClawThreatLevel {
  if (score <= SCRAPECLAW_THREAT_BANDS.lowMax) return 'low'
  if (score <= SCRAPECLAW_THREAT_BANDS.mediumMax) return 'medium'
  return 'high'
}

function buildHeadline(
  businessName: string,
  level: ScrapeClawThreatLevel,
  insights: ScrapeClawInsight[],
): string {
  const differentiators = insights.filter((i) => i.gapType === 'differentiator')
  const heavy = differentiators.find(
    (i) => i.id === 'maintenance_hours' || i.id === 'response_time',
  )
  if (level === 'high' && heavy) {
    return `${businessName} is competing on ${heavy.dimension.toLowerCase()}.`
  }
  if (level === 'high') {
    return `${businessName} presents ${differentiators.length} competitive differentiator(s).`
  }
  if (level === 'medium') {
    return `${businessName} shows targeted gaps worth addressing.`
  }
  return `${businessName} is at rough parity with the client baseline.`
}

function buildCallToAction(level: ScrapeClawThreatLevel): string {
  if (level === 'high') {
    return 'Schedule a 15-minute review to enable after-hours triage and automated inbound reply before the next lease cycle.'
  }
  if (level === 'medium') {
    return 'Schedule a 15-minute review to close the targeted gaps before they widen.'
  }
  return 'No urgent gaps; revisit when new evidence is published.'
}
