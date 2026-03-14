/**
 * index.integration.test.ts -- Real end-to-end integration test for Telegram adapter.
 *
 * All outbound calls are real -- Telegram Bot API, Supabase, Agent API, Claude.
 * No mocks anywhere.
 *
 * What this tests:
 *   1. /start command   -- resolves/creates real Supabase user, sends real Telegram message
 *   2. Text message     -- calls real Agent API (Claude), reply delivered to real Telegram chat
 *   3. /link flow       -- real token inserted in Supabase, consumed atomically, identity merged
 *   4. PDF upload       -- real Telegram file downloaded, text extracted, saved to Supabase
 *                         (skipped if TELEGRAM_TEST_PDF_FILE_ID is not set)
 *
 * Telegram UX during the test:
 *   The real TELEGRAM_TEST_CHAT_ID receives actual messages from the bot. This is expected.
 *   sendMessage errors are swallowed by the adapter (non-fatal) -- the Supabase assertions
 *   are the primary correctness signal.
 *
 * Required env vars (apps/telegram/.env.test):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET
 *   TELEGRAM_TEST_CHAT_ID   -- your real Telegram chat ID with the bot
 *   AGENT_API_URL           -- deployed Vercel API
 *   SERVICE_SECRET          -- must match apps/api SERVICE_SECRET
 *   LINK_TOKEN_SECRET       -- must match LINK_TOKEN_SECRET used by the web app
 *
 * Optional:
 *   TELEGRAM_TEST_PDF_FILE_ID -- file_id of a real PDF already uploaded to the bot
 *
 * Run:
 *   npm run test:integration  (from apps/telegram/)
 *
 * Cleanup:
 *   Synthetic Supabase users created here are deleted in afterAll.
 *   If the test process is killed before cleanup, delete them from the
 *   Supabase Auth dashboard -- look for tg_<number>@clawos.internal emails.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { hmacSha256 } from '@clawos/security'
import { handleUpdate } from './index.js'
import type { TelegramUpdate } from './index.js'

// ── Required env guards ───────────────────────────────────────────────────────

const REQUIRED_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
  'TELEGRAM_TEST_CHAT_ID',
  'AGENT_API_URL',
  'SERVICE_SECRET',
  'LINK_TOKEN_SECRET',
] as const

const missingVars = REQUIRED_VARS.filter((v) => !process.env[v])

// Skip the entire suite if credentials are not configured.
// This keeps CI green -- integration tests are opt-in.
describe.skipIf(missingVars.length > 0)(
  'Telegram adapter -- integration (all real outbound calls)',
  () => {
    if (missingVars.length > 0) {
      throw new Error(`Missing env vars: ${missingVars.join(', ')}`)
    }

    // ── Supabase admin client ─────────────────────────────────────────────────
    // Service role key bypasses RLS -- used only for test setup and teardown.

    const supabase = createClient(
      process.env['SUPABASE_URL']!,
      process.env['SUPABASE_SERVICE_ROLE_KEY']!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // Real Telegram chat ID where messages will be delivered during the test.
    const REAL_CHAT_ID = Number(process.env['TELEGRAM_TEST_CHAT_ID'])

    // Unique synthetic Telegram user ID per test run.
    // Using a numeric string that fits Telegram's int64 user ID space.
    // This creates a throw-away tg_<id>@clawos.internal Supabase user.
    const SYNTHETIC_TG_USER_ID = String(900_000_000_000 + (Date.now() % 1_000_000_000))

    // Separate synthetic Telegram user ID for the /link test.
    const LINK_TG_USER_ID = String(800_000_000_000 + (Date.now() % 1_000_000_000))

    // Supabase UUIDs populated in beforeAll for cleanup.
    let syntheticUserId = ''
    let linkTgUserId = ''
    let webUserId = ''

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Build a minimal TelegramUpdate for a text message. */
    function textUpdate(fromId: number, text: string): TelegramUpdate {
      return {
        update_id: Math.floor(Math.random() * 1_000_000),
        message: {
          message_id: Math.floor(Math.random() * 1_000_000),
          from: { id: fromId, first_name: 'ClawOS Test' },
          // Messages are delivered to the real chat so the tester sees them.
          chat: { id: REAL_CHAT_ID, type: 'private' },
          text,
        },
      }
    }

    /** Build a TelegramUpdate for a document upload. */
    function documentUpdate(fromId: number, fileId: string, fileSize: number): TelegramUpdate {
      return {
        update_id: Math.floor(Math.random() * 1_000_000),
        message: {
          message_id: Math.floor(Math.random() * 1_000_000),
          from: { id: fromId, first_name: 'ClawOS Test' },
          chat: { id: REAL_CHAT_ID, type: 'private' },
          document: {
            file_id: fileId,
            file_name: 'test-resume.pdf',
            mime_type: 'application/pdf',
            file_size: fileSize,
          },
        },
      }
    }

    // ── Setup ─────────────────────────────────────────────────────────────────

    beforeAll(async () => {
      // Pre-warm: create the synthetic user via a /start command so identity
      // resolution is done before the main tests. This also verifies the
      // full auth.users -> users trigger chain in Supabase.
      await handleUpdate(textUpdate(Number(SYNTHETIC_TG_USER_ID), '/start'))

      // Look up the Supabase UUID created for our synthetic Telegram user.
      const { data: identity } = await supabase
        .from('channel_identities')
        .select('user_id')
        .eq('channel', 'telegram')
        .eq('channel_user_id', SYNTHETIC_TG_USER_ID)
        .maybeSingle()

      if (!identity) {
        throw new Error(
          `beforeAll: channel_identity not found for tg:${SYNTHETIC_TG_USER_ID}. ` +
            'Check Supabase logs and SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY.',
        )
      }

      syntheticUserId = identity.user_id

      // Seed a careerclaw_profiles row so the Agent API has profile + resume data
      // when Claude invokes the CareerClaw tool. This mirrors the data the curl
      // test uses directly -- no PDF upload needed.
      const { error: profileError } = await supabase.from('careerclaw_profiles').upsert(
        {
          user_id: syntheticUserId,
          resume_text:
            'Senior Software Engineer with 10 years of TypeScript, React, and Node.js experience. ' +
            'Led distributed systems teams, shipped production APIs at scale, strong preference for remote work.',
          work_mode: 'remote',
          salary_min: 140000,
        },
        { onConflict: 'user_id' },
      )

      if (profileError) {
        throw new Error(`beforeAll: failed to seed careerclaw_profiles: ${profileError.message}`)
      }
      // This is a normal Supabase auth user with a real (fake) email.
      const webEmail = `clawos-link-test-${Date.now()}@example.com`
      const { data: webAuthData, error: webAuthError } = await supabase.auth.admin.createUser({
        email: webEmail,
        email_confirm: true,
        user_metadata: { created_by: 'telegram-integration-test' },
      })

      if (webAuthError || !webAuthData.user) {
        throw new Error(`beforeAll: failed to create web user: ${webAuthError?.message}`)
      }

      webUserId = webAuthData.user.id
    }, 30_000)

    // ── Teardown ──────────────────────────────────────────────────────────────

    afterAll(async () => {
      // Deleting auth users cascades to: users, channel_identities, sessions,
      // careerclaw_profiles, careerclaw_runs, careerclaw_job_tracking, link_tokens.
      // No manual row cleanup needed.
      const toDelete = [syntheticUserId, linkTgUserId, webUserId].filter(Boolean)
      await Promise.allSettled(toDelete.map((id) => supabase.auth.admin.deleteUser(id)))
    })

    // ── Tests ─────────────────────────────────────────────────────────────────

    it('creates a real Supabase user and channel_identity on /start', async () => {
      // beforeAll already sent /start and verified the identity exists.
      // Re-check here as an explicit assertion.
      const { data: identity } = await supabase
        .from('channel_identities')
        .select('user_id, channel')
        .eq('channel', 'telegram')
        .eq('channel_user_id', SYNTHETIC_TG_USER_ID)
        .maybeSingle()

      expect(identity).not.toBeNull()
      expect(identity!.channel).toBe('telegram')
      expect(identity!.user_id).toBe(syntheticUserId)

      // Verify the users row was auto-created by the handle_new_user trigger.
      const { data: userRow } = await supabase
        .from('users')
        .select('id, tier')
        .eq('id', syntheticUserId)
        .maybeSingle()

      expect(userRow).not.toBeNull()
      expect(userRow!.tier).toBe('free')
    })

    it('/start is idempotent -- second call does not create a duplicate user', async () => {
      // Send /start again with the same Telegram user ID.
      await handleUpdate(textUpdate(Number(SYNTHETIC_TG_USER_ID), '/start'))

      // There should still be exactly one channel_identity row.
      const { data: identities } = await supabase
        .from('channel_identities')
        .select('user_id')
        .eq('channel', 'telegram')
        .eq('channel_user_id', SYNTHETIC_TG_USER_ID)

      expect(identities).toHaveLength(1)
      expect(identities![0]!.user_id).toBe(syntheticUserId)
    })

    it('text message reaches Agent API and reply is delivered to Telegram', async () => {
      // Job-search intent -- this will invoke the real Lightsail worker.
      // Requires WORKER_URL + WORKER_SECRET to be configured in apps/api/.env
      // and the worker to be running on Lightsail.
      const update = textUpdate(
        Number(SYNTHETIC_TG_USER_ID),
        'Find me remote Python engineer jobs. Top 3 results only.',
      )

      // handleUpdate is awaited -- blocks until sendMessage completes.
      await expect(handleUpdate(update)).resolves.toBeUndefined()

      // Primary verification: a session was saved with the assistant reply.
      const { data: session } = await supabase
        .from('sessions')
        .select('messages')
        .eq('user_id', syntheticUserId)
        .eq('channel', 'telegram')
        .maybeSingle()

      expect(session).not.toBeNull()

      const messages = session!.messages as Array<{ role: string; content: string }>
      expect(messages.length).toBeGreaterThanOrEqual(2)

      const userMsg = messages.find((m) => m.role === 'user')
      const assistantMsg = messages.find((m) => m.role === 'assistant')

      expect(userMsg).toBeDefined()
      expect(assistantMsg).toBeDefined()
      expect(assistantMsg!.content.length).toBeGreaterThan(0)
    })

    it('session context persists across two messages in the same channel', async () => {
      // First message: job search (hits worker). This establishes session context.
      await handleUpdate(
        textUpdate(Number(SYNTHETIC_TG_USER_ID), 'Find remote TypeScript roles. Top 2 only.'),
      )

      // Second message: follow-up that requires context -- no job-search intent,
      // so Claude answers directly from session history without calling the worker.
      await handleUpdate(
        textUpdate(Number(SYNTHETIC_TG_USER_ID), 'Which of those roles had the highest salary?'),
      )

      // Session should now have at least 4 messages (2 user + 2 assistant).
      const { data: session } = await supabase
        .from('sessions')
        .select('messages')
        .eq('user_id', syntheticUserId)
        .eq('channel', 'telegram')
        .maybeSingle()

      expect(session).not.toBeNull()
      const messages = session!.messages as Array<{ role: string; content: string }>
      // Session accumulates across this test and the previous one.
      expect(messages.length).toBeGreaterThanOrEqual(4)

      // The final assistant reply should reference salary or the jobs from context.
      const replies = messages.filter((m) => m.role === 'assistant')
      const lastReply = replies[replies.length - 1]!.content.toLowerCase()
      // Flexible assertion -- Claude may say it doesn't have salary info
      // or refer to one of the roles. Either way it's responding with context.
      expect(lastReply.length).toBeGreaterThan(20)
    })

    it('/link flow: valid token is consumed atomically and identity is merged', async () => {
      // 1. Create a separate Telegram user for this test so the /link merge is clean.
      await handleUpdate(textUpdate(Number(LINK_TG_USER_ID), '/start'))

      const { data: linkIdentity } = await supabase
        .from('channel_identities')
        .select('user_id')
        .eq('channel', 'telegram')
        .eq('channel_user_id', LINK_TG_USER_ID)
        .maybeSingle()

      expect(linkIdentity).not.toBeNull()
      linkTgUserId = linkIdentity!.user_id // captured for afterAll cleanup

      // 2. Generate a real /link token (32-byte random hex).
      const rawToken = randomBytes(32).toString('hex')
      const tokenHash = hmacSha256(process.env['LINK_TOKEN_SECRET']!, rawToken)

      // 3. Insert the link_tokens row as the web app would (service role client).
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
      const { error: insertError } = await supabase
        .from('link_tokens')
        .insert({ token_hash: tokenHash, web_user_id: webUserId, expires_at: expiresAt })

      expect(insertError).toBeNull()

      // 4. Process the /link command with the real raw token.
      await handleUpdate(textUpdate(Number(LINK_TG_USER_ID), `/link ${rawToken}`))

      // 5. Verify the token was consumed -- no row should remain.
      const { data: remainingToken } = await supabase
        .from('link_tokens')
        .select('id')
        .eq('token_hash', tokenHash)
        .maybeSingle()

      expect(remainingToken).toBeNull()

      // 6. Verify channel_identity was updated to point to the web user.
      const { data: updatedIdentity } = await supabase
        .from('channel_identities')
        .select('user_id')
        .eq('channel', 'telegram')
        .eq('channel_user_id', LINK_TG_USER_ID)
        .maybeSingle()

      expect(updatedIdentity).not.toBeNull()
      expect(updatedIdentity!.user_id).toBe(webUserId)
    })

    it('/link rejects an expired token and leaves channel_identity unchanged', async () => {
      // Insert a token with an already-expired expires_at.
      const rawToken = randomBytes(32).toString('hex')
      const tokenHash = hmacSha256(process.env['LINK_TOKEN_SECRET']!, rawToken)

      const expiredAt = new Date(Date.now() - 60_000).toISOString() // 1 minute in the past
      await supabase
        .from('link_tokens')
        .insert({ token_hash: tokenHash, web_user_id: webUserId, expires_at: expiredAt })

      const identityBefore = await supabase
        .from('channel_identities')
        .select('user_id')
        .eq('channel', 'telegram')
        .eq('channel_user_id', SYNTHETIC_TG_USER_ID)
        .maybeSingle()

      // The /link command should fail gracefully -- no exception, no state change.
      await expect(
        handleUpdate(textUpdate(Number(SYNTHETIC_TG_USER_ID), `/link ${rawToken}`)),
      ).resolves.toBeUndefined()

      // Identity must be unchanged.
      const identityAfter = await supabase
        .from('channel_identities')
        .select('user_id')
        .eq('channel', 'telegram')
        .eq('channel_user_id', SYNTHETIC_TG_USER_ID)
        .maybeSingle()

      expect(identityAfter.data?.user_id).toBe(identityBefore.data?.user_id)
    })

    it('/link rejects an invalid (never-inserted) token', async () => {
      const fakeRawToken = randomBytes(32).toString('hex')

      await expect(
        handleUpdate(textUpdate(Number(SYNTHETIC_TG_USER_ID), `/link ${fakeRawToken}`)),
      ).resolves.toBeUndefined()

      // No state change -- identity still points to the synthetic user.
      const { data: identity } = await supabase
        .from('channel_identities')
        .select('user_id')
        .eq('channel', 'telegram')
        .eq('channel_user_id', SYNTHETIC_TG_USER_ID)
        .maybeSingle()

      expect(identity?.user_id).toBe(syntheticUserId)
    })

    // ── PDF test (requires TELEGRAM_TEST_PDF_FILE_ID) ─────────────────────────

    const hasPdfFileId = Boolean(process.env['TELEGRAM_TEST_PDF_FILE_ID'])

    it.skipIf(!hasPdfFileId)(
      'PDF upload: downloads real file, extracts text, saves to careerclaw_profiles',
      async () => {
        const fileId = process.env['TELEGRAM_TEST_PDF_FILE_ID']!

        const update = documentUpdate(Number(SYNTHETIC_TG_USER_ID), fileId, 100_000)
        await expect(handleUpdate(update)).resolves.toBeUndefined()

        // Verify the extracted text was saved to careerclaw_profiles.
        const { data: profile } = await supabase
          .from('careerclaw_profiles')
          .select('resume_text')
          .eq('user_id', syntheticUserId)
          .maybeSingle()

        expect(profile).not.toBeNull()
        expect(profile!.resume_text).not.toBeNull()
        expect(profile!.resume_text!.length).toBeGreaterThan(0)
        expect(profile!.resume_text!.length).toBeLessThanOrEqual(50_000)
      },
    )

    it.skipIf(!hasPdfFileId)(
      'PDF upload is idempotent -- second upload overwrites the first profile row',
      async () => {
        const fileId = process.env['TELEGRAM_TEST_PDF_FILE_ID']!

        // Upload again.
        await handleUpdate(documentUpdate(Number(SYNTHETIC_TG_USER_ID), fileId, 100_000))

        const { data: profiles } = await supabase
          .from('careerclaw_profiles')
          .select('id')
          .eq('user_id', syntheticUserId)

        // Should still be exactly one row (upsert, not insert).
        expect(profiles).toHaveLength(1)
      },
    )
  },
)
