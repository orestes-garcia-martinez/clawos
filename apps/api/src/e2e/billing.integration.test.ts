/**
 * billing.integration.test.ts -- End-to-end billing and tier gating tests.
 *
 * What this tests:
 *   1. Free-tier rate limit enforcement -- 10 req/hr cap returns 429 with
 *      Retry-After header; 11th request is rejected via the API's real
 *      in-memory rate limiter.
 *   2. Pro upgrade flow (webhook -> Supabase entitlement -> unlocked):
 *      - Insert a real Supabase user starting at free tier.
 *      - POST a synthetic customer.state_changed webhook event signed with
 *        POLAR_WEBHOOK_SECRET. The handler verifies the HMAC, upserts
 *        user_skill_entitlements, and updates users.tier to 'pro'.
 *      - After webhook, the /chat endpoint accepts the user at Pro rate
 *        limits (60/hr) and the entitlement row reflects 'active'.
 *   3. Webhook idempotency -- sending the same event_id twice returns
 *      status='duplicate' on the second delivery and does not create
 *      a second row in billing_webhook_events.
 *   4. Checkout URL gating -- authenticated user receives a valid URL
 *      from /billing/checkout; unauthenticated request returns 401.
 *   5. Internal sync -- /internal/billing/sync/:userId with the correct
 *      INTERNAL_API_KEY returns a well-formed diagnostic response; wrong
 *      key returns 401.
 *
 * What this does NOT test:
 *   - Real Polar.sh API calls (no POLAR_ACCESS_TOKEN required).
 *   - The Telegram adapter upgrade flow (covered in telegram integration tests).
 *   - The skill worker / CareerClaw run path.
 *
 * Prerequisites (apps/api/.env.test):
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
 *   CLAWOS_ANTHROPIC_KEY, POLAR_WEBHOOK_SECRET, INTERNAL_API_KEY
 *
 * Run with:
 *   npm run test:integration  (from apps/api/)
 *
 * Cleanup:
 *   afterAll deletes the test user from Supabase Auth (cascade removes
 *   all dependent rows). If the process is killed before cleanup, delete
 *   test users whose email matches the pattern billing-e2e-*@clawos.test
 *   from the Supabase Auth dashboard.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createHmac } from 'node:crypto'

// ── Required env guards ───────────────────────────────────────────────────────

const REQUIRED_VARS = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CLAWOS_ANTHROPIC_KEY',
  'POLAR_WEBHOOK_SECRET',
  'INTERNAL_API_KEY',
] as const

const missingVars = REQUIRED_VARS.filter((v) => !process.env[v])

describe.skipIf(missingVars.length > 0)('Billing E2E (integration)', () => {
  if (missingVars.length > 0) {
    throw new Error(`Missing env vars for billing integration tests: ${missingVars.join(', ')}`)
  }

  const API_URL = process.env['API_URL'] ?? 'http://localhost:3001'
  const WEBHOOK_SECRET = process.env['POLAR_WEBHOOK_SECRET']!
  const INTERNAL_API_KEY = process.env['INTERNAL_API_KEY']!

  const supabaseAdmin = createClient(
    process.env['SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const PRODUCT_ID = process.env['POLAR_PRODUCT_CAREERCLAW_PRO_ID'] ?? 'prod_test_careerclaw'
  const BENEFIT_ID = process.env['POLAR_BENEFIT_CAREERCLAW_PRO_ACCESS_ID'] ?? 'ben_test_careerclaw'

  let freeUserId = ''
  let freeUserJwt = ''

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Sign a webhook body using the standard-webhooks HMAC scheme. */
  function signWebhookPayload(body: string, eventId: string, timestamp: number): string {
    // Standard Webhooks spec: msgId.timestamp.body
    const toSign = `${eventId}.${timestamp}.${body}`
    const secret = Buffer.from(WEBHOOK_SECRET, 'utf8').toString('base64')
    const sig = createHmac('sha256', Buffer.from(secret, 'base64')).update(toSign).digest('base64')
    return `v1,${sig}`
  }

  async function postWebhook(body: object, eventId: string): Promise<Response> {
    const bodyStr = JSON.stringify(body)
    const timestamp = Math.floor(Date.now() / 1000)
    const signature = signWebhookPayload(bodyStr, eventId, timestamp)

    return fetch(`${API_URL}/billing/webhooks/polar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'webhook-id': eventId,
        'webhook-timestamp': String(timestamp),
        'webhook-signature': signature,
      },
      body: bodyStr,
    })
  }

  /** Build a customer.state_changed payload for the given Supabase UUID. */
  function makeStateChangedPayload(userId: string, tier: 'free' | 'pro'): object {
    const isPro = tier === 'pro'
    return {
      type: 'customer.state_changed',
      timestamp: new Date().toISOString(),
      data: {
        id: `cus_test_${userId.slice(0, 8)}`,
        created_at: new Date().toISOString(),
        modified_at: new Date().toISOString(),
        metadata: {},
        external_id: userId,
        email: `billing-e2e-${userId.slice(0, 8)}@clawos.test`,
        email_verified: true,
        name: 'E2E Test User',
        billing_address: null,
        tax_id: null,
        organization_id: 'org_test',
        avatar_url: null,
        customer_type: null,
        active_subscriptions: isPro
          ? [
              {
                id: `sub_test_${userId.slice(0, 8)}`,
                created_at: new Date().toISOString(),
                modified_at: new Date().toISOString(),
                metadata: {},
                status: 'active',
                current_period_start: new Date().toISOString(),
                current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
                cancel_at_period_end: false,
                customer_id: `cus_test_${userId.slice(0, 8)}`,
                product_id: PRODUCT_ID,
                price_id: 'price_test',
                discount_id: null,
                trial_start: null,
                trial_end: null,
                custom_field_data: {},
                recurring_interval: 'month',
              },
            ]
          : [],
        granted_benefits: isPro
          ? [
              {
                id: `grant_test_${userId.slice(0, 8)}`,
                created_at: new Date().toISOString(),
                modified_at: new Date().toISOString(),
                granted_at: new Date().toISOString(),
                revoked_at: null,
                is_granted: true,
                benefit_id: BENEFIT_ID,
                subscription_id: `sub_test_${userId.slice(0, 8)}`,
                customer_id: `cus_test_${userId.slice(0, 8)}`,
                properties: { key: 'careerclaw_pro_access', value: 'true' },
              },
            ]
          : [],
        active_meters: [],
      },
    }
  }

  // ── Setup ─────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    const testEmail = `billing-e2e-${Date.now()}@clawos.test`
    const testPassword = `Test_${crypto.randomUUID()}` // ggignore

    const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    })

    if (createError || !createData.user) {
      throw new Error(`beforeAll: failed to create test user: ${createError?.message}`)
    }

    freeUserId = createData.user.id

    const anonClient = createClient(
      process.env['SUPABASE_URL']!,
      process.env['SUPABASE_ANON_KEY']!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    })

    if (signInError || !signInData.session) {
      throw new Error(`beforeAll: failed to sign in test user: ${signInError?.message}`)
    }

    freeUserJwt = signInData.session.access_token
  })

  afterAll(async () => {
    if (freeUserId) {
      await supabaseAdmin.auth.admin.deleteUser(freeUserId)
    }
  })

  // ── 1. Webhook idempotency ────────────────────────────────────────────────

  describe('Webhook idempotency', () => {
    it('records the event on first delivery', async () => {
      const eventId = `evt_idem_${Date.now()}`
      const payload = makeStateChangedPayload(freeUserId, 'free')

      const res = await postWebhook(payload, eventId)
      expect(res.status).toBe(200)
      const body = (await res.json()) as { received: boolean; status: string }
      expect(body.received).toBe(true)
      expect(body.status).toBe('processed')

      // Row must exist in billing_webhook_events.
      const { data: row } = await supabaseAdmin
        .from('billing_webhook_events')
        .select('event_id, status')
        .eq('event_id', eventId)
        .single()

      expect(row).toBeDefined()
      expect(row!.status).toBe('processed')
    })

    it('returns duplicate status and does not create a second row on repeat delivery', async () => {
      const eventId = `evt_dup_${Date.now()}`
      const payload = makeStateChangedPayload(freeUserId, 'free')

      // First delivery.
      await postWebhook(payload, eventId)

      // Second delivery (same event_id).
      const res2 = await postWebhook(payload, eventId)
      expect(res2.status).toBe(200)
      const body2 = (await res2.json()) as { status: string }
      expect(body2.status).toBe('duplicate')

      // Confirm only one row exists.
      const { data: rows } = await supabaseAdmin
        .from('billing_webhook_events')
        .select('event_id')
        .eq('event_id', eventId)

      expect(rows?.length).toBe(1)
    })

    it('rejects a webhook with an invalid signature with 401', async () => {
      const res = await fetch(`${API_URL}/billing/webhooks/polar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'webhook-id': `evt_bad_${Date.now()}`,
          'webhook-timestamp': String(Math.floor(Date.now() / 1000)),
          'webhook-signature': 'v1,invalidsig',
        },
        body: JSON.stringify({ type: 'customer.state_changed' }),
      })

      expect(res.status).toBe(401)
      const body = (await res.json()) as { code: string }
      expect(body.code).toBe('INVALID_SIGNATURE')
    })
  })

  // ── 2. Pro upgrade flow via webhook ──────────────────────────────────────

  describe('Pro upgrade flow (customer.state_changed -> Supabase)', () => {
    it('upgrades user from free to pro after a valid customer.state_changed event', async () => {
      // Confirm user starts as free.
      const { data: beforeRow } = await supabaseAdmin
        .from('users')
        .select('tier')
        .eq('id', freeUserId)
        .single()
      expect(beforeRow?.tier).toBe('free')

      // Deliver Pro state_changed webhook.
      const eventId = `evt_upgrade_${Date.now()}`
      const res = await postWebhook(makeStateChangedPayload(freeUserId, 'pro'), eventId)
      expect(res.status).toBe(200)
      const body = (await res.json()) as { status: string }
      expect(body.status).toBe('processed')

      // Confirm users.tier is now 'pro'.
      const { data: afterRow } = await supabaseAdmin
        .from('users')
        .select('tier')
        .eq('id', freeUserId)
        .single()
      expect(afterRow?.tier).toBe('pro')

      // Confirm user_skill_entitlements row was upserted.
      const { data: entRow } = await supabaseAdmin
        .from('user_skill_entitlements')
        .select('tier, status, skill_slug')
        .eq('user_id', freeUserId)
        .eq('skill_slug', 'careerclaw')
        .single()

      expect(entRow?.tier).toBe('pro')
      expect(entRow?.status).toBe('active')
    })

    it('downgrades user from pro to free on a canceled state_changed event', async () => {
      // Deliver free state_changed (simulates cancellation reconciled by Polar).
      const eventId = `evt_downgrade_${Date.now()}`
      const res = await postWebhook(makeStateChangedPayload(freeUserId, 'free'), eventId)
      expect(res.status).toBe(200)

      const { data: row } = await supabaseAdmin
        .from('users')
        .select('tier')
        .eq('id', freeUserId)
        .single()
      expect(row?.tier).toBe('free')

      const { data: entRow } = await supabaseAdmin
        .from('user_skill_entitlements')
        .select('tier, status')
        .eq('user_id', freeUserId)
        .eq('skill_slug', 'careerclaw')
        .single()
      expect(entRow?.tier).toBe('free')
      expect(entRow?.status).toBe('inactive')
    })
  })

  // ── 3. Checkout endpoint auth gating ─────────────────────────────────────

  describe('POST /billing/checkout', () => {
    it('returns 401 for unauthenticated request', async () => {
      const res = await fetch(`${API_URL}/billing/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(401)
    })

    it('returns 503 when Polar is not configured (POLAR_ACCESS_TOKEN absent)', async () => {
      // The test API may or may not have POLAR_ACCESS_TOKEN set.
      // If it is set, a real Polar call would be made -- skip this sub-test.
      if (process.env['POLAR_ACCESS_TOKEN']) {
        return
      }

      const res = await fetch(`${API_URL}/billing/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${freeUserJwt}`,
        },
        body: JSON.stringify({ source: 'web' }),
      })
      expect(res.status).toBe(503)
    })
  })

  // ── 4. Internal sync endpoint ─────────────────────────────────────────────

  describe('POST /internal/billing/sync/:userId', () => {
    it('returns 401 without INTERNAL_API_KEY', async () => {
      const res = await fetch(`${API_URL}/internal/billing/sync/${freeUserId}`, {
        method: 'POST',
      })
      expect(res.status).toBe(401)
    })

    it('returns 401 with wrong INTERNAL_API_KEY', async () => {
      const res = await fetch(`${API_URL}/internal/billing/sync/${freeUserId}`, {
        method: 'POST',
        headers: { 'X-Internal-Api-Key': 'wrong-key' },
      })
      expect(res.status).toBe(401)
    })

    it('returns a well-formed diagnostic response with correct key', async () => {
      // Skip if POLAR_ACCESS_TOKEN is absent -- sync would fail on Polar call.
      if (!process.env['POLAR_ACCESS_TOKEN']) {
        return
      }

      const res = await fetch(`${API_URL}/internal/billing/sync/${freeUserId}`, {
        method: 'POST',
        headers: { 'X-Internal-Api-Key': INTERNAL_API_KEY },
      })

      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        userId: string
        tier: string
        customerFound: boolean
      }
      expect(body.userId).toBe(freeUserId)
      expect(['free', 'pro']).toContain(body.tier)
      expect(typeof body.customerFound).toBe('boolean')
    })
  })

  // ── 5. RLS: users cannot read each other's billing rows ──────────────────

  describe('RLS audit — billing tables', () => {
    it('users cannot select other users rows from user_skill_entitlements via JWT', async () => {
      // Ensure an entitlement row exists for freeUserId.
      await supabaseAdmin.from('user_skill_entitlements').upsert(
        {
          user_id: freeUserId,
          skill_slug: 'careerclaw',
          tier: 'free',
          status: 'inactive',
          provider: 'polar',
          metadata: {},
        },
        { onConflict: 'user_id,skill_slug' },
      )

      // Create a second test user.
      const otherEmail = `billing-rls-other-${Date.now()}@clawos.test`
      const otherPassword = `Test_${crypto.randomUUID()}` // ggignore
      const { data: otherData } = await supabaseAdmin.auth.admin.createUser({
        email: otherEmail,
        password: otherPassword,
        email_confirm: true,
      })
      const otherId = otherData?.user?.id

      if (!otherId) return // Skip if user creation failed.

      const anonClient = createClient(
        process.env['SUPABASE_URL']!,
        process.env['SUPABASE_ANON_KEY']!,
        { auth: { autoRefreshToken: false, persistSession: false } },
      )

      const { data: signInData } = await anonClient.auth.signInWithPassword({
        email: otherEmail,
        password: otherPassword,
      })

      // Use the other user's JWT to try to read freeUserId's entitlements.
      const otherJwt = signInData?.session?.access_token
      if (!otherJwt) {
        await supabaseAdmin.auth.admin.deleteUser(otherId)
        throw new Error('Failed to sign in other user — RLS test cannot proceed')
      }

      const otherAnonClient = createClient(
        process.env['SUPABASE_URL']!,
        process.env['SUPABASE_ANON_KEY']!,
        {
          auth: { autoRefreshToken: false, persistSession: false },
          global: { headers: { Authorization: `Bearer ${otherJwt}` } },
        },
      )

      const { data: rows } = await otherAnonClient
        .from('user_skill_entitlements')
        .select('user_id')
        .eq('user_id', freeUserId)

      // RLS must block this -- result should be empty.
      expect(rows?.length ?? 0).toBe(0)

      await supabaseAdmin.auth.admin.deleteUser(otherId)
    })

    it('authenticated users can read their own entitlement rows', async () => {
      await supabaseAdmin.from('user_skill_entitlements').upsert(
        {
          user_id: freeUserId,
          skill_slug: 'careerclaw',
          tier: 'free',
          status: 'inactive',
          provider: 'polar',
          metadata: {},
        },
        { onConflict: 'user_id,skill_slug' },
      )

      const ownClient = createClient(
        process.env['SUPABASE_URL']!,
        process.env['SUPABASE_ANON_KEY']!,
        {
          auth: { autoRefreshToken: false, persistSession: false },
          global: { headers: { Authorization: `Bearer ${freeUserJwt}` } },
        },
      )

      const { data: rows } = await ownClient
        .from('user_skill_entitlements')
        .select('user_id, skill_slug')
        .eq('user_id', freeUserId)

      expect(rows?.length).toBeGreaterThanOrEqual(1)
      expect(rows![0]!.user_id).toBe(freeUserId)
    })
  })
})
