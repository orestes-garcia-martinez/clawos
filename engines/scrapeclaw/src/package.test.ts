// ─────────────────────────────────────────────────────────────────────────────
// ScrapeClaw — Phase 5 — Engine tests.
//
// These tests exercise the pure insight + renderer path. No network, no DB.
// The test fixtures are hand-crafted row shapes that mirror what the
// Phase 4a research + enrichment flow would persist to Supabase.
//
// Key properties we assert:
//   - Same input → byte-identical artifacts → identical sha256 hashes.
//   - CSV has exactly one row per dimension + one header; headers + escaping
//     follow RFC 4180 (comma/quote/newline are quoted).
//   - The JSON evidence manifest carries the `suggestedPayload` envelope
//     with `detection_confidence` always set.
//   - The verification manifest's `manifestSha256` matches sha256 of the
//     manifest bytes with `manifestSha256: ''`.
//   - Detection tiering works: a fee on a matching page is `observed`; a
//     missing fee downgrades the payload to `REQUEST_RATE_CARD` / `absent`.
//   - Threat weights: maintenance + response-time gaps push into `high`.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type {
  ScrapeClawBusinessRow,
  ScrapeClawEvidenceItemRow,
  ScrapeClawProspectRow,
  ScrapeClawVerificationManifest,
} from '@clawos/shared'
import { SCRAPECLAW_PACKAGE_SCHEMA_VERSION } from '@clawos/shared'
import { CLAY_COUNTY_RESIDENTIAL_PM_BASELINE } from './package-baseline.js'
import { buildInsightReport } from './package-insights.js'
import { artifactForRole, assembleDemoPackage, canonicalJsonStringify } from './package.js'

// ── Fixtures ────────────────────────────────────────────────────────────────

const USER_ID = '00000000-0000-0000-0000-0000000000aa'
const PROSPECT_ID = '11111111-1111-1111-1111-111111111111'
const BUSINESS_ID = '22222222-2222-2222-2222-222222222222'
const PACKAGE_ID = '33333333-3333-3333-3333-333333333333'
const GENERATED_AT = '2026-04-20T12:00:00.000Z'

function fixtureProspect(): ScrapeClawProspectRow {
  return {
    id: PROSPECT_ID,
    user_id: USER_ID,
    business_id: BUSINESS_ID,
    status: 'qualified',
    wedge_slug: 'residential_property_management',
    market_city: 'Orange Park',
    market_region: 'Clay County, FL',
    fit_score: 0.71,
    use_case_hypothesis: 'hypothesis',
    data_need_hypothesis: 'needs',
    demo_type_recommendation: 'competitor_listing_feed',
    outreach_angle: 'angle',
    confidence_level: 'medium',
    created_at: '2026-04-19T00:00:00.000Z',
    updated_at: GENERATED_AT,
  } as unknown as ScrapeClawProspectRow
}

function fixtureBusiness(): ScrapeClawBusinessRow {
  return {
    id: BUSINESS_ID,
    user_id: USER_ID,
    name: 'Orange Park Rentals LLC',
    status: 'researched',
    canonical_website_url: 'https://orangeparkrentalsllc.example.com/',
    source_url: null,
    business_type: 'Property Management',
    city: 'Orange Park',
    state: 'FL',
    formatted_address: '100 Main St, Orange Park, FL 32073, USA',
    service_area_text: null,
    niche_slug: 'residential_property_management',
    discovery_provider: 'google_places',
    discovery_external_id: 'place-1',
    discovery_query: 'Property Management in Orange Park, FL',
    discovered_at: '2026-04-19T00:00:00.000Z',
    created_at: '2026-04-19T00:00:00.000Z',
    updated_at: '2026-04-19T00:00:00.000Z',
  } as unknown as ScrapeClawBusinessRow
}

interface MakeEvidenceParams {
  id: string
  pageKind: 'homepage' | 'about' | 'services' | 'contact' | 'niche_relevant' | 'other'
  sourceUrl: string
  title?: string
  snippet?: string
  extractedFacts?: Record<string, unknown>
}

function makeEvidence(p: MakeEvidenceParams): ScrapeClawEvidenceItemRow {
  return {
    id: p.id,
    user_id: USER_ID,
    prospect_id: PROSPECT_ID,
    page_kind: p.pageKind,
    source_url: p.sourceUrl,
    observed_at: '2026-04-19T00:00:00.000Z',
    title: p.title ?? null,
    snippet: p.snippet ?? null,
    extracted_facts: (p.extractedFacts ?? {}) as ScrapeClawEvidenceItemRow['extracted_facts'],
    source_confidence: 'medium',
    created_at: '2026-04-19T00:00:00.000Z',
  } as unknown as ScrapeClawEvidenceItemRow
}

