/**
 * routes/billing.ts — Polar.sh billing endpoint handlers.
 *
 * Exports individual Hono handlers, matching the pattern used by chat.ts,
 * resume.ts, and link-token.ts. Wired in apps/api/src/index.ts.
 *
 * Handlers:
 *   webhookHandler     POST /billing/webhooks/polar  (no JWT; HMAC-signed)
 *   checkoutHandler    POST /billing/checkout        (requireAuth)
 *   portalHandler      POST /billing/portal          (requireAuth)
 *   syncHandler        POST /internal/billing/sync/:userId  (INTERNAL_API_KEY)
 *
 * Security notes:
 *   - webhookHandler reads the raw body BEFORE any parsing for HMAC verification.
 *   - Signature validation runs before any DB write.
 *   - Every event is recorded in billing_webhook_events for idempotency.
 *   - Already-processed events are acknowledged 200 and skipped.
 *   - No Polar API call occurs on the normal /chat request path.
 */

import type { Context } from 'hono'
import { timingSafeEqual } from 'node:crypto'
import {
  createPolarClient,
  createCheckoutSession,
  createCustomerPortalSession,
  getCustomerStateByExternalId,
  verifyWebhook,
  mapCustomerStateToEntitlements,
  WebhookVerificationError,
} from '@clawos/billing'
import type { EntitlementResult } from '@clawos/billing'
import type { CustomerState } from '@polar-sh/sdk/models/components/customerstate.js'
import type { Json } from '@clawos/shared'
import { createServerClient } from '@clawos/shared'
import { ENV } from '../env.js'

// ── Internal helpers ──────────────────────────────────────────────────────────

interface BillingConfig {
  accessToken: string
  webhookSecret: string
  productId: string
  benefitId: string
}

/** Returns the billing config or null when env vars are missing. */
function getBillingConfig(): BillingConfig | null {
  const accessToken = ENV.POLAR_ACCESS_TOKEN
  const webhookSecret = ENV.POLAR_WEBHOOK_SECRET
  const productId = ENV.POLAR_PRODUCT_CAREERCLAW_PRO_ID
  const benefitId = ENV.POLAR_BENEFIT_CAREERCLAW_PRO_ACCESS_ID
  if (!accessToken || !webhookSecret || !productId || !benefitId) return null
  return { accessToken, webhookSecret, productId, benefitId }
}

/**
 * Upsert user_skill_entitlements and refresh users.tier summary cache.
 * Used by webhookHandler and syncHandler.
 */
async function applyEntitlements(userId: string, result: EntitlementResult): Promise<void> {
  const supabase = createServerClient()
  const now = new Date().toISOString()

  const { error: upsertError } = await supabase.from('user_skill_entitlements').upsert(
    {
      user_id: userId,
      skill_slug: result.skillSlug,
      tier: result.tier,
      status: result.isActive ? 'active' : 'inactive',
      provider: 'polar',
      provider_product_id: result.productId,
      provider_subscription_id: result.subscriptionId,
      provider_customer_external_id: result.providerCustomerExternalId,
      period_ends_at: result.periodEndsAt,
      metadata: { hasProBenefit: result.hasProBenefit },
      updated_at: now,
    },
    { onConflict: 'user_id,skill_slug' },
  )

  if (upsertError) {
    throw new Error(
      `Failed to upsert user_skill_entitlements for user ${userId}: ${upsertError.message}`,
    )
  }

  // Refresh users.tier derived summary cache.
  const { error: updateError } = await supabase
    .from('users')
    .update({ tier: result.tier })
    .eq('id', userId)

  if (updateError) {
    throw new Error(`Failed to update users.tier for user ${userId}: ${updateError.message}`)
  }
}

// ── POST /billing/webhooks/polar ──────────────────────────────────────────────

