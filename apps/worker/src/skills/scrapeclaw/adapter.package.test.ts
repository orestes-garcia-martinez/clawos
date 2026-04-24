// ─────────────────────────────────────────────────────────────────────────────
// ScrapeClaw — Phase 5 — Worker adapter package-mode tests.
//
// Uses the same mocking style as adapter.test.ts: vi.mock the engine + the
// Supabase store, then call the adapter's public API. No DB, no network.
//
// Assertions focus on the contract:
//   - Prospect missing → status='failed', no writes.
//   - Happy path → package inserted as 'generating', three attachment rows
//     inserted with logical paths + hashes, package finalized to 'draft',
//     prospect marked 'packaged'.
//   - Adapter returns the assembled package and the attachment plan so the
//     operator UI can preview without a round-trip.
// ─────────────────────────────────────────────────────────────────────────────

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VerifiedSkillExecutionContext } from '@clawos/shared'

const packageStoreMethods = {
  findProspect: vi.fn(),
  findBusiness: vi.fn(),
  listEvidence: vi.fn(),
  insertPackage: vi.fn(),
  insertAttachments: vi.fn(),
  finalizePackageAsDraft: vi.fn(),
  markProspectPackaged: vi.fn(),
  markPackageFailed: vi.fn(),
}

// Minimal stubs for the other dependencies so vi.mock resolves cleanly.
const discoveryStoreMethods = {
  findDiscard: vi.fn(),
  findBusinessByPlaceId: vi.fn(),
  findBusinessByCanonicalWebsite: vi.fn(),
  insertBusiness: vi.fn(),
  mergeBusinessMetadata: vi.fn(),
  upsertDiscard: vi.fn(),
}

vi.mock('@clawos/scrapeclaw-engine', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import('@clawos/scrapeclaw-engine')>()
  return {
    ...actual,
    runScrapeClawAgent1Research: vi.fn(),
    runScrapeClawAgent1Enrichment: vi.fn(),
    discoverPlaceSeeds: vi.fn(),
    resolvePlaceSeedWebsite: vi.fn(),
    // assembleDemoPackage, CLAY_COUNTY_RESIDENTIAL_PM_BASELINE flow through
    // from `actual` so the real engine is exercised end-to-end.
  }
})

vi.mock('./discovery-store.js', () => ({
  ScrapeClawDiscoveryStore: vi.fn().mockImplementation(() => discoveryStoreMethods),
  buildDiscardInsert: (params: unknown) => params,
}))

vi.mock('./package-store.js', () => ({
  ScrapeClawPackageStore: vi.fn().mockImplementation(() => packageStoreMethods),
}))

vi.mock('@clawos/shared', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import('@clawos/shared')>()
  return {
    ...actual,
    createServerClient: vi.fn(() => ({ from: vi.fn() })),
  }
})

const { scrapeClawAdapter } = await import('./adapter.js')

const USER_ID = '00000000-0000-0000-0000-0000000000aa'
const PROSPECT_ID = '11111111-1111-1111-1111-111111111111'
const BUSINESS_ID = '22222222-2222-2222-2222-222222222222'
const PACKAGE_ID_ASSIGNED = '33333333-3333-3333-3333-333333333333'
const GENERATED_AT = '2026-04-20T12:00:00.000Z'

const VERIFIED_CTX: VerifiedSkillExecutionContext = {
  source: 'clawos',
  verified: true,
  userId: USER_ID,
  skill: 'scrapeclaw',
  tier: 'free',
  features: [],
  requestId: 'req-pkg-1',
  issuedAt: 1,
  expiresAt: 2,
}

const VALID_PACKAGE_INPUT = {
  mode: 'package' as const,
  prospectId: PROSPECT_ID,
  generatedAt: GENERATED_AT,
}

