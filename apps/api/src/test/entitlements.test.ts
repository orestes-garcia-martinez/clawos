/**
 * apps/api/src/test/entitlements.test.ts
 *
 * Unit tests for resolveCareerClawEntitlements().
 * Verifies that the helper reads from Supabase cache only and
 * fails open (returns free-tier defaults) on DB errors.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()

vi.mock('@clawos/shared', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actual = (await importOriginal()) as any
  return {
    ...actual,
    createServerClient: () => ({ from: mockFrom }),
  }
})

const { resolveCareerClawEntitlements } = await import('../entitlements.js')

const USER_ID = '00000000-0000-0000-0000-000000000030'

function makeChain(result: { data: unknown; error: null | { message: string } }) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    single: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
  }
  return chain
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('resolveCareerClawEntitlements', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns free tier when user has no entitlement row', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return makeChain({ data: { tier: 'free' }, error: null })
      if (table === 'user_skill_entitlements') return makeChain({ data: null, error: null }) // no row
      return makeChain({ data: null, error: null })
    })

    const result = await resolveCareerClawEntitlements(USER_ID)

    expect(result.platformTier).toBe('free')
    expect(result.skillTier).toBe('free')
    expect(result.features.llmOutreachDraft).toBe(false)
    expect(result.features.tailoredCoverLetter).toBe(false)
    expect(result.features.resumeGapAnalysis).toBe(false)
    expect(result.features.topKExtended).toBe(false)
  })

  it('returns pro tier and all feature flags when user has active pro entitlement', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return makeChain({ data: { tier: 'pro' }, error: null })
      if (table === 'user_skill_entitlements')
        return makeChain({ data: { tier: 'pro', status: 'active' }, error: null })
      return makeChain({ data: null, error: null })
    })

    const result = await resolveCareerClawEntitlements(USER_ID)

    expect(result.platformTier).toBe('pro')
    expect(result.skillTier).toBe('pro')
    expect(result.features.llmOutreachDraft).toBe(true)
    expect(result.features.tailoredCoverLetter).toBe(true)
    expect(result.features.resumeGapAnalysis).toBe(true)
    expect(result.features.topKExtended).toBe(true)
  })

  it('returns pro when users.tier=pro but skill entitlement row is missing (stale cache)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return makeChain({ data: { tier: 'pro' }, error: null })
      if (table === 'user_skill_entitlements') return makeChain({ data: null, error: null })
      return makeChain({ data: null, error: null })
    })

    const result = await resolveCareerClawEntitlements(USER_ID)
    // users.tier=pro elevates the effective tier even without a skill row
    expect(result.skillTier).toBe('pro')
  })

  it('returns pro when skill row is pro even if users.tier is stale free', async () => {
    // Webhook updated entitlement row but users.tier update failed transiently.
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return makeChain({ data: { tier: 'free' }, error: null })
      if (table === 'user_skill_entitlements')
        return makeChain({ data: { tier: 'pro', status: 'active' }, error: null })
      return makeChain({ data: null, error: null })
    })

    const result = await resolveCareerClawEntitlements(USER_ID)
    expect(result.skillTier).toBe('pro') // skill row wins
  })

  it('returns inactive pro as free (status != active)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return makeChain({ data: { tier: 'free' }, error: null })
      if (table === 'user_skill_entitlements')
        return makeChain({ data: { tier: 'pro', status: 'inactive' }, error: null })
      return makeChain({ data: null, error: null })
    })

    const result = await resolveCareerClawEntitlements(USER_ID)
    // tier=pro but status=inactive — the subscription has lapsed
    expect(result.skillTier).toBe('free')
    expect(result.features.llmOutreachDraft).toBe(false)
  })

  it('fails open and returns free-tier defaults on Supabase error', async () => {
    mockFrom.mockImplementation(() => {
      throw new Error('DB connection failed')
    })

    const result = await resolveCareerClawEntitlements(USER_ID)

    expect(result.platformTier).toBe('free')
    expect(result.skillTier).toBe('free')
    expect(result.features.llmOutreachDraft).toBe(false)
  })

  it('accepts an injected supabase client and does not call createServerClient', async () => {
    const mockClientFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'users') return makeChain({ data: { tier: 'pro' }, error: null })
      if (table === 'user_skill_entitlements')
        return makeChain({ data: { tier: 'pro', status: 'active' }, error: null })
      return makeChain({ data: null, error: null })
    })

    const mockClient = { from: mockClientFrom } as never

    const result = await resolveCareerClawEntitlements(USER_ID, mockClient)
    expect(result.skillTier).toBe('pro')
    // The module-level mockFrom (createServerClient) should NOT have been called.
    expect(mockFrom).not.toHaveBeenCalled()
  })
})
