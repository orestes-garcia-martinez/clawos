/**
 * index.integration.test.ts -- Real end-to-end test for the direct text path.
 *
 * What this tests:
 *   - A real JWT from Supabase Auth is accepted by the auth middleware
 *   - A message with no job-search intent reaches Claude and gets a direct text response
 *   - The SSE stream emits progress events followed by a valid done event
 *   - The done event carries a non-empty message and a sessionId
 *
 * What this does NOT test:
 *   - The CareerClaw tool-use path (requires the Lightsail worker)
 *   - Billing / tier gating
 *
 * Prerequisites (see .env.test):
 *   - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY pointing at a real project
 *   - CLAWOS_ANTHROPIC_KEY with a real Anthropic API key
 *
 * Run with:
 *   npm run test:integration
 *
 * The test creates a throw-away Supabase user before the suite and deletes it
 * after. If the test process is killed before cleanup, the user will linger in
 * your Supabase project -- delete it manually from the Auth dashboard.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

// -- Guards ------------------------------------------------------------------

const REQUIRED_VARS = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CLAWOS_ANTHROPIC_KEY',
] as const

const missingVars = REQUIRED_VARS.filter((v) => !process.env[v])

// Skip the entire suite if credentials are not configured.
// This keeps CI green -- integration tests are opt-in.
describe.skipIf(missingVars.length > 0)('Agent API -- direct text path (integration)', () => {
  if (missingVars.length > 0) {
    // This branch is never reached when skipIf is active, but it satisfies
    // TypeScript narrowing so the rest of the file can use process.env safely.
    throw new Error(`Missing env vars: ${missingVars.join(', ')}`)
  }

  // ── Supabase admin client (service role -- never use anon key here) ──────
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // Credentials for the throw-away test user
  const TEST_EMAIL = `clawos-integration-test-${Date.now()}@example.com`
  const TEST_PASSWORD = `Test_${crypto.randomUUID()}` // ggignore

  let testUserId = ''
  let testJwt = ''

  // ── Setup: create a real user and get a real JWT ─────────────────────────

  beforeAll(async () => {
    // Create the user via the Admin API
    const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true, // skip email verification
    })

    if (createError || !createData.user) {
      throw new Error(`Failed to create test user: ${createError?.message}`)
    }

    testUserId = createData.user.id

    // Insert a users row so auth middleware can load the tier
    const { error: insertError } = await supabaseAdmin
      .from('users')
      .upsert({ id: testUserId, tier: 'free' })

    if (insertError) {
      throw new Error(`Failed to insert users row: ${insertError.message}`)
    }

    // Sign in to get a real JWT
    const anonClient = createClient(
      process.env.SUPABASE_URL!,
      // The anon key is not in .env.test, but Supabase exposes it publicly --
      // we derive it from the service role key's project ref, or you can add
      // SUPABASE_ANON_KEY to .env.test. Here we use the Admin API to generate
      // a session directly instead.
      process.env.SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    })

    if (signInError || !signInData.session) {
      throw new Error(`Failed to sign in test user: ${signInError?.message}`)
    }

    testJwt = signInData.session.access_token
  })

  // ── Teardown: delete the throw-away user ─────────────────────────────────

  afterAll(async () => {
    if (testUserId) {
      await supabaseAdmin.auth.admin.deleteUser(testUserId)
    }
  })

  // ── Helpers ───────────────────────────────────────────────────────────────

  function parseSSEEvents(text: string): Array<Record<string, unknown>> {
    return text
      .split('\n\n')
      .filter(Boolean)
      .flatMap((block) =>
        block
          .split('\n')
          .filter((line) => line.startsWith('data: '))
          .map((line) => {
            try {
              return JSON.parse(line.slice(6)) as Record<string, unknown>
            } catch {
              return { raw: line }
            }
          }),
      )
  }

  // Import app after env is confirmed present
  async function getApp() {
    const { app } = await import('./index.js')
    return app
  }

  // ── Tests ─────────────────────────────────────────────────────────────────

  it('returns 200 with SSE content-type', async () => {
    const app = await getApp()
    const res = await app.request('/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testJwt}`,
      },
      body: JSON.stringify({
        userId: testUserId,
        channel: 'web',
        message: 'What is ClawOS and what can you help me with?',
      }),
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/event-stream')
  })

  it('emits a done event with a non-empty message and sessionId', async () => {
    const app = await getApp()
    const res = await app.request('/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testJwt}`,
      },
      body: JSON.stringify({
        userId: testUserId,
        channel: 'web',
        message: 'What is ClawOS and what can you help me with?',
      }),
    })

    const text = await res.text()
    const events = parseSSEEvents(text)

    const doneEvent = events.find((e) => e['type'] === 'done')
    expect(doneEvent, 'expected a done event in the SSE stream').toBeDefined()
    expect(typeof doneEvent!['message']).toBe('string')
    expect((doneEvent!['message'] as string).length).toBeGreaterThan(0)
    expect(typeof doneEvent!['sessionId']).toBe('string')
  })

  it('emits progress events before the done event', async () => {
    const app = await getApp()
    const res = await app.request('/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testJwt}`,
      },
      body: JSON.stringify({
        userId: testUserId,
        channel: 'web',
        message: 'Briefly explain what you can do for me.',
      }),
    })

    const text = await res.text()
    const events = parseSSEEvents(text)

    const progressEvents = events.filter((e) => e['type'] === 'progress')
    expect(progressEvents.length).toBeGreaterThan(0)

    // done or error must be the last meaningful event
    const lastEvent = events.filter((e) => e['type'] === 'done' || e['type'] === 'error').pop()
    expect(lastEvent?.['type']).toBe('done')
  })

  it('rejects requests with no Authorization header', async () => {
    const app = await getApp()
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: testUserId,
        channel: 'web',
        message: 'Hello',
      }),
    })
    expect(res.status).toBe(401)
  })

  it('persists the session so a follow-up message has context', async () => {
    const app = await getApp()

    // First message
    const res1 = await app.request('/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testJwt}`,
      },
      body: JSON.stringify({
        userId: testUserId,
        channel: 'web',
        message: 'My name is Alex. Just say hi back.',
      }),
    })

    const text1 = await res1.text()
    const events1 = parseSSEEvents(text1)
    const doneEvent1 = events1.find((e) => e['type'] === 'done')
    expect(doneEvent1).toBeDefined()

    const sessionId = doneEvent1!['sessionId'] as string
    expect(typeof sessionId).toBe('string')

    // Follow-up using the returned sessionId
    const res2 = await app.request('/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testJwt}`,
      },
      body: JSON.stringify({
        userId: testUserId,
        channel: 'web',
        sessionId,
        message: 'What is my name?',
      }),
    })

    const text2 = await res2.text()
    const events2 = parseSSEEvents(text2)
    const doneEvent2 = events2.find((e) => e['type'] === 'done')
    expect(doneEvent2).toBeDefined()

    // Claude should recall "Alex" from the session context
    const message2 = (doneEvent2!['message'] as string).toLowerCase()
    expect(message2).toContain('alex')
  })
})