function prospectFixture() {
  return {
    id: PROSPECT_ID,
    user_id: USER_ID,
    business_id: BUSINESS_ID,
    status: 'qualified',
    wedge_slug: 'residential_property_management',
    market_city: 'Orange Park',
    market_region: 'Clay County, FL',
    fit_score: 0.7,
    use_case_hypothesis: 'x',
    data_need_hypothesis: 'x',
    demo_type_recommendation: 'x',
    outreach_angle: 'x',
    confidence_level: 'medium',
    created_at: '2026-04-19T00:00:00.000Z',
    updated_at: GENERATED_AT,
  }
}

function businessFixture() {
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
  }
}

function evidenceFixture() {
  return [
    {
      id: '44444444-4444-4444-4444-444444444001',
      user_id: USER_ID,
      prospect_id: PROSPECT_ID,
      page_kind: 'homepage',
      source_url: 'https://orangeparkrentalsllc.example.com/',
      observed_at: '2026-04-19T00:00:00.000Z',
      title: 'Orange Park Rentals',
      snippet:
        'Management fee: 8% of monthly rent. 24/7 emergency maintenance. Respond within 1 hour.',
      extracted_facts: {},
      source_confidence: 'medium',
      created_at: '2026-04-19T00:00:00.000Z',
    },
  ]
}

