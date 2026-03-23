/**
 * track.integration.test.ts -- Real end-to-end test for the track_application
 * tool path.
 *
 * What this tests:
 *   - A real JWT is accepted and the chat handler reaches Claude
 *   - An explicit save message causes Claude to invoke track_application
 *     and a real row is written to careerclaw_job_tracking
 *   - The SSE stream emits a tracking progress event then a done event
 *   - The done event message confirms the save (contains company name)
 *   - Saving the same job twice is idempotent (upsert, no error or duplicate)
 *   - An explicit status-update message causes Claude to invoke
 *     track_application with action=update_status and the DB row is updated
 *   - The done event message confirms the status update
 *
 * What this does NOT test:
 *   - The run_careerclaw (worker) path -- that path has its own integration test
 *   - Billing / tier gating
 *
 * Prerequisites (same .env.test as index.integration.test.ts):
 *   - SUPABASE_URL + SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY
 *   - CLAWOS_ANTHROPIC_KEY (real calls are made to Claude)
 *
 * Run with:
 *   npm run test:integration
 *
 * Cleanup:
 *   beforeAll creates one throw-away Supabase user and seeds one
 *   careerclaw_job_tracking row for the update-status tests.
 *   afterAll deletes the user (cascade removes all skill rows) and
 *   removes any residual tracking rows by job_id prefix.
 *   If the process is killed before cleanup, delete the test user
 *   manually from the Supabase Auth dashboard.
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

describe.skipIf(missingVars.length > 0)(
  'Agent API -- track_application tool path (integration)',
  () => {
    if (missingVars.length > 0) {
      throw new Error(`Missing env vars: ${missingVars.join(', ')}`)
    }

    // ── Supabase admin client (service role -- bypasses RLS for test setup) ─
    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // Stable job IDs for this run -- unique suffix prevents collision with
    // prior runs if teardown was skipped.
    const RUN_ID = Date.now()
    const JOB_ID_SAVE = `test-track-save-${RUN_ID}`
    const JOB_ID_UPDATE = `test-track-update-${RUN_ID}`

    const TEST_TITLE = 'Staff Software Engineer'
    const TEST_COMPANY = 'Acme Corp'

    const TEST_EMAIL = `clawos-track-integration-${RUN_ID}@example.com`
    const TEST_PASSWORD = `Test_${crypto.randomUUID()}` // ggignore

    let testUserId = ''
    let testJwt = ''

    // ── Setup ────────────────────────────────────────────────────────────────

    beforeAll(async () => {
      // Create throw-away user
      const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        email_confirm: true,
      })

      if (createError || !createData.user) {
        throw new Error(`Failed to create test user: ${createError?.message}`)
      }

      testUserId = createData.user.id

      // Insert platform users row so auth middleware can load the tier
      const { error: usersError } = await supabaseAdmin
        .from('users')
        .upsert({ id: testUserId, tier: 'free' })

      if (usersError) {
        throw new Error(`Failed to insert users row: ${usersError.message}`)
      }

      // Seed a careerclaw_profiles row with skills so the profile gate does
      // not block non-search messages -- skills must be non-empty.
      const { error: profileError } = await supabaseAdmin.from('careerclaw_profiles').upsert({
        user_id: testUserId,
        work_mode: 'remote',
        skills: ['TypeScript', 'React', 'Node.js'],
        target_roles: ['Staff Engineer', 'Senior Engineer'],
        experience_years: 8,
        resume_summary: 'Integration test profile -- do not use in production.',
      })

      if (profileError) {
        throw new Error(`Failed to seed careerclaw_profiles: ${profileError.message}`)
      }

      // Pre-seed a tracking row for the update-status tests so there is
      // an existing row to update -- status starts at 'saved'.
      const { error: trackError } = await supabaseAdmin.from('careerclaw_job_tracking').upsert({
        user_id: testUserId,
        job_id: JOB_ID_UPDATE,
        title: TEST_TITLE,
        company: TEST_COMPANY,
        status: 'saved',
      })

      if (trackError) {
        throw new Error(`Failed to seed careerclaw_job_tracking: ${trackError.message}`)
      }

      // Sign in and get a real JWT
      const anonClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
        auth: { autoRefreshToken: false, persistSession: false },
      })

      const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      })

      if (signInError || !signInData.session) {
        throw new Error(`Failed to sign in test user: ${signInError?.message}`)
      }

      testJwt = signInData.session.access_token
    })

    // ── Teardown ─────────────────────────────────────────────────────────────

    afterAll(async () => {
      // Delete any residual tracking rows by job_id prefix (catches rows
      // inserted during tests that were not cleaned up mid-suite).
      await supabaseAdmin
        .from('careerclaw_job_tracking')
        .delete()
        .eq('user_id', testUserId)
        .like('job_id', `test-track-%`)

      // Deleting the user cascades to all skill and platform rows.
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

    async function getApp() {
      const { app } = await import('../index.js')
      return app
    }

    async function queryTrackingRow(jobId: string) {
      const { data, error } = await supabaseAdmin
        .from('careerclaw_job_tracking')
        .select('id, user_id, job_id, title, company, status, url, created_at, updated_at')
        .eq('user_id', testUserId)
        .eq('job_id', jobId)
        .maybeSingle()
      return { data, error }
    }

    // ── Save action tests ─────────────────────────────────────────────────────

    describe('save action', () => {
      it('emits a tracking progress event followed by a done event', async () => {
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
            // Explicit instruction so Claude reliably calls the tool.
            message: `Please save this job to my Applications tracker right now using the track_application tool:
job_id: "${JOB_ID_SAVE}"
title: "${TEST_TITLE}"
company: "${TEST_COMPANY}"
status: saved`,
          }),
        })

        expect(res.status).toBe(200)
        const events = parseSSEEvents(await res.text())

        // Tracking progress event must be present
        const steps = events.filter((e) => e['type'] === 'progress').map((e) => e['step'])
        expect(steps).toContain('tracking')

        // Must end with a done event, not an error
        const doneEvent = events.find((e) => e['type'] === 'done')
        const errorEvent = events.find((e) => e['type'] === 'error')
        expect(errorEvent).toBeUndefined()
        expect(doneEvent).toBeDefined()
        expect(doneEvent!['sessionId']).toBeDefined()
      })

      it('creates a real row in careerclaw_job_tracking with correct fields', async () => {
        // Row was inserted by the previous test -- verify it in Supabase.
        const { data, error } = await queryTrackingRow(JOB_ID_SAVE)

        expect(error).toBeNull()
        expect(data).not.toBeNull()
        expect(data!['user_id']).toBe(testUserId)
        expect(data!['job_id']).toBe(JOB_ID_SAVE)
        expect(data!['title']).toBe(TEST_TITLE)
        expect(data!['company']).toBe(TEST_COMPANY)
        expect(data!['status']).toBe('saved')
      })

      it('done event message contains the company name', async () => {
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
            message: `Save this to my tracker using the track_application tool:
job_id: "${JOB_ID_SAVE}-b"
title: "${TEST_TITLE}"
company: "${TEST_COMPANY}"
status: saved`,
          }),
        })

        const events = parseSSEEvents(await res.text())
        const doneEvent = events.find((e) => e['type'] === 'done')
        expect(doneEvent).toBeDefined()
        const message = (doneEvent!['message'] as string).toLowerCase()
        expect(message).toContain(TEST_COMPANY.toLowerCase())
      })

      it('is idempotent -- saving the same job_id twice does not error or duplicate', async () => {
        const app = await getApp()

        // Second save of the same JOB_ID_SAVE -- should upsert cleanly
        const res = await app.request('/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${testJwt}`,
          },
          body: JSON.stringify({
            userId: testUserId,
            channel: 'web',
            message: `Save this to my tracker again using the track_application tool:
job_id: "${JOB_ID_SAVE}"
title: "${TEST_TITLE}"
company: "${TEST_COMPANY}"
status: saved`,
          }),
        })

        const events = parseSSEEvents(await res.text())
        const errorEvent = events.find((e) => e['type'] === 'error')
        const doneEvent = events.find((e) => e['type'] === 'done')
        expect(errorEvent).toBeUndefined()
        expect(doneEvent).toBeDefined()

        // Exactly one row must exist for this job_id after two saves
        const { data: rows, error: queryError } = await supabaseAdmin
          .from('careerclaw_job_tracking')
          .select('id')
          .eq('user_id', testUserId)
          .eq('job_id', JOB_ID_SAVE)

        expect(queryError).toBeNull()
        expect(rows).toHaveLength(1)
      })
    })

    // ── Update-status action tests ────────────────────────────────────────────

    describe('update_status action', () => {
      it('emits a done event (not error) when updating an existing row', async () => {
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
            message: `I have an interview lined up. Please update my tracker using the track_application tool:
action: update_status
job_id: "${JOB_ID_UPDATE}"
title: "${TEST_TITLE}"
company: "${TEST_COMPANY}"
status: interviewing`,
          }),
        })

        expect(res.status).toBe(200)
        const events = parseSSEEvents(await res.text())

        const errorEvent = events.find((e) => e['type'] === 'error')
        const doneEvent = events.find((e) => e['type'] === 'done')
        expect(errorEvent).toBeUndefined()
        expect(doneEvent).toBeDefined()
        expect(doneEvent!['sessionId']).toBeDefined()
      })

      it('updates the DB row status from saved to interviewing', async () => {
        // Row was updated by the previous test -- verify in Supabase.
        const { data, error } = await queryTrackingRow(JOB_ID_UPDATE)

        expect(error).toBeNull()
        expect(data).not.toBeNull()
        expect(data!['status']).toBe('interviewing')
        // updated_at must be >= created_at (trigger fired)
        expect(new Date(data!['updated_at'] as string).getTime()).toBeGreaterThanOrEqual(
          new Date(data!['created_at'] as string).getTime(),
        )
      })

      it('done event message references the status change', async () => {
        const app = await getApp()

        // Update to a new status so the message text is fresh
        const res = await app.request('/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${testJwt}`,
          },
          body: JSON.stringify({
            userId: testUserId,
            channel: 'web',
            message: `Great news -- I received an offer. Please update my tracker using the track_application tool:
action: update_status
job_id: "${JOB_ID_UPDATE}"
title: "${TEST_TITLE}"
company: "${TEST_COMPANY}"
status: offer`,
          }),
        })

        const events = parseSSEEvents(await res.text())
        const doneEvent = events.find((e) => e['type'] === 'done')
        expect(doneEvent).toBeDefined()

        // Message should reference either the status word or the company
        const message = (doneEvent!['message'] as string).toLowerCase()
        const mentionsStatusOrCompany =
          message.includes('offer') || message.includes(TEST_COMPANY.toLowerCase())
        expect(mentionsStatusOrCompany).toBe(true)
      })

      it('final DB row status is offer after the last update', async () => {
        const { data, error } = await queryTrackingRow(JOB_ID_UPDATE)
        expect(error).toBeNull()
        expect(data!['status']).toBe('offer')
      })
    })

    // ── SSE stream shape ──────────────────────────────────────────────────────

    describe('SSE stream shape', () => {
      it('tracking progress step appears before the done event', async () => {
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
            message: `Save this with the track_application tool:
job_id: "test-track-sse-${RUN_ID}"
title: "Frontend Engineer"
company: "Vercel"
status: saved`,
          }),
        })

        const text = await res.text()
        const events = parseSSEEvents(text)

        // Locate the positions of tracking-progress and done events
        const trackingIndex = events.findIndex(
          (e) => e['type'] === 'progress' && e['step'] === 'tracking',
        )
        const doneIndex = events.findIndex((e) => e['type'] === 'done')

        expect(trackingIndex).toBeGreaterThanOrEqual(0)
        expect(doneIndex).toBeGreaterThan(trackingIndex)
      })

      it('done event carries a non-empty message string and a sessionId', async () => {
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
            message: `Save this with the track_application tool:
job_id: "test-track-shape-${RUN_ID}"
title: "Backend Engineer"
company: "Cloudflare"
status: saved`,
          }),
        })

        const events = parseSSEEvents(await res.text())
        const doneEvent = events.find((e) => e['type'] === 'done')

        expect(doneEvent).toBeDefined()
        expect(typeof doneEvent!['message']).toBe('string')
        expect((doneEvent!['message'] as string).length).toBeGreaterThan(0)
        expect(typeof doneEvent!['sessionId']).toBe('string')
        expect((doneEvent!['sessionId'] as string).length).toBeGreaterThan(0)
      })
    })
  },
)
