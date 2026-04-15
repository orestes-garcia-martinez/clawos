import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VerifiedSkillExecutionContext } from '@clawos/shared'

const mockRunResearch = vi.fn()
const mockDiscoverPlaceSeeds = vi.fn()
const mockResolvePlaceSeedWebsite = vi.fn()

const storeMethods = {
  findDiscard: vi.fn(),
  findBusinessByPlaceId: vi.fn(),
  findBusinessByCanonicalWebsite: vi.fn(),
  insertBusiness: vi.fn(),
  mergeBusinessMetadata: vi.fn(),
  upsertDiscard: vi.fn(),
}

vi.mock('@clawos/scrapeclaw-engine', () => ({
  runScrapeClawAgent1Research: mockRunResearch,
  discoverPlaceSeeds: mockDiscoverPlaceSeeds,
  resolvePlaceSeedWebsite: mockResolvePlaceSeedWebsite,
}))

vi.mock('./discovery-store.js', () => ({
  ScrapeClawDiscoveryStore: vi.fn().mockImplementation(() => storeMethods),
  buildDiscardInsert: (params: unknown) => params,
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

const VERIFIED_CTX: VerifiedSkillExecutionContext = {
  source: 'clawos',
  verified: true,
  userId: '00000000-0000-0000-0000-000000000001',
  skill: 'scrapeclaw',
  tier: 'free',
  features: [],
  requestId: 'req-1',
  issuedAt: 1,
  expiresAt: 2,
}

const VALID_RESEARCH_INPUT = {
  wedgeSlug: 'residential_property_management',
  marketCity: 'Green Cove Springs',
  marketRegion: 'Clay County',
  candidates: [{ name: 'Example PM', canonicalWebsiteUrl: 'https://examplepm.com' }],
}

const VALID_DISCOVERY_INPUT = {
  mode: 'discover' as const,
  wedgeSlug: 'residential_property_management' as const,
  marketRegion: 'Clay County',
  hubNames: ['Orange Park'],
}

describe('scrapeClawAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env['SCRAPECLAW_GOOGLE_PLACES_API_KEY'] = 'test-api-key'
    storeMethods.findDiscard.mockResolvedValue(null)
    storeMethods.findBusinessByPlaceId.mockResolvedValue(null)
    storeMethods.findBusinessByCanonicalWebsite.mockResolvedValue(null)
    storeMethods.insertBusiness.mockResolvedValue({
      id: 'business-1',
      name: 'Alpha PM',
      canonical_website_url: 'https://alphapm.com/',
      discovery_external_id: 'place-1',
    })
    storeMethods.mergeBusinessMetadata.mockResolvedValue(undefined)
    storeMethods.upsertDiscard.mockResolvedValue(undefined)
  })

  it('validates and executes research input', async () => {
    mockRunResearch.mockResolvedValue({
      mode: 'research',
      wedgeSlug: 'residential_property_management',
      marketCity: 'Green Cove Springs',
      marketRegion: 'Clay County',
      generatedAt: '2026-04-15T00:00:00.000Z',
      rankedProspects: [],
      discardedBusinesses: [],
    })

    const input = scrapeClawAdapter.validateInput(VALID_RESEARCH_INPUT)
    const result = await scrapeClawAdapter.execute(input, VERIFIED_CTX)

    expect(mockRunResearch).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'research', marketCity: 'Green Cove Springs' }),
    )
    expect(result).toEqual(
      expect.objectContaining({ mode: 'research', marketRegion: 'Clay County' }),
    )
  })

  it('discovers Google Places candidates and inserts new businesses', async () => {
    mockDiscoverPlaceSeeds.mockResolvedValue({
      generatedAt: '2026-04-15T00:00:00.000Z',
      plannedQueries: [
        {
          hubName: 'Orange Park',
          queryKind: 'primary',
          queryText: 'Property Management in Orange Park, FL',
          pageSize: 20,
          locationRestriction: {
            rectangle: {
              low: { latitude: 29.718, longitude: -82.049 },
              high: { latitude: 30.22, longitude: -81.636 },
            },
          },
        },
      ],
      placeSeeds: [
        {
          provider: 'google_places',
          placeId: 'place-1',
          name: 'Alpha PM',
          formattedAddress: '1 Main St, Orange Park, FL 32073, USA',
          hubName: 'Orange Park',
          queryKind: 'primary',
          queryText: 'Property Management in Orange Park, FL',
        },
      ],
    })
    mockResolvePlaceSeedWebsite.mockResolvedValue({
      provider: 'google_places',
      placeId: 'place-1',
      name: 'Alpha PM',
      formattedAddress: '1 Main St, Orange Park, FL 32073, USA',
      hubName: 'Orange Park',
      queryKind: 'primary',
      queryText: 'Property Management in Orange Park, FL',
      websiteUri: 'https://alphapm.com/',
    })

    const input = scrapeClawAdapter.validateInput(VALID_DISCOVERY_INPUT)
    const result = await scrapeClawAdapter.execute(input, VERIFIED_CTX)

    expect(mockDiscoverPlaceSeeds).toHaveBeenCalledWith(input, { apiKey: 'test-api-key' })
    expect(mockResolvePlaceSeedWebsite).toHaveBeenCalled()
    expect(storeMethods.insertBusiness).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: VERIFIED_CTX.userId,
        status: 'discovered',
        canonical_website_url: 'https://alphapm.com/',
        discovery_external_id: 'place-1',
      }),
    )
    expect(result).toEqual(
      expect.objectContaining({
        mode: 'discover',
        insertedBusinesses: [
          expect.objectContaining({
            businessId: 'business-1',
            canonicalWebsiteUrl: 'https://alphapm.com/',
          }),
        ],
      }),
    )
  })

  it('caches duplicate websites as discards instead of inserting a second business', async () => {
    mockDiscoverPlaceSeeds.mockResolvedValue({
      generatedAt: '2026-04-15T00:00:00.000Z',
      plannedQueries: [],
      placeSeeds: [
        {
          provider: 'google_places',
          placeId: 'place-2',
          name: 'Beta Realty',
          formattedAddress: '2 Main St, Orange Park, FL 32073, USA',
          hubName: 'Orange Park',
          queryKind: 'fallback',
          queryText: 'Real Estate Agency in Orange Park, FL',
        },
      ],
    })
    mockResolvePlaceSeedWebsite.mockResolvedValue({
      provider: 'google_places',
      placeId: 'place-2',
      name: 'Beta Realty',
      formattedAddress: '2 Main St, Orange Park, FL 32073, USA',
      hubName: 'Orange Park',
      queryKind: 'fallback',
      queryText: 'Real Estate Agency in Orange Park, FL',
      websiteUri: 'https://alphapm.com/',
    })
    storeMethods.findBusinessByCanonicalWebsite.mockResolvedValue({
      id: 'business-1',
      business_type: null,
      city: null,
      state: null,
      formatted_address: null,
      discovery_query: null,
    })

    const input = scrapeClawAdapter.validateInput(VALID_DISCOVERY_INPUT)
    const result = await scrapeClawAdapter.execute(input, VERIFIED_CTX)

    expect(storeMethods.insertBusiness).not.toHaveBeenCalled()
    expect(storeMethods.upsertDiscard).toHaveBeenCalled()
    expect(result).toEqual(
      expect.objectContaining({
        discardedCandidates: [
          expect.objectContaining({
            placeId: 'place-2',
            reason: 'duplicate_website',
            existingBusinessId: 'business-1',
          }),
        ],
      }),
    )
  })

  it('rejects invalid input', () => {
    expect(() =>
      scrapeClawAdapter.validateInput({ wedgeSlug: 'bad_slug', candidates: [] }),
    ).toThrow()
  })
})
