/**
 * apps/api/src/test/billing.test.ts
 *
 * Unit tests for billing routes:
 *   POST /billing/webhooks/polar   -- webhook handler
 *   POST /billing/checkout         -- checkout session
 *   POST /billing/portal           -- portal session
 *   POST /internal/billing/sync/:userId -- admin sync
 *
 * Also verifies: no Polar API call happens on the /chat hot path.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WebhookVerificationError } from '@clawos/billing'

// ── Module mocks -- must be declared before app import ───────────────────────

export const mockGetUser = vi.fn()
export const mockGetUserById = vi.fn()
export const mockFrom = vi.fn()

// vi.mock factories are hoisted above all imports/declarations.
// vi.hoisted() ensures these vi.fn() instances exist when the factory runs.
const {
  mockCreateCheckoutSession,
  mockCreateCustomerPortalSession,
  mockGetCustomerStateByExternalId,
  mockVerifyWebhook,
  mockMapCustomerStateToEntitlements,
} = vi.hoisted(() => ({
  mockCreateCheckoutSession: vi.fn(),
  mockCreateCustomerPortalSession: vi.fn(),
  mockGetCustomerStateByExternalId: vi.fn(),
  mockVerifyWebhook: vi.fn(),
  mockMapCustomerStateToEntitlements: vi.fn(),
}))

vi.mock('@clawos/shared', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actual = (await importOriginal()) as any
  return {
    ...actual,
    createServerClient: () => ({
      auth: {
        getUser: mockGetUser,
        admin: { getUserById: mockGetUserById },
      },
      from: mockFrom,
    }),
  }
})

vi.mock('../llm.js', () => ({
  callLLM: vi.fn(),
  callLLMWithToolResult: vi.fn(),
}))

vi.mock('../worker-client.js', () => ({
  runWorkerCareerclaw: vi.fn(),
  WorkerError: class WorkerError extends Error {
    status: number
    isTimeout: boolean
    constructor(message: string, status: number, isTimeout = false) {
      super(message)
      this.name = 'WorkerError'
      this.status = status
      this.isTimeout = isTimeout
    }
  },
}))

vi.mock('@clawos/billing', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actual = (await importOriginal()) as any
  return {
    ...actual,
    createPolarClient: vi.fn(() => ({})),
    createCheckoutSession: mockCreateCheckoutSession,
    createCustomerPortalSession: mockCreateCustomerPortalSession,
    getCustomerStateByExternalId: mockGetCustomerStateByExternalId,
    verifyWebhook: mockVerifyWebhook,
    mapCustomerStateToEntitlements: mockMapCustomerStateToEntitlements,
  }
})

vi.mock('../env.js', () => ({
  ENV: {
    PORT: 3001,
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    CLAWOS_ANTHROPIC_KEY: 'sk-ant-test',
    CLAWOS_OPENAI_KEY: 'sk-test',
    WORKER_URL: 'http://localhost:3002',
    WORKER_SECRET: 'test-worker-secret',
    ALLOWED_ORIGIN: 'http://localhost:5173',
    SERVICE_SECRET: 'test-service-secret',
    LINK_TOKEN_SECRET: 'test-link-secret',
    POLAR_ACCESS_TOKEN: 'test-polar-token',
    POLAR_WEBHOOK_SECRET: 'test-webhook-secret',
    POLAR_ENV: 'sandbox',
    POLAR_PRODUCT_CAREERCLAW_PRO_ID: 'prod_test_001',
    POLAR_BENEFIT_CAREERCLAW_PRO_ACCESS_ID: 'ben_test_001',
    INTERNAL_API_KEY: 'test-internal-key-abc123',
    WEB_APP_URL: 'https://app.clawoshq.com',
  },
}))

const { app } = await import('../index.js')

// ── Constants ─────────────────────────────────────────────────────────────────

const FREE_USER = '00000000-0000-0000-0000-000000000020'
const PRO_USER = '00000000-0000-0000-0000-000000000021'
const JWT_FREE = 'Bearer free-user-jwt'
const JWT_PRO = 'Bearer pro-user-jwt'
const VALID_INTERNAL_KEY = 'test-internal-key-abc123'

// ── Supabase helpers ──────────────────────────────────────────────────────────

function makeSupabaseChain(result: { data: unknown; error: null | { message: string } }) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    insert: () => ({ then: (cb: (v: unknown) => void) => cb({ data: null, error: null }) }),
    upsert: () => ({ then: (cb: (v: unknown) => void) => cb({ data: null, error: null }) }),
    update: () => ({
      eq: () => Promise.resolve({ error: null }),
      then: (cb: (v: unknown) => void) => cb({ error: null }),
    }),
    then: (cb: (v: unknown) => void) => cb({ data: null, error: null }),
  }
  return chain
}

function setupAuthMock(userId: string, tier: 'free' | 'pro') {
  mockGetUser.mockResolvedValue({ data: { user: { id: userId } }, error: null })
  mockGetUserById.mockResolvedValue({
    data: { user: { id: userId, email: `${userId}@test.com` } },
    error: null,
  })
  mockFrom.mockImplementation((table: string) => {
    if (table === 'users') return makeSupabaseChain({ data: { tier }, error: null })
    if (table === 'billing_webhook_events')
      return makeSupabaseChain({ data: null, error: { message: 'not found' } })
    if (table === 'user_skill_entitlements') return makeSupabaseChain({ data: null, error: null })
    return makeSupabaseChain({ data: null, error: null })
  })
}

// ── Webhook handler ───────────────────────────────────────────────────────────

describe('POST /billing/webhooks/polar', () => {
  const webhookUrl = '/billing/webhooks/polar'

  beforeEach(() => {
    vi.clearAllMocks()
    // Default: no duplicate in DB
    mockFrom.mockImplementation((table: string) => {
      if (table === 'billing_webhook_events')
        return makeSupabaseChain({ data: null, error: { message: 'not found' } })
      return makeSupabaseChain({ data: null, error: null })
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when webhook signature is invalid', async () => {
    mockVerifyWebhook.mockImplementation(() => {
      throw new WebhookVerificationError('bad sig')
    })

    const res = await app.request(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'webhook-id': 'evt_001' },
      body: JSON.stringify({ type: 'customer.state_changed' }),
    })

    expect(res.status).toBe(401)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe('INVALID_SIGNATURE')
  })

  it('returns 200 with status=duplicate for already-processed events', async () => {
    mockVerifyWebhook.mockReturnValue({ type: 'customer.state_changed', data: {} })
    // Simulate existing record
    mockFrom.mockImplementation((table: string) => {
      if (table === 'billing_webhook_events')
        return makeSupabaseChain({ data: { status: 'processed' }, error: null })
      return makeSupabaseChain({ data: null, error: null })
    })

    const res = await app.request(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'webhook-id': 'evt_dup_001' },
      body: JSON.stringify({ type: 'customer.state_changed' }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string }
    expect(body.status).toBe('duplicate')
  })

  it('returns 200 with status=ignored when customer.state_changed has no externalId', async () => {
    mockVerifyWebhook.mockReturnValue({
      type: 'customer.state_changed',
      data: { externalId: null, activeSubscriptions: [], benefitGrants: [] },
    })
    mockMapCustomerStateToEntitlements.mockReturnValue({
      skillSlug: 'careerclaw',
      tier: 'free',
      isActive: false,
      hasProBenefit: false,
      subscriptionId: null,
      productId: null,
      periodEndsAt: null,
      providerCustomerExternalId: null,
    })

    const res = await app.request(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'webhook-id': 'evt_no_ext' },
      body: JSON.stringify({ type: 'customer.state_changed' }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string; reason: string }
    expect(body.status).toBe('ignored')
    expect(body.reason).toBe('no_user_id')
  })

  it('upserts entitlements and returns 200 on valid customer.state_changed', async () => {
    const upsertMock = vi.fn().mockResolvedValue({ error: null })
    const updateMock = vi.fn().mockReturnValue({ eq: () => Promise.resolve({ error: null }) })
    const insertMock = vi.fn().mockReturnValue({
      then: (cb: (v: unknown) => void) => cb({ data: null, error: null }),
    })

    mockVerifyWebhook.mockReturnValue({
      type: 'customer.state_changed',
      data: { externalId: FREE_USER, activeSubscriptions: [], benefitGrants: [] },
    })
    mockMapCustomerStateToEntitlements.mockReturnValue({
      skillSlug: 'careerclaw',
      tier: 'pro',
      isActive: true,
      hasProBenefit: true,
      subscriptionId: 'sub_0001',
      productId: 'prod_test_001',
      periodEndsAt: '2026-12-31T00:00:00.000Z',
      providerCustomerExternalId: FREE_USER,
    })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'billing_webhook_events') {
        const noExisting = makeSupabaseChain({ data: null, error: { message: 'not found' } })
        return { ...noExisting, insert: insertMock, update: updateMock }
      }
      if (table === 'user_skill_entitlements') {
        return { upsert: upsertMock }
      }
      if (table === 'users') {
        return { update: updateMock }
      }
      return makeSupabaseChain({ data: null, error: null })
    })

    const res = await app.request(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'webhook-id': 'evt_state_001' },
      body: JSON.stringify({ type: 'customer.state_changed' }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string }
    expect(body.status).toBe('processed')
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: FREE_USER, tier: 'pro', skill_slug: 'careerclaw' }),
      expect.anything(),
    )
  })

  it('acknowledges subscription.* events with 200 without calling entitlement mapping', async () => {
    const insertMock = vi.fn().mockReturnValue({
      then: (cb: (v: unknown) => void) => cb({ data: null, error: null }),
    })
    const updateMock = vi.fn().mockReturnValue({ eq: () => Promise.resolve({ error: null }) })

    mockVerifyWebhook.mockReturnValue({ type: 'subscription.created', data: {} })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'billing_webhook_events')
        return {
          ...makeSupabaseChain({ data: null, error: { message: 'not found' } }),
          insert: insertMock,
          update: updateMock,
        }
      return makeSupabaseChain({ data: null, error: null })
    })

    const res = await app.request(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'webhook-id': 'evt_sub_001' },
      body: JSON.stringify({ type: 'subscription.created' }),
    })

    expect(res.status).toBe(200)
    expect(mockMapCustomerStateToEntitlements).not.toHaveBeenCalled()
  })
})

// ── Checkout handler ──────────────────────────────────────────────────────────

describe('POST /billing/checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 without auth header', async () => {
    const res = await app.request('/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(401)
  })

  it('returns checkout URL for authenticated free user', async () => {
    setupAuthMock(FREE_USER, 'free')
    mockCreateCheckoutSession.mockResolvedValue({ url: 'https://polar.sh/checkout/abc' })

    const res = await app.request('/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: JWT_FREE },
      body: JSON.stringify({ source: 'web' }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { url: string }
    expect(body.url).toBe('https://polar.sh/checkout/abc')
    expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: FREE_USER,
        source: 'web',
        customerEmail: `${FREE_USER}@test.com`,
      }),
    )
  })

  it('passes source=telegram when specified', async () => {
    setupAuthMock(FREE_USER, 'free')
    mockCreateCheckoutSession.mockResolvedValue({ url: 'https://polar.sh/checkout/tg' })

    await app.request('/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: JWT_FREE },
      body: JSON.stringify({ source: 'telegram' }),
    })

    expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ source: 'telegram' }),
    )
  })
})

// ── Portal handler ────────────────────────────────────────────────────────────

describe('POST /billing/portal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 without auth header', async () => {
    const res = await app.request('/billing/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status).toBe(401)
  })

  it('returns portal URL for authenticated pro user', async () => {
    setupAuthMock(PRO_USER, 'pro')
    mockCreateCustomerPortalSession.mockResolvedValue({ url: 'https://polar.sh/portal/session' })

    const res = await app.request('/billing/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: JWT_PRO },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { url: string }
    expect(body.url).toBe('https://polar.sh/portal/session')
    expect(mockCreateCustomerPortalSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: PRO_USER }),
    )
  })
})

// ── Internal sync handler ─────────────────────────────────────────────────────

describe('POST /internal/billing/sync/:userId', () => {
  const syncUrl = (uid: string) => `/internal/billing/sync/${uid}`

  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockImplementation(() => makeSupabaseChain({ data: null, error: null }))
  })

  it('returns 401 without internal API key', async () => {
    const res = await app.request(syncUrl(FREE_USER), { method: 'POST' })
    expect(res.status).toBe(401)
  })

  it('returns 401 with wrong internal API key', async () => {
    const res = await app.request(syncUrl(FREE_USER), {
      method: 'POST',
      headers: { 'X-Internal-Api-Key': 'wrong-key' },
    })
    expect(res.status).toBe(401)
  })

  it('returns sync result with correct INTERNAL_API_KEY', async () => {
    mockGetCustomerStateByExternalId.mockResolvedValue(null)
    mockMapCustomerStateToEntitlements.mockReturnValue({
      skillSlug: 'careerclaw',
      tier: 'free',
      isActive: false,
      hasProBenefit: false,
      subscriptionId: null,
      productId: null,
      periodEndsAt: null,
      providerCustomerExternalId: null,
    })

    const upsertMock = vi.fn().mockResolvedValue({ error: null })
    const updateMock = vi.fn().mockReturnValue({ eq: () => Promise.resolve({ error: null }) })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_skill_entitlements') return { upsert: upsertMock }
      if (table === 'users') return { update: updateMock }
      return makeSupabaseChain({ data: null, error: null })
    })

    const res = await app.request(syncUrl(FREE_USER), {
      method: 'POST',
      headers: { 'X-Internal-Api-Key': VALID_INTERNAL_KEY },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      userId: string
      tier: string
      customerFound: boolean
    }
    expect(body.userId).toBe(FREE_USER)
    expect(body.tier).toBe('free')
    expect(body.customerFound).toBe(false)
  })

  it('returns tier=pro when Polar state is active Pro subscriber', async () => {
    const fakeState = { externalId: PRO_USER, activeSubscriptions: [], benefitGrants: [] }
    mockGetCustomerStateByExternalId.mockResolvedValue(fakeState)
    mockMapCustomerStateToEntitlements.mockReturnValue({
      skillSlug: 'careerclaw',
      tier: 'pro',
      isActive: true,
      hasProBenefit: true,
      subscriptionId: 'sub_0001',
      productId: 'prod_test_001',
      periodEndsAt: '2026-12-31T00:00:00.000Z',
      providerCustomerExternalId: PRO_USER,
    })

    const upsertMock = vi.fn().mockResolvedValue({ error: null })
    const updateMock = vi.fn().mockReturnValue({ eq: () => Promise.resolve({ error: null }) })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_skill_entitlements') return { upsert: upsertMock }
      if (table === 'users') return { update: updateMock }
      return makeSupabaseChain({ data: null, error: null })
    })

    const res = await app.request(syncUrl(PRO_USER), {
      method: 'POST',
      headers: { 'X-Internal-Api-Key': VALID_INTERNAL_KEY },
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { tier: string; isActive: boolean }
    expect(body.tier).toBe('pro')
    expect(body.isActive).toBe(true)
  })
})

// ── Hot path: /chat must NOT call Polar ───────────────────────────────────────

describe('Hot path — no Polar API call on /chat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  beforeEach(() => {
    vi.clearAllMocks()
  })
  it('does not call any Polar billing function when processing a chat message', async () => {
    setupAuthMock(FREE_USER, 'free')

    const { callLLM } = await import('../llm.js')
    vi.mocked(callLLM).mockResolvedValue({ type: 'text', content: 'Hello!', provider: 'anthropic' })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return makeSupabaseChain({ data: { tier: 'free' }, error: null })
      if (table === 'sessions')
        return makeSupabaseChain({ data: null, error: { message: 'no session' } })
      if (table === 'careerclaw_profiles') return makeSupabaseChain({ data: null, error: null })
      if (table === 'user_skill_entitlements') return makeSupabaseChain({ data: null, error: null })
      return makeSupabaseChain({ data: null, error: null })
    })

    await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: JWT_FREE },
      body: JSON.stringify({ userId: FREE_USER, channel: 'web', message: 'Hi' }),
    })

    // None of the Polar API functions should have been called.
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled()
    expect(mockCreateCustomerPortalSession).not.toHaveBeenCalled()
    expect(mockGetCustomerStateByExternalId).not.toHaveBeenCalled()
    expect(mockVerifyWebhook).not.toHaveBeenCalled()
  })
})
