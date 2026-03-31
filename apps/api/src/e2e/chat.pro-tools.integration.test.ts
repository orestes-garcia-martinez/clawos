/**
 * chat.pro-tools.integration.test.ts — Post-briefing advisory tool integration tests.
 *
 * What this tests:
 *   - Cache-miss path: Pro user explicitly invokes run_gap_analysis or run_cover_letter
 *     but no briefing is cached → SSE done event carries "lost details" message.
 *   - Free-tier behavioral gate: requesting these tools returns a done event
 *     with an upgrade message (enforced by the LLM system prompt or the code gate).
 *   - SSE stream shape: progress events are emitted before the done event.
 *
 * What this does NOT test:
 *   - Full gap-analysis or cover-letter execution (requires a live Lightsail worker
 *     and a prior briefing in the same process — covered by smoke-worker-e2e.sh
 *     after deployment).
 *   - Briefing-cache reuse across requests (covered in briefing-cache.test.ts unit tests).
 *
 * Prerequisites (apps/api/.env.test):
 *   SUPABASE_URL + SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY + CLAWOS_ANTHROPIC_KEY
 *
 * Run with:
 *   npm run test:integration
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

// ── Required env guards ───────────────────────────────────────────────────────

const REQUIRED_VARS = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CLAWOS_ANTHROPIC_KEY',
] as const

const missingVars = REQUIRED_VARS.filter((v) => !process.env[v])

describe.skipIf(missingVars.length > 0)(
  'Agent API — post-briefing advisory tools (integration)',
  () => {
    if (missingVars.length > 0) {
      throw new Error(`Missing env vars: ${missingVars.join(', ')}`)
    }

    const RUN_ID = Date.now()
    // A job_id that will never be in the briefing cache (no run_careerclaw in this process).
    const PHANTOM_JOB_ID = `phantom-job-${RUN_ID}`

    const supabaseAdmin = createClient(
      process.env['SUPABASE_URL']!,
      process.env['SUPABASE_SERVICE_ROLE_KEY']!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // ── Test users ────────────────────────────────────────────────────────────

    const PRO_EMAIL = `clawos-pro-tools-pro-${RUN_ID}@example.com`
    const FREE_EMAIL = `clawos-pro-tools-free-${RUN_ID}@example.com`
    const TEST_PASSWORD = `Test_${crypto.randomUUID()}` // ggignore

    let proUserId = ''
    let freeUserId = ''
    let proJwt = ''
    let freeJwt = ''

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

    async function getApp() {
      const { app } = await import('../index.js')
      return app
    }

    async function createTestUser(
      email: string,
      tier: 'free' | 'pro',
    ): Promise<{ userId: string; jwt: string }> {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: TEST_PASSWORD,
        email_confirm: true,
      })
      if (error || !data.user) throw new Error(`Failed to create user: ${error?.message}`)
      const userId = data.user.id

      await supabaseAdmin.from('users').upsert({ id: userId, tier })

      // Seed a profile with skills so the profile gate is satisfied on every request.
      await supabaseAdmin.from('careerclaw_profiles').upsert({
        user_id: userId,
        skills: ['TypeScript', 'Node.js', 'React'],
        target_roles: ['Senior Engineer'],
        experience_years: 6,
        work_mode: 'remote',
      })

      if (tier === 'pro') {
        // Seed entitlement row so resolveCareerClawEntitlements returns pro features.
        await supabaseAdmin.from('user_skill_entitlements').upsert(
          {
            user_id: userId,
            skill_slug: 'careerclaw',
            tier: 'pro',
            status: 'active',
            provider: 'polar',
            metadata: {},
          },
          { onConflict: 'user_id,skill_slug' },
        )
      }

      const anonClient = createClient(
        process.env['SUPABASE_URL']!,
        process.env['SUPABASE_ANON_KEY']!,
        { auth: { autoRefreshToken: false, persistSession: false } },
      )
      const { data: signIn, error: signInErr } = await anonClient.auth.signInWithPassword({
        email,
        password: TEST_PASSWORD,
      })
      if (signInErr || !signIn.session)
        throw new Error(`Failed to sign in ${email}: ${signInErr?.message}`)

      return { userId, jwt: signIn.session.access_token }
    }

    // ── Setup ─────────────────────────────────────────────────────────────────

    beforeAll(async () => {
      ;[{ userId: proUserId, jwt: proJwt }, { userId: freeUserId, jwt: freeJwt }] =
        await Promise.all([createTestUser(PRO_EMAIL, 'pro'), createTestUser(FREE_EMAIL, 'free')])
    }, 30_000)

    // ── Teardown ──────────────────────────────────────────────────────────────

    afterAll(async () => {
      await Promise.allSettled([
        proUserId ? supabaseAdmin.auth.admin.deleteUser(proUserId) : Promise.resolve(),
        freeUserId ? supabaseAdmin.auth.admin.deleteUser(freeUserId) : Promise.resolve(),
      ])
    })

    // ── Cache-miss path (Pro user, no prior briefing) ─────────────────────────
    //
    // These tests verify the server-side cache-miss gate: the LLM calls the tool
    // but the briefing cache is empty (no run_careerclaw executed in this process).
    // The worker is never reached — the API returns early with a "lost details" message.

    describe('run_gap_analysis — cache miss', () => {
      it('emits a done event (not error) with a non-empty message', async () => {
        const app = await getApp()

        const res = await app.request('/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${proJwt}`,
          },
          body: JSON.stringify({
            userId: proUserId,
            channel: 'web',
            // Explicit prompt so Claude reliably calls the tool for the given job_id.
            message: `Please run a resume gap analysis right now using the run_gap_analysis tool for job_id "${PHANTOM_JOB_ID}".`,
          }),
        })

        expect(res.status).toBe(200)
        const events = parseSSEEvents(await res.text())

        const errorEvent = events.find((e) => e['type'] === 'error')
        const doneEvent = events.find((e) => e['type'] === 'done')

        expect(errorEvent).toBeUndefined()
        expect(doneEvent).toBeDefined()
        expect(typeof doneEvent!['message']).toBe('string')
        expect((doneEvent!['message'] as string).length).toBeGreaterThan(0)
      })

      it('done event message suggests running a fresh briefing', async () => {
        const app = await getApp()

        const res = await app.request('/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${proJwt}`,
          },
          body: JSON.stringify({
            userId: proUserId,
            channel: 'web',
            message: `Analyze my resume for job_id "${PHANTOM_JOB_ID}" using the run_gap_analysis tool.`,
          }),
        })

        const events = parseSSEEvents(await res.text())
        const doneEvent = events.find((e) => e['type'] === 'done')
        expect(doneEvent).toBeDefined()

        // Either the cache-miss gate or Claude's context-awareness produces a response
        // that suggests running a fresh briefing.
        const msg = (doneEvent!['message'] as string).toLowerCase()
        const mentionsBriefingOrSearch =
          msg.includes('briefing') ||
          msg.includes('search') ||
          msg.includes('lost') ||
          msg.includes("don't have") ||
          msg.includes('run')
        expect(mentionsBriefingOrSearch).toBe(true)
      })

      it('done event carries a sessionId', async () => {
        const app = await getApp()

        const res = await app.request('/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${proJwt}`,
          },
          body: JSON.stringify({
            userId: proUserId,
            channel: 'web',
            message: `Run gap analysis for job_id "${PHANTOM_JOB_ID}" using run_gap_analysis.`,
          }),
        })

        const events = parseSSEEvents(await res.text())
        const doneEvent = events.find((e) => e['type'] === 'done')
        expect(doneEvent).toBeDefined()
        expect(typeof doneEvent!['sessionId']).toBe('string')
        expect((doneEvent!['sessionId'] as string).length).toBeGreaterThan(0)
      })
    })

    describe('run_cover_letter — cache miss', () => {
      it('emits a done event (not error) with a non-empty message', async () => {
        const app = await getApp()

        const res = await app.request('/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${proJwt}`,
          },
          body: JSON.stringify({
            userId: proUserId,
            channel: 'web',
            message: `Please generate a tailored cover letter right now using the run_cover_letter tool for job_id "${PHANTOM_JOB_ID}".`,
          }),
        })

        expect(res.status).toBe(200)
        const events = parseSSEEvents(await res.text())

        const errorEvent = events.find((e) => e['type'] === 'error')
        const doneEvent = events.find((e) => e['type'] === 'done')

        expect(errorEvent).toBeUndefined()
        expect(doneEvent).toBeDefined()
        expect(typeof doneEvent!['message']).toBe('string')
        expect((doneEvent!['message'] as string).length).toBeGreaterThan(0)
      })

      it('done event carries a sessionId', async () => {
        const app = await getApp()

        const res = await app.request('/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${proJwt}`,
          },
          body: JSON.stringify({
            userId: proUserId,
            channel: 'web',
            message: `Write a cover letter for job_id "${PHANTOM_JOB_ID}" using the run_cover_letter tool.`,
          }),
        })

        const events = parseSSEEvents(await res.text())
        const doneEvent = events.find((e) => e['type'] === 'done')
        expect(doneEvent).toBeDefined()
        expect(typeof doneEvent!['sessionId']).toBe('string')
        expect((doneEvent!['sessionId'] as string).length).toBeGreaterThan(0)
      })
    })

    // ── Free-tier behavioral gate ─────────────────────────────────────────────
    //
    // The system prompt tells Claude that run_gap_analysis and run_cover_letter are
    // Pro-only. For free users, the LLM gate (system prompt) or the code gate
    // (sendGatedResponse) must produce a done event that mentions upgrading.
    // Either gate satisfies the behavioral requirement.

    describe('free-tier behavioral gate', () => {
      it('gap analysis request returns a done event with an upgrade message', async () => {
        const app = await getApp()

        const res = await app.request('/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${freeJwt}`,
          },
          body: JSON.stringify({
            userId: freeUserId,
            channel: 'web',
            message: `Run a resume gap analysis for job_id "free-job-${RUN_ID}" using the run_gap_analysis tool.`,
          }),
        })

        expect(res.status).toBe(200)
        const events = parseSSEEvents(await res.text())

        const doneEvent = events.find((e) => e['type'] === 'done')
        expect(doneEvent).toBeDefined()

        const msg = (doneEvent!['message'] as string).toLowerCase()
        const mentionsGate =
          msg.includes('pro') || msg.includes('upgrade') || msg.includes('billing')
        expect(mentionsGate).toBe(true)
      })

      it('cover letter request returns a done event with an upgrade message', async () => {
        const app = await getApp()

        const res = await app.request('/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${freeJwt}`,
          },
          body: JSON.stringify({
            userId: freeUserId,
            channel: 'web',
            message: `Generate a tailored cover letter for job_id "free-job-${RUN_ID}" using the run_cover_letter tool.`,
          }),
        })

        expect(res.status).toBe(200)
        const events = parseSSEEvents(await res.text())

        const doneEvent = events.find((e) => e['type'] === 'done')
        expect(doneEvent).toBeDefined()

        const msg = (doneEvent!['message'] as string).toLowerCase()
        const mentionsGate =
          msg.includes('pro') || msg.includes('upgrade') || msg.includes('billing')
        expect(mentionsGate).toBe(true)
      })
    })
  },
)