export async function webhookHandler(c: Context): Promise<Response> {
  const config = getBillingConfig()
  if (!config) {
    return c.json({ code: 'BILLING_NOT_CONFIGURED', message: 'Billing not configured' }, 503)
  }

  // Must read the raw body before any body parsing for HMAC to work correctly.
  const rawBody = await c.req.text()

  const headers: Record<string, string> = {}
  c.req.raw.headers.forEach((v: string, k: string) => {
    headers[k] = v
  })

  // ── 1. Verify HMAC signature ──────────────────────────────────────────────
  let event
  try {
    event = verifyWebhook(rawBody, headers, config.webhookSecret)
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      console.warn('[billing] Webhook signature invalid — rejected')
      return c.json({ code: 'INVALID_SIGNATURE', message: 'Invalid webhook signature' }, 401)
    }
    throw err
  }

  // The standard-webhooks spec uses webhook-id; Svix uses svix-id.
  const eventId = headers['webhook-id'] ?? headers['svix-id'] ?? `gen_${Date.now()}`
  const eventType: string = (event as { type: string }).type

  const supabase = createServerClient()

  // ── 2. Idempotency check ──────────────────────────────────────────────────
  const { data: existing } = await supabase
    .from('billing_webhook_events')
    .select('status')
    .eq('event_id', eventId)
    .maybeSingle()

  if (existing) {
    console.log(`[billing] Duplicate webhook ${eventId} (${eventType}) — skipped`)
    return c.json({ received: true, status: 'duplicate' })
  }

  // ── 3. Record event as processing ─────────────────────────────────────────
  const { error: insertError } = await supabase.from('billing_webhook_events').insert({
    event_id: eventId,
    event_type: eventType,
    status: 'processing',
    payload: JSON.parse(rawBody) as Json,
  })

  if (insertError) {
    // Unique-constraint violation (code 23505) means a concurrent request
    // already inserted this event — treat as duplicate, not an error.
    if (insertError.code === '23505') {
      console.log(`[billing] Concurrent duplicate webhook ${eventId} (${eventType}) — skipped`)
      return c.json({ received: true, status: 'duplicate' })
    }

    console.error(
      `[billing] Failed to insert billing_webhook_events for ${eventId}:`,
      insertError.message,
    )
    return c.json({
      received: true,
      status: 'error',
      error: `Failed to record event: ${insertError.message}`,
    })
  }

  // ── 4. Process ────────────────────────────────────────────────────────────
  try {
    if (eventType === 'customer.state_changed') {
      const state = (event as { type: 'customer.state_changed'; data: CustomerState }).data
      const userId = state.externalId

      if (!userId) {
        const { error: updateError } = await supabase
          .from('billing_webhook_events')
          .update({ status: 'ignored', processed_at: new Date().toISOString() })
          .eq('event_id', eventId)

        if (updateError) {
          throw new Error(
            `Failed to update billing_webhook_events for event ${eventId}: ${updateError.message}`,
          )
        }

        return c.json({ received: true, status: 'ignored', reason: 'no_external_id' })
      }

      const entitlements = mapCustomerStateToEntitlements(state, {
        careerclawProProductId: config.productId,
        careerclawProBenefitId: config.benefitId,
      })

      await applyEntitlements(userId, entitlements)
      console.log(
        `[billing] customer.state_changed user=${userId} tier=${entitlements.tier} active=${entitlements.isActive}`,
      )
    } else if (
      eventType === 'subscription.created' ||
      eventType === 'subscription.updated' ||
      eventType === 'subscription.active' ||
      eventType === 'subscription.canceled' ||
      eventType === 'subscription.uncanceled' ||
      eventType === 'subscription.revoked'
    ) {
      // Subscription lifecycle events are stored for audit. Reconciliation is
      // handled via customer.state_changed which fires for all these same events.
      console.log(`[billing] Subscription event ${eventType} — stored for audit`)
    } else {
      console.log(`[billing] Unhandled event type ${eventType} — acknowledged`)
    }

    const { error: markProcessedError } = await supabase
      .from('billing_webhook_events')
      .update({ status: 'processed', processed_at: new Date().toISOString() })
      .eq('event_id', eventId)

    if (markProcessedError) {
      console.error(
        `[billing] Failed to mark event ${eventId} as processed:`,
        markProcessedError.message,
      )
    }

    return c.json({ received: true, status: 'processed' })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error(`[billing] Webhook processing error for ${eventId}:`, errorMsg)

    const { error: markErrorError } = await supabase
      .from('billing_webhook_events')
      .update({ status: 'error', error: errorMsg, processed_at: new Date().toISOString() })
      .eq('event_id', eventId)

    if (markErrorError) {
      console.error(`[billing] Failed to mark event ${eventId} as error:`, markErrorError.message)
    }

    // Return 200 — the event is stored. A 5xx would trigger infinite Polar retries.
    return c.json({ received: true, status: 'error', error: errorMsg })
  }
}

