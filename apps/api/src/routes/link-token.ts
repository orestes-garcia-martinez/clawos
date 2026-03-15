/**
 * routes/link-token.ts — POST /link-token
 *
 * Generates a single-use 10-minute Telegram account-linking token.
 *
 * Flow (from migration 20260310000003_link_tokens.sql):
 *   1. Generate 32 random bytes → rawToken (hex string shown to user).
 *   2. Compute HMAC-SHA256(LINK_TOKEN_SECRET, rawToken) → tokenHash.
 *   3. Insert { token_hash, web_user_id, expires_at } into link_tokens.
 *   4. Return { token: rawToken } — only ever lives in this response + user display.
 *
 * The Telegram bot redeems the token by computing the same hash and running
 * a DELETE+RETURNING (atomic single-use) against link_tokens.token_hash.
 *
 * Auth: Supabase JWT required. No service-secret path.
 * Secret: LINK_TOKEN_SECRET (server-side only, never sent to browser).
 */

import type { Context } from 'hono'
import { randomBytes, createHmac } from 'node:crypto'
import { createServerClient } from '@clawos/shared'
import { ENV } from '../env.js'

export async function linkTokenHandler(c: Context): Promise<Response> {
  const userId = c.get('userId') as string

  if (!ENV.LINK_TOKEN_SECRET) {
    console.error('[link-token] LINK_TOKEN_SECRET is not configured.')
    return c.json({ code: 'MISCONFIGURED', message: 'Link token service is not available.' }, 503)
  }

  // 1. Generate raw token (32 random bytes as hex = 64 chars)
  const rawToken = randomBytes(32).toString('hex')

  // 2. HMAC-SHA256(secret, rawToken)
  const tokenHash = createHmac('sha256', ENV.LINK_TOKEN_SECRET).update(rawToken).digest('hex')

  // 3. Expiry: 10 minutes from now
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  // 4. Insert to link_tokens (service role key bypasses RLS)
  const supabase = createServerClient()
  const { error } = await supabase.from('link_tokens').insert({
    token_hash: tokenHash,
    web_user_id: userId,
    expires_at: expiresAt,
  })

  if (error) {
    console.error('[link-token] DB insert error:', error.message)
    return c.json(
      { code: 'INTERNAL_ERROR', message: 'Could not create link token. Please try again.' },
      500,
    )
  }

  // 5. Return raw token only — hash never leaves the server
  return c.json({ token: rawToken })
}
