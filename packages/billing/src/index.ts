// Polar.sh billing client — stub implementation
// Full implementation: Chat 7 (Billing Integration)
//
// Polar.sh is the authoritative source of subscription truth.
// Supabase users.tier is a cached entitlement snapshot updated by webhooks.
// The Agent API reads users.tier directly — no Polar.sh API call on the hot path.

import type { Tier } from '@clawos/shared'

// ── Types ─────────────────────────────────────────────────────────────────────

export type { Tier }

export interface Subscription {
  id: string
  userId: string
  tier: Tier
  status: 'active' | 'cancelled' | 'expired'
  currentPeriodEnd: string | null
  polarSubscriptionId: string | null
}

export interface LicenseValidationResult {
  valid: boolean
  tier: Tier
}

export interface CheckoutSession {
  url: string
  expiresAt: string
}

export interface WebhookEvent {
  type:
    | 'subscription.created'
    | 'subscription.updated'
    | 'subscription.renewed'
    | 'subscription.cancelled'
    | 'subscription.uncancelled'
    | 'subscription.revoked'
  data: {
    id: string
    status: string
    customerId: string
    productId: string
    currentPeriodEnd: string | null
  }
}

// ── Client stubs ──────────────────────────────────────────────────────────────

/**
 * Validate a Polar.sh license key.
 * TODO Chat 7: Implement with Polar.sh SDK
 */
export async function validateLicense(_key: string): Promise<LicenseValidationResult> {
  throw new Error('Not implemented — Chat 7: Billing Integration')
}

/**
 * Get a user's current Polar.sh subscription.
 * TODO Chat 7: Implement with Polar.sh SDK
 */
export async function getSubscription(_userId: string): Promise<Subscription | null> {
  throw new Error('Not implemented — Chat 7: Billing Integration')
}

/**
 * Create a Polar.sh checkout session and return the URL.
 * TODO Chat 7: Implement with Polar.sh SDK
 */
export async function createCheckoutSession(
  _userId: string,
  _productId: string,
): Promise<CheckoutSession> {
  throw new Error('Not implemented — Chat 7: Billing Integration')
}

/**
 * Validate a Polar.sh webhook signature.
 * TODO Chat 7: Implement HMAC validation
 */
export function validateWebhookSignature(_payload: string, _signature: string): boolean {
  throw new Error('Not implemented — Chat 7: Billing Integration')
}

/**
 * Parse a Polar.sh webhook event.
 * TODO Chat 7: Implement with Polar.sh SDK
 */
export function parseWebhookEvent(_payload: string): WebhookEvent {
  throw new Error('Not implemented — Chat 7: Billing Integration')
}

/**
 * Resolve the Tier from a Polar.sh subscription status.
 * Free tier is the safe default — paying users are never locked out.
 */
export function resolveTierFromSubscription(subscription: Subscription | null): Tier {
  if (!subscription) return 'free'
  if (subscription.status === 'active' || subscription.status === 'cancelled') return 'pro'
  return 'free'
}