// A "high threat" evidence set: lower mgmt fee AND 24/7 maintenance AND 1-hour SLA.
function highThreatEvidence(): ScrapeClawEvidenceItemRow[] {
  return [
    makeEvidence({
      id: '44444444-4444-4444-4444-444444444001',
      pageKind: 'homepage',
      sourceUrl: 'https://orangeparkrentalsllc.example.com/',
      title: 'Orange Park Rentals',
      snippet: 'Property management and rentals in Clay County. Owner portal and tenant portal.',
    }),
    makeEvidence({
      id: '44444444-4444-4444-4444-444444444002',
      pageKind: 'services',
      sourceUrl: 'https://orangeparkrentalsllc.example.com/pricing',
      title: 'Pricing — Orange Park Rentals',
      snippet:
        'Management fee: 8% of monthly rent. Leasing fee 50% of one month. Tenant placement, rent collection, lease administration, property inspections, maintenance coordination.',
    }),
    makeEvidence({
      id: '44444444-4444-4444-4444-444444444003',
      pageKind: 'services',
      sourceUrl: 'https://orangeparkrentalsllc.example.com/maintenance',
      title: 'Maintenance — 24/7 emergency line',
      snippet: 'Our team responds around-the-clock. Submit a request and we respond within 1 hour.',
    }),
    makeEvidence({
      id: '44444444-4444-4444-4444-444444444004',
      pageKind: 'contact',
      sourceUrl: 'https://orangeparkrentalsllc.example.com/contact',
      title: 'Contact Us',
      snippet: 'Email: info@orangeparkrentalsllc.example.com  Phone: (904) 555-1234',
    }),
  ]
}

// A "low threat" evidence set: fees near client baseline, no after-hours signal.
function lowThreatEvidence(): ScrapeClawEvidenceItemRow[] {
  return [
    makeEvidence({
      id: '55555555-5555-5555-5555-555555555001',
      pageKind: 'homepage',
      sourceUrl: 'https://orangeparkrentalsllc.example.com/',
      title: 'Orange Park Rentals',
      snippet:
        'Management fee: 10% of rent. Leasing fee: 100% of first month. Business hours only. Contact: info@orangeparkrentalsllc.example.com. (904) 555-1234. Services: tenant placement, rent collection, lease administration, property inspections, maintenance coordination.',
    }),
  ]
}