describe('scrapeClawAdapter — package mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    packageStoreMethods.insertPackage.mockResolvedValue({
      id: PACKAGE_ID_ASSIGNED,
      user_id: USER_ID,
      prospect_id: PROSPECT_ID,
      status: 'generating',
    })
    packageStoreMethods.insertAttachments.mockResolvedValue([])
    packageStoreMethods.finalizePackageAsDraft.mockResolvedValue(undefined)
    packageStoreMethods.markProspectPackaged.mockResolvedValue(undefined)
    packageStoreMethods.markPackageFailed.mockResolvedValue(undefined)
  })

  it('returns failed status with no writes when prospect not found', async () => {
    packageStoreMethods.findProspect.mockResolvedValue(null)

    const input = scrapeClawAdapter.validateInput(VALID_PACKAGE_INPUT)
    const result = (await scrapeClawAdapter.execute(input, VERIFIED_CTX)) as {
      mode: string
      status: string
      validationErrors: Array<{ code: string }>
    }

    expect(result).toEqual(
      expect.objectContaining({
        mode: 'package',
        status: 'failed',
        validationErrors: [expect.objectContaining({ code: 'prospect_not_found' })],
      }),
    )
    expect(packageStoreMethods.insertPackage).not.toHaveBeenCalled()
    expect(packageStoreMethods.insertAttachments).not.toHaveBeenCalled()
  })

  it('returns failed status when prospect has no matching business', async () => {
    packageStoreMethods.findProspect.mockResolvedValue(prospectFixture())
    packageStoreMethods.findBusiness.mockResolvedValue(null)

    const input = scrapeClawAdapter.validateInput(VALID_PACKAGE_INPUT)
    const result = (await scrapeClawAdapter.execute(input, VERIFIED_CTX)) as {
      status: string
      validationErrors: Array<{ code: string }>
    }

    expect(result.status).toBe('failed')
    expect(result.validationErrors[0]!.code).toBe('business_not_found')
    expect(packageStoreMethods.insertPackage).not.toHaveBeenCalled()
  })

  it('happy path: inserts package + 3 attachments with hashes and paths, finalizes to draft', async () => {
    packageStoreMethods.findProspect.mockResolvedValue(prospectFixture())
    packageStoreMethods.findBusiness.mockResolvedValue(businessFixture())
    packageStoreMethods.listEvidence.mockResolvedValue(evidenceFixture())

    const input = scrapeClawAdapter.validateInput(VALID_PACKAGE_INPUT)
    const result = (await scrapeClawAdapter.execute(input, VERIFIED_CTX)) as {
      mode: string
      packageId: string
      prospectId: string
      status: string
      generatedAt: string
      attachments: Array<{
        kind: string
        storagePath: string
        mimeType: string
        byteSize: number
        sha256: string
        rowCount: number | null
      }>
      package: unknown
    }

    // Row was inserted as 'generating' first.
    expect(packageStoreMethods.insertPackage).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        prospect_id: PROSPECT_ID,
        status: 'generating',
        schema_version: 'scrapeclaw.package.v1',
      }),
    )

    // Three attachment rows (csv / json / manifest) with non-empty sha256.
    expect(packageStoreMethods.insertAttachments).toHaveBeenCalledTimes(1)
    const attachments = packageStoreMethods.insertAttachments.mock.calls[0]![0] as Array<{
      kind: string
      storage_path: string
      sha256: string
      byte_size: number
    }>
    expect(attachments.map((a) => a.kind).sort()).toEqual(['csv', 'json', 'manifest'])
    for (const a of attachments) {
      expect(a.sha256).toMatch(/^[a-f0-9]{64}$/)
      expect(a.byte_size).toBeGreaterThan(0)
      expect(a.storage_path).toContain(
        `users/${USER_ID}/scrapeclaw/packages/${PACKAGE_ID_ASSIGNED}/`,
      )
    }

    // Finalize + prospect update.
    expect(packageStoreMethods.finalizePackageAsDraft).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, packageId: PACKAGE_ID_ASSIGNED }),
    )
    expect(packageStoreMethods.markProspectPackaged).toHaveBeenCalledWith(USER_ID, PROSPECT_ID)

    // Result shape.
    expect(result).toEqual(
      expect.objectContaining({
        mode: 'package',
        packageId: PACKAGE_ID_ASSIGNED,
        prospectId: PROSPECT_ID,
        status: 'draft',
        generatedAt: GENERATED_AT,
      }),
    )
    expect(result.attachments).toHaveLength(3)
    expect(result.package).not.toBeNull()
  })

  it('uses prospect.updated_at as generatedAt when caller omits it', async () => {
    packageStoreMethods.findProspect.mockResolvedValue(prospectFixture())
    packageStoreMethods.findBusiness.mockResolvedValue(businessFixture())
    packageStoreMethods.listEvidence.mockResolvedValue(evidenceFixture())

    const input = scrapeClawAdapter.validateInput({
      mode: 'package',
      prospectId: PROSPECT_ID,
    })
    const result = (await scrapeClawAdapter.execute(input, VERIFIED_CTX)) as {
      generatedAt: string
    }
    expect(result.generatedAt).toBe(GENERATED_AT) // fixture's updated_at
  })

  it('validates package input shape', () => {
    // Missing prospectId
    expect(() => scrapeClawAdapter.validateInput({ mode: 'package' })).toThrow()
    // Bad UUID
    expect(() =>
      scrapeClawAdapter.validateInput({ mode: 'package', prospectId: 'not-a-uuid' }),
    ).toThrow()
  })

  it('returns already_packaged error and makes no writes when prospect is already packaged', async () => {
    packageStoreMethods.findProspect.mockResolvedValue({
      ...prospectFixture(),
      status: 'packaged',
    })

    const input = scrapeClawAdapter.validateInput(VALID_PACKAGE_INPUT)
    const result = (await scrapeClawAdapter.execute(input, VERIFIED_CTX)) as {
      status: string
      validationErrors: Array<{ code: string }>
    }

    expect(result.status).toBe('failed')
    expect(result.validationErrors[0]!.code).toBe('already_packaged')
    expect(packageStoreMethods.insertPackage).not.toHaveBeenCalled()
  })

  it('marks package as failed and re-throws when artifact assembly errors', async () => {
    packageStoreMethods.findProspect.mockResolvedValue(prospectFixture())
    packageStoreMethods.findBusiness.mockResolvedValue(businessFixture())
    packageStoreMethods.listEvidence.mockResolvedValue(evidenceFixture())
    packageStoreMethods.insertAttachments.mockRejectedValue(new Error('DB write failed'))

    const input = scrapeClawAdapter.validateInput(VALID_PACKAGE_INPUT)
    await expect(scrapeClawAdapter.execute(input, VERIFIED_CTX)).rejects.toThrow('DB write failed')

    expect(packageStoreMethods.markPackageFailed).toHaveBeenCalledWith(USER_ID, PACKAGE_ID_ASSIGNED)
    expect(packageStoreMethods.markProspectPackaged).not.toHaveBeenCalled()
  })
})
