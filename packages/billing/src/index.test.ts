/**
 * packages/billing/src/index.test.ts
 *
 * Unit tests for the @clawos/billing package.
 * Tests pure functions and mocked SDK interactions only.
 * No real Polar API calls.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  mapCustomerStateToEntitlements,
  verifyWebhook,
  createCheckoutSession,
  createCustomerPortalSession,
  WebhookVerificationError,
} from './index.js'
import type { CustomerState } from './index.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PRODUCT_ID = 'prod_careerclaw_pro_001'
const BENEFIT_ID = 'ben_careerclaw_pro_access_001'
const USER_ID = '00000000-0000-0000-0000-000000000001'
const SUB_ID = 'sub_0001'

const MAPPING_OPTS = {
  careerclawProProductId: PRODUCT_ID,
  careerclawProBenefitId: BENEFIT_ID,
}

function makeCustomerState(overrides: Partial<CustomerState> = {}): CustomerState {
  return {
    id: 'cus_0001',
    createdAt: new Date(),
    modifiedAt: new Date(),
    metadata: {},
    externalId: USER_ID,
    email: 'user@example.com',
    emailVerified: true,
    name: 'Test User',
    billingAddress: null,
    taxId: null,
    organizationId: 'org_0001',
    avatarUrl: null,
    customerType: null,
    activeSubscriptions: [],
    grantedBenefits: [],
    activeMeters: [],
    ...overrides,
  } as unknown as CustomerState
}

// ── mapCustomerStateToEntitlements — pure function ────────────────────────────

describe('mapCustomerStateToEntitlements', () => {
  it('returns free tier when state is null', () => {
    const result = mapCustomerStateToEntitlements(null, MAPPING_OPTS)
    expect(result.tier).toBe('free')
    expect(result.isActive).toBe(false)
    expect(result.hasProBenefit).toBe(false)
    expect(result.subscriptionId).toBeNull()
    expect(result.productId).toBeNull()
    expect(result.periodEndsAt).toBeNull()
    expect(result.providerCustomerExternalId).toBeNull()
  })

  it('returns free tier when customer has no active subscriptions or benefits', () => {
    const state = makeCustomerState()
    const result = mapCustomerStateToEntitlements(state, MAPPING_OPTS)
    expect(result.tier).toBe('free')
    expect(result.isActive).toBe(false)
    expect(result.hasProBenefit).toBe(false)
  })

  it('returns pro tier when active subscription matches product ID', () => {
    const periodEnd = new Date('2026-12-31T00:00:00Z')
    const state = makeCustomerState({
      activeSubscriptions: [
        {
          id: SUB_ID,
          productId: PRODUCT_ID,
          currentPeriodEnd: periodEnd,
        } as unknown as CustomerState['activeSubscriptions'][0],
      ],
    })
    const result = mapCustomerStateToEntitlements(state, MAPPING_OPTS)
    expect(result.tier).toBe('pro')
    expect(result.isActive).toBe(true)
    expect(result.subscriptionId).toBe(SUB_ID)
    expect(result.productId).toBe(PRODUCT_ID)
    expect(result.periodEndsAt).toBe(periodEnd.toISOString())
  })

  it('returns pro tier when benefit grant matches benefit ID (even without subscription)', () => {
    const state = makeCustomerState({
      grantedBenefits: [
        { benefitId: BENEFIT_ID } as unknown as CustomerState['grantedBenefits'][0],
      ],
    })
    const result = mapCustomerStateToEntitlements(state, MAPPING_OPTS)
    expect(result.tier).toBe('pro')
    expect(result.isActive).toBe(true)
    expect(result.hasProBenefit).toBe(true)
    expect(result.subscriptionId).toBeNull() // no subscription — benefit only
  })

  it('returns free tier when subscription is for a different product ID', () => {
    const state = makeCustomerState({
      activeSubscriptions: [
        {
          id: 'sub_other',
          productId: 'prod_other_skill',
          currentPeriodEnd: new Date(),
        } as unknown as CustomerState['activeSubscriptions'][0],
      ],
    })
    const result = mapCustomerStateToEntitlements(state, MAPPING_OPTS)
    expect(result.tier).toBe('free')
    expect(result.isActive).toBe(false)
  })

  it('always sets skillSlug to careerclaw', () => {
    const result = mapCustomerStateToEntitlements(null, MAPPING_OPTS)
    expect(result.skillSlug).toBe('careerclaw')
  })

  it('carries providerCustomerExternalId from state.externalId', () => {
    const state = makeCustomerState({ externalId: USER_ID })
    const result = mapCustomerStateToEntitlements(state, MAPPING_OPTS)
    expect(result.providerCustomerExternalId).toBe(USER_ID)
  })
})

// ── verifyWebhook — delegates to @polar-sh/sdk/webhooks validateEvent ─────────

describe('verifyWebhook', () => {
  it('throws WebhookVerificationError on invalid signature', () => {
    expect(() => verifyWebhook('{"type":"customer.state_changed"}', {}, 'wrong-secret')).toThrow(
      WebhookVerificationError,
    )
  })
})

// ── createCheckoutSession — mocked Polar client ───────────────────────────────

describe('createCheckoutSession', () => {
  it('returns the checkout URL from the Polar client', async () => {
    const mockPolar = {
      checkouts: {
        create: vi.fn().mockResolvedValue({ url: 'https://polar.sh/checkout/test123' }),
      },
    }

    const result = await createCheckoutSession(mockPolar as never, {
      userId: USER_ID,
      productId: PRODUCT_ID,
      successUrl: 'https://app.clawoshq.com/billing/return',
      returnUrl: 'https://app.clawoshq.com/settings',
      source: 'web',
    })

    expect(result).toEqual({ url: 'https://polar.sh/checkout/test123' })
    expect(mockPolar.checkouts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        products: [PRODUCT_ID],
        externalCustomerId: USER_ID,
        metadata: expect.objectContaining({ source: 'web', skillSlug: 'careerclaw' }),
      }),
    )
  })

  it('passes source=telegram in metadata for Telegram upgrades', async () => {
    const mockPolar = {
      checkouts: {
        create: vi.fn().mockResolvedValue({ url: 'https://polar.sh/checkout/tg456' }),
      },
    }

    await createCheckoutSession(mockPolar as never, {
      userId: USER_ID,
      productId: PRODUCT_ID,
      successUrl: 'https://app.clawoshq.com/billing/return',
      returnUrl: 'https://app.clawoshq.com/settings',
      source: 'telegram',
    })

    expect(mockPolar.checkouts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ source: 'telegram' }),
      }),
    )
  })
})

// ── createCustomerPortalSession — mocked Polar client ────────────────────────

describe('createCustomerPortalSession', () => {
  it('returns the customer portal URL', async () => {
    const mockPolar = {
      customerSessions: {
        create: vi.fn().mockResolvedValue({
          customerPortalUrl: 'https://polar.sh/portal/session_abc',
          id: 'cs_0001',
        }),
      },
    }

    const result = await createCustomerPortalSession(mockPolar as never, {
      userId: USER_ID,
      returnUrl: 'https://app.clawoshq.com/settings',
    })

    expect(result).toEqual({ url: 'https://polar.sh/portal/session_abc' })
    expect(mockPolar.customerSessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ externalCustomerId: USER_ID }),
    )
  })
})