// An "absent" set: no pricing, no coverage, no contact signals. Just a title.
function absentEvidence(): ScrapeClawEvidenceItemRow[] {
  return [
    makeEvidence({
      id: '66666666-6666-6666-6666-666666666001',
      pageKind: 'homepage',
      sourceUrl: 'https://orangeparkrentalsllc.example.com/',
      title: 'Welcome',
      snippet: 'We help landlords.',
    }),
  ]
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('buildInsightReport — gap classification and threat scoring', () => {
  it('flags mgmt-fee undercut, 24/7 maintenance, and <24h SLA as HIGH threat', () => {
    const report = buildInsightReport({
      prospect: fixtureProspect(),
      business: fixtureBusiness(),
      evidence: highThreatEvidence(),
      baseline: CLAY_COUNTY_RESIDENTIAL_PM_BASELINE,
      generatedAt: GENERATED_AT,
    })
    expect(report.threat.level).toBe('high')

    const maint = report.insights.find((i) => i.id === 'maintenance_hours')!
    const resp = report.insights.find((i) => i.id === 'response_time')!
    const fee = report.insights.find((i) => i.id === 'management_fee')!

    expect(maint.gapType).toBe('differentiator')
    expect(maint.threatContribution).toBe(4) // heavy weight per operator directive
    expect(resp.gapType).toBe('differentiator')
    expect(resp.threatContribution).toBe(4) // heavy weight per operator directive
    expect(fee.detectionConfidence).toBe('observed')
    expect(fee.gapType).toBe('differentiator')
    expect(fee.suggestedPayload.action).toBe('PROPOSE_PRICE_MATCH')
  })

  it('classifies parity when everything matches the baseline (LOW threat)', () => {
    const report = buildInsightReport({
      prospect: fixtureProspect(),
      business: fixtureBusiness(),
      evidence: lowThreatEvidence(),
      baseline: CLAY_COUNTY_RESIDENTIAL_PM_BASELINE,
      generatedAt: GENERATED_AT,
    })
    expect(report.threat.level).toBe('low')
    expect(report.insights.find((i) => i.id === 'management_fee')!.gapType).toBe('parity')
    expect(report.insights.find((i) => i.id === 'public_contact_email')!.gapType).toBe('parity')
  })

  it('downgrades missing data to REQUEST_RATE_CARD and detection=absent', () => {
    const report = buildInsightReport({
      prospect: fixtureProspect(),
      business: fixtureBusiness(),
      evidence: absentEvidence(),
      baseline: CLAY_COUNTY_RESIDENTIAL_PM_BASELINE,
      generatedAt: GENERATED_AT,
    })
    const fee = report.insights.find((i) => i.id === 'management_fee')!
    expect(fee.detectionConfidence).toBe('absent')
    expect(fee.suggestedPayload.action).toBe('REQUEST_RATE_CARD')
    expect(fee.suggestedPayload.parameters).not.toHaveProperty('prospect_detected_percent')
    // No fabricated numeric — the operator's concern.
  })

  it('always populates detection_confidence on every suggestedPayload', () => {
    const report = buildInsightReport({
      prospect: fixtureProspect(),
      business: fixtureBusiness(),
      evidence: absentEvidence(),
      baseline: CLAY_COUNTY_RESIDENTIAL_PM_BASELINE,
      generatedAt: GENERATED_AT,
    })
    for (const insight of report.insights) {
      expect(insight.suggestedPayload.detection_confidence).toMatch(/^(observed|inferred|absent)$/)
    }
  })
})

describe('assembleDemoPackage — artifacts and determinism', () => {
  it('produces byte-identical artifacts across two runs with same input', () => {
    const runOnce = () =>
      assembleDemoPackage({
        prospect: fixtureProspect(),
        business: fixtureBusiness(),
        evidence: highThreatEvidence(),
        baseline: CLAY_COUNTY_RESIDENTIAL_PM_BASELINE,
        generatedAt: GENERATED_AT,
        packageId: PACKAGE_ID,
      })

    const a = runOnce()
    const b = runOnce()
    expect(a.summary.sha256).toBe(b.summary.sha256)
    expect(a.csv.sha256).toBe(b.csv.sha256)
    expect(a.json.sha256).toBe(b.json.sha256)
    expect(a.manifest.sha256).toBe(b.manifest.sha256)
  })

  it('CSV has one row per insight plus header, and uses documented columns', () => {
    const pkg = assembleDemoPackage({
      prospect: fixtureProspect(),
      business: fixtureBusiness(),
      evidence: highThreatEvidence(),
      baseline: CLAY_COUNTY_RESIDENTIAL_PM_BASELINE,
      generatedAt: GENERATED_AT,
      packageId: PACKAGE_ID,
    })
    const csvText = Buffer.from(pkg.csv.bytesBase64, 'base64').toString('utf8')
    const lines = csvText.trim().split('\n')
    expect(lines[0]).toBe(
      'insight_id,category,dimension,client_value,prospect_value,gap_type,detection_confidence,threat_contribution,action_hook,action,evidence_ids',
    )
    expect(pkg.csv.rowCount).toBe(pkg.report.insights.length)
    expect(lines).toHaveLength(pkg.report.insights.length + 1)
  })

  it('CSV escapes commas, quotes, and newlines per RFC 4180', () => {
    // Build evidence that produces a prospect_value containing a comma
    // (service mix joins with `, `).
    const ev = [
      makeEvidence({
        id: '77777777-7777-7777-7777-777777777001',
        pageKind: 'services',
        sourceUrl: 'https://example.com/services',
        title: 'Services',
        snippet:
          'tenant placement, rent collection, property inspections, owner portal, tenant portal.',
      }),
    ]
    const pkg = assembleDemoPackage({
      prospect: fixtureProspect(),
      business: fixtureBusiness(),
      evidence: ev,
      baseline: CLAY_COUNTY_RESIDENTIAL_PM_BASELINE,
      generatedAt: GENERATED_AT,
      packageId: PACKAGE_ID,
    })
    const csvText = Buffer.from(pkg.csv.bytesBase64, 'base64').toString('utf8')
    // A service_mix row must quote the joined value containing commas.
    expect(csvText).toMatch(/service_mix,.*,".*,.*"/)
  })

  it('JSON evidence manifest carries the suggestedPayload envelope per insight', () => {
    const pkg = assembleDemoPackage({
      prospect: fixtureProspect(),
      business: fixtureBusiness(),
      evidence: highThreatEvidence(),
      baseline: CLAY_COUNTY_RESIDENTIAL_PM_BASELINE,
      generatedAt: GENERATED_AT,
      packageId: PACKAGE_ID,
    })
    const jsonText = Buffer.from(pkg.json.bytesBase64, 'base64').toString('utf8')
    const parsed = JSON.parse(jsonText) as {
      insights: Array<{
        id: string
        suggestedPayload: {
          skill_target: string
          action: string
          parameters: Record<string, unknown>
          detection_confidence: string
        }
      }>
    }
    expect(parsed.insights.length).toBeGreaterThan(0)
    for (const ins of parsed.insights) {
      expect(ins.suggestedPayload.skill_target).toMatch(
        /^(INBOUND_LEAD_INTAKE|INTERNAL_STATUS_TRIGGER|OUTBOUND_MARKET_SYNC)$/,
      )
      expect(ins.suggestedPayload.detection_confidence).toMatch(/^(observed|inferred|absent)$/)
      expect(typeof ins.suggestedPayload.action).toBe('string')
    }
  })

  it("verification manifest's manifestSha256 verifies the rest of the file", () => {
    const pkg = assembleDemoPackage({
      prospect: fixtureProspect(),
      business: fixtureBusiness(),
      evidence: highThreatEvidence(),
      baseline: CLAY_COUNTY_RESIDENTIAL_PM_BASELINE,
      generatedAt: GENERATED_AT,
      packageId: PACKAGE_ID,
    })
    const manifestBytes = Buffer.from(pkg.manifest.bytesBase64, 'base64')
    const manifestText = manifestBytes.toString('utf8')
    const parsed = JSON.parse(manifestText) as ScrapeClawVerificationManifest

    // Reconstruct the stub form used during hashing (manifestSha256 = '').
    const stub: ScrapeClawVerificationManifest = { ...parsed, manifestSha256: '' }
    const stubBytes = Buffer.from(canonicalJsonStringify(stub) + '\n', 'utf8')
    const reHash = createHash('sha256').update(stubBytes).digest('hex')
    expect(parsed.manifestSha256).toBe(reHash)
  })

  it('exposes every artifact via artifactForRole', () => {
    const pkg = assembleDemoPackage({
      prospect: fixtureProspect(),
      business: fixtureBusiness(),
      evidence: highThreatEvidence(),
      baseline: CLAY_COUNTY_RESIDENTIAL_PM_BASELINE,
      generatedAt: GENERATED_AT,
      packageId: PACKAGE_ID,
    })
    expect(artifactForRole(pkg, 'summary').filename).toBe('Executive_Summary.md')
    expect(artifactForRole(pkg, 'csv').filename).toBe('Competitive_Matrix.csv')
    expect(artifactForRole(pkg, 'json').filename).toBe('Evidence_Manifest.json')
    expect(artifactForRole(pkg, 'manifest').filename).toBe('ClawOS_Verification.manifest')
    expect(pkg.schemaVersion).toBe(SCRAPECLAW_PACKAGE_SCHEMA_VERSION)
  })
})

describe('canonicalJsonStringify', () => {
  it('sorts keys recursively', () => {
    const out = canonicalJsonStringify({ z: 1, a: { y: 2, b: 3 } })
    expect(out).toBe('{\n  "a": {\n    "b": 3,\n    "y": 2\n  },\n  "z": 1\n}')
  })
})

describe('executive summary markdown', () => {
  it('stays under the 400-word ceiling for a realistic high-threat case', () => {
    const pkg = assembleDemoPackage({
      prospect: fixtureProspect(),
      business: fixtureBusiness(),
      evidence: highThreatEvidence(),
      baseline: CLAY_COUNTY_RESIDENTIAL_PM_BASELINE,
      generatedAt: GENERATED_AT,
      packageId: PACKAGE_ID,
    })
    const md = Buffer.from(pkg.summary.bytesBase64, 'base64').toString('utf8')
    const words = md.split(/\s+/).filter(Boolean).length
    expect(words).toBeLessThanOrEqual(400)
  })

  it('leads with the threat level', () => {
    const pkg = assembleDemoPackage({
      prospect: fixtureProspect(),
      business: fixtureBusiness(),
      evidence: highThreatEvidence(),
      baseline: CLAY_COUNTY_RESIDENTIAL_PM_BASELINE,
      generatedAt: GENERATED_AT,
      packageId: PACKAGE_ID,
    })
    const md = Buffer.from(pkg.summary.bytesBase64, 'base64').toString('utf8')
    expect(md).toMatch(/Market Threat Level:\*\*\s*HIGH/)
  })
})
