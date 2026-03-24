/**
 * @clawos/billing — Polar.sh billing client.
 *
 * Provides:
 *   createCheckoutSession        — server-side checkout session URL
 *   createCustomerPortalSession  — portal magic link URL
 *   getCustomerStateByExternalId — full customer state snapshot from Polar
 *   verifyWebhook                — raw-body HMAC verification -> typed event
 *   mapCustomerStateToEntitlements — pure: CustomerState -> EntitlementResult
 *
 * Design rules (Platform Strategy §5.7):
 *   - Polar is authoritative; Supabase stores a fast-read cache.
 *   - No Polar API call on the normal chat request hot path.
 *   - Paying users must not lose access if Polar is temporarily unavailable.
 *   - external_customer_id = Supabase Auth UUID; no license-key flows.
 */

import { Polar, ServerProduction, ServerSandbox } from '@polar-sh/sdk'
import { validateEvent, WebhookVerificationError } from '@polar-sh/sdk/webhooks'
import type { CustomerState } from '@polar-sh/sdk/models/components/customerstate.js'

export type { CustomerState }
export { WebhookVerificationError }

// ── Re-exports ────────────────────────────────────────────────────────────────

export type { Tier } from '@clawos/shared'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CheckoutSessionInput {
  /** Supabase Auth UUID — used as Polar external_customer_id. */
  userId: string
  productId: string
  successUrl: string
  returnUrl: string
  /** Source channel for audit metadata. */
  source: 'web' | 'telegram'
}

export interface CustomerPortalInput {
  /** Supabase Auth UUID — used as Polar external_customer_id. */
  userId: string
  returnUrl: string
}

/**
 * Entitlement result derived from a Polar CustomerState snapshot.
 * Used to update Supabase cache; never read directly on the hot path.
 */
export interface EntitlementResult {
  skillSlug: 'careerclaw'
  tier: 'free' | 'pro'
  /** True when an active subscription exists for the product. */
  isActive: boolean
  /** Pro Feature Flag benefit is present and granted. */
  hasProBenefit: boolean
  subscriptionId: string | null
  productId: string | null
  periodEndsAt: string | null
  providerCustomerExternalId: string | null
}

/**
 * A verified and parsed Polar webhook event (typed discriminated union).
 */
export type VerifiedEvent = ReturnType<typeof validateEvent>

// ── Polar client factory ──────────────────────────────────────────────────────

/** Build a typed Polar client from environment config. */
export function createPolarClient(opts: {
  accessToken: string
  env: 'sandbox' | 'production'
}): Polar {
  return new Polar({
    accessToken: opts.accessToken,
    server: opts.env === 'production' ? ServerProduction : ServerSandbox,
  })
}

// ── Public billing functions ──────────────────────────────────────────────────

/**
 * Create a Polar checkout session and return the hosted URL.
 *
 * The Supabase UUID is passed as externalCustomerId so Polar auto-links
 * the purchase to the correct user when the webhook fires.
 */
export async function createCheckoutSession(
  polar: Polar,
  input: CheckoutSessionInput,
): Promise<{ url: string }> {
  const checkout = await polar.checkouts.create({
    products: [input.productId],
    externalCustomerId: input.userId,
    successUrl: input.successUrl,
    returnUrl: input.returnUrl,
    metadata: {
      userId: input.userId,
      skillSlug: 'careerclaw',
      source: input.source,
    },
  })

  return { url: checkout.url }
}

/**
 * Create a Polar customer portal session and return the magic-link URL.
 *
 * Uses externalCustomerId — no Polar-internal customer ID lookup required.
 */
export async function createCustomerPortalSession(
  polar: Polar,
  input: CustomerPortalInput,
): Promise<{ url: string }> {
  const session = await polar.customerSessions.create({
    externalCustomerId: input.userId,
    returnUrl: input.returnUrl,
  })

  return { url: session.customerPortalUrl }
}

/**
 * Fetch the full customer state snapshot from Polar by Supabase UUID.
 *
 * Returns null when the customer does not yet exist in Polar (never purchased).
 * Callers must treat null as free tier — never throw or deny access.
 */
export async function getCustomerStateByExternalId(
  polar: Polar,
  userId: string,
): Promise<CustomerState | null> {
  try {
    const state = await polar.customers.getStateExternal({
      externalId: userId,
    })
    return state
  } catch (err) {
    // Polar returns 404 / ResourceNotFound for unknown external IDs.
    const msg = err instanceof Error ? err.message : String(err)
    if (
      msg.includes('404') ||
      msg.toLowerCase().includes('not found') ||
      msg.includes('ResourceNotFound')
    ) {
      return null
    }
    throw err
  }
}

/**
 * Verify a raw Polar webhook request body against the HMAC secret.
 *
 * Returns the typed event payload on success.
 * Throws WebhookVerificationError on invalid signature.
 *
 * @param rawBody  Raw request body — must not be parsed/re-serialised.
 * @param headers  Request headers as a plain Record (lowercase keys ok).
 * @param secret   POLAR_WEBHOOK_SECRET env var (plain text; SDK base64-encodes it).
 */
export function verifyWebhook(
  rawBody: string | Buffer,
  headers: Record<string, string>,
  secret: string,
): VerifiedEvent {
  return validateEvent(rawBody, headers, secret)
}

/**
 * Map a Polar CustomerState snapshot to a ClawOS EntitlementResult.
 *
 * Pure function — no I/O. Called after webhook processing and admin sync.
 *
 * Pro = active subscription for the CareerClaw product OR Feature Flag benefit
 * present. The dual check makes entitlements robust against product ID drift.
 */
export function mapCustomerStateToEntitlements(
  state: CustomerState | null,
  opts: {
    careerclawProProductId: string
    careerclawProBenefitId: string
  },
): EntitlementResult {
  if (!state) {
    return {
      skillSlug: 'careerclaw',
      tier: 'free',
      isActive: false,
      hasProBenefit: false,
      subscriptionId: null,
      productId: null,
      periodEndsAt: null,
      providerCustomerExternalId: null,
    }
  }

  const activeSub = state.activeSubscriptions?.find(
    (s) => s.productId === opts.careerclawProProductId,
  )

  const hasBenefit =
    state.grantedBenefits?.some(
      (g: { benefitId: string }) => g.benefitId === opts.careerclawProBenefitId,
    ) ?? false

  const isPro = activeSub !== undefined || hasBenefit

  return {
    skillSlug: 'careerclaw',
    tier: isPro ? 'pro' : 'free',
    isActive: isPro,
    hasProBenefit: hasBenefit,
    subscriptionId: activeSub?.id ?? null,
    productId: activeSub?.productId ?? null,
    periodEndsAt: activeSub?.currentPeriodEnd?.toISOString() ?? null,
    providerCustomerExternalId: state.externalId ?? null,
  }
}
