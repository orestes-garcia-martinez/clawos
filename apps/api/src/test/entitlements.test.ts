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

const { resolveCareerClawEntitlements, resolveSkillEntitlements } =
  await import('../entitlements.js')

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

describe('skill entitlement resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns free defaults when no entitlement row exists', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return makeChain({ data: { tier: 'free' }, error: null })
      if (table === 'user_skill_entitlements') return makeChain({ data: null, error: null })
      return makeChain({ data: null, error: null })
    })

    const result = await resolveSkillEntitlements(USER_ID, 'careerclaw')
    expect(result.platformTier).toBe('free')
    expect(result.skillTier).toBe('free')
    expect(result.effectiveTier).toBe('free')
    expect(result.features).toEqual([])
  })

  it('returns pro features when the entitlement row is active', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return makeChain({ data: { tier: 'free' }, error: null })
      if (table === 'user_skill_entitlements') {
        return makeChain({ data: { tier: 'pro', status: 'active' }, error: null })
      }
      return makeChain({ data: null, error: null })
    })

    const result = await resolveCareerClawEntitlements(USER_ID)
    expect(result.skillTier).toBe('pro')
    expect(result.effectiveTier).toBe('pro')
    expect(result.features).toContain('careerclaw.llm_gap_analysis')
    expect(result.features).toContain('careerclaw.topk_extended')
  })

  it('keeps effectiveTier pro when users.tier is pro but the skill row is missing', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return makeChain({ data: { tier: 'pro' }, error: null })
      if (table === 'user_skill_entitlements') return makeChain({ data: null, error: null })
      return makeChain({ data: null, error: null })
    })

    const result = await resolveCareerClawEntitlements(USER_ID)
    expect(result.platformTier).toBe('pro')
    expect(result.skillTier).toBe('free')
    expect(result.effectiveTier).toBe('pro')
  })

  it('treats inactive skill rows as free', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return makeChain({ data: { tier: 'free' }, error: null })
      if (table === 'user_skill_entitlements') {
        return makeChain({ data: { tier: 'pro', status: 'inactive' }, error: null })
      }
      return makeChain({ data: null, error: null })
    })

    const result = await resolveCareerClawEntitlements(USER_ID)
    expect(result.skillTier).toBe('free')
    expect(result.effectiveTier).toBe('free')
    expect(result.features).toEqual([])
  })

  it('returns free fallback on data-path failure', async () => {
    mockFrom.mockImplementation(() => {
      throw new Error('DB connection failed')
    })

    const result = await resolveCareerClawEntitlements(USER_ID)
    expect(result.platformTier).toBe('free')
    expect(result.skillTier).toBe('free')
    expect(result.effectiveTier).toBe('free')
    expect(result.features).toEqual([])
  })

  it('uses the injected supabase client when provided', async () => {
    const mockClientFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'users') return makeChain({ data: { tier: 'pro' }, error: null })
      if (table === 'user_skill_entitlements') {
        return makeChain({ data: { tier: 'pro', status: 'active' }, error: null })
      }
      return makeChain({ data: null, error: null })
    })

    const mockClient = { from: mockClientFrom } as never

    const result = await resolveCareerClawEntitlements(USER_ID, mockClient)
    expect(result.effectiveTier).toBe('pro')
    expect(mockFrom).not.toHaveBeenCalled()
  })
})
