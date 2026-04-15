import { describe, expect, it, vi } from 'vitest'
import type { VerifiedSkillExecutionContext } from '@clawos/shared'

const mockRun = vi.fn()
vi.mock('@clawos/scrapeclaw-engine', () => ({ runScrapeClawAgent1Research: mockRun }))

const { scrapeClawResearchAdapter } = await import('./adapter.js')

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

const VALID_INPUT = {
  wedgeSlug: 'residential_property_management',
  marketCity: 'Green Cove Springs',
  marketRegion: 'Clay County',
  candidates: [{ name: 'Example PM', canonicalWebsiteUrl: 'https://examplepm.com' }],
}

describe('scrapeClawResearchAdapter', () => {
  it('validates and executes research input', async () => {
    mockRun.mockResolvedValue({
      wedgeSlug: 'residential_property_management',
      marketCity: 'Green Cove Springs',
      marketRegion: 'Clay County',
      generatedAt: '2026-04-14T00:00:00.000Z',
      rankedProspects: [],
      discardedBusinesses: [],
    })
    const input = scrapeClawResearchAdapter.validateInput(VALID_INPUT)
    const result = await scrapeClawResearchAdapter.execute(input, VERIFIED_CTX)
    expect(mockRun).toHaveBeenCalledWith(input)
    expect(result).toEqual(
      expect.objectContaining({
        wedgeSlug: 'residential_property_management',
        marketCity: 'Green Cove Springs',
      }),
    )
  })

  it('rejects invalid input', () => {
    expect(() =>
      scrapeClawResearchAdapter.validateInput({ wedgeSlug: 'bad_slug', candidates: [] }),
    ).toThrow()
  })

  it('propagates engine errors', async () => {
    mockRun.mockRejectedValueOnce(new Error('engine failure'))
    const input = scrapeClawResearchAdapter.validateInput(VALID_INPUT)
    await expect(scrapeClawResearchAdapter.execute(input, VERIFIED_CTX)).rejects.toThrow(
      'engine failure',
    )
  })
})