// ── POST /billing/checkout ────────────────────────────────────────────────────

export async function checkoutHandler(c: Context): Promise<Response> {
  const config = getBillingConfig()
  if (!config) {
    return c.json({ code: 'BILLING_NOT_CONFIGURED', message: 'Billing not configured' }, 503)
  }

  const userId = c.get('userId') as string

  let body: { source?: string } = {}
  try {
    body = await c.req.json<{ source?: string }>()
  } catch {
    // Empty body is fine.
  }

  const source = body.source === 'telegram' ? 'telegram' : 'web'

  const polar = createPolarClient({ accessToken: config.accessToken, env: ENV.POLAR_ENV })

  try {
    const { url } = await createCheckoutSession(polar, {
      userId,
      productId: config.productId,
      successUrl: `${ENV.WEB_APP_URL}/billing/return?upgraded=true`,
      returnUrl: `${ENV.WEB_APP_URL}/settings`,
      source,
    })
    return c.json({ url })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Checkout session creation failed'
    console.error('[billing] Checkout session error:', msg)
    return c.json({ code: 'CHECKOUT_FAILED', message: msg }, 500)
  }
}

// ── POST /billing/portal ──────────────────────────────────────────────────────

export async function portalHandler(c: Context): Promise<Response> {
  const config = getBillingConfig()
  if (!config) {
    return c.json({ code: 'BILLING_NOT_CONFIGURED', message: 'Billing not configured' }, 503)
  }

  const userId = c.get('userId') as string

  const polar = createPolarClient({ accessToken: config.accessToken, env: ENV.POLAR_ENV })

  try {
    const { url } = await createCustomerPortalSession(polar, {
      userId,
      returnUrl: `${ENV.WEB_APP_URL}/settings`,
    })
    return c.json({ url })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Portal session creation failed'
    console.error('[billing] Portal session error:', msg)
    return c.json({ code: 'PORTAL_FAILED', message: msg }, 500)
  }
}

// ── POST /internal/billing/sync/:userId ──────────────────────────────────────

export async function syncHandler(c: Context): Promise<Response> {
  // Validate INTERNAL_API_KEY — distinct from SERVICE_SECRET used by adapters.
  const incomingKey = c.req.header('X-Internal-Api-Key')
  const configured = ENV.INTERNAL_API_KEY

  if (!configured) {
    return c.json({ code: 'NOT_CONFIGURED', message: 'Internal API key not configured' }, 503)
  }
  if (!incomingKey) {
    return c.json({ code: 'UNAUTHORIZED', message: 'Missing X-Internal-Api-Key' }, 401)
  }

  const a = Buffer.from(incomingKey, 'utf8')
  const b = Buffer.from(configured, 'utf8')
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return c.json({ code: 'UNAUTHORIZED', message: 'Invalid internal API key' }, 401)
  }

  const config = getBillingConfig()
  if (!config) {
    return c.json({ code: 'BILLING_NOT_CONFIGURED', message: 'Billing not configured' }, 503)
  }

  const userId = c.req.param('userId')
  if (!userId) {
    return c.json({ code: 'BAD_REQUEST', message: 'Missing userId param' }, 400)
  }

  const polar = createPolarClient({ accessToken: config.accessToken, env: ENV.POLAR_ENV })

  try {
    const state = await getCustomerStateByExternalId(polar, userId)
    const entitlements = mapCustomerStateToEntitlements(state, {
      careerclawProProductId: config.productId,
      careerclawProBenefitId: config.benefitId,
    })

    await applyEntitlements(userId, entitlements)

    return c.json({
      userId,
      tier: entitlements.tier,
      isActive: entitlements.isActive,
      hasProBenefit: entitlements.hasProBenefit,
      subscriptionId: entitlements.subscriptionId,
      periodEndsAt: entitlements.periodEndsAt,
      customerFound: state !== null,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sync failed'
    console.error(`[billing] Sync error for ${userId}:`, msg)
    return c.json({ code: 'SYNC_FAILED', message: msg }, 500)
  }
}
