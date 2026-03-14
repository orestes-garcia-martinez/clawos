/**
 * auth.ts -- Supabase JWT validation middleware for Hono.
 *
 * Supports two auth paths:
 *
 * 1. JWT path (Web client) -- Authorization: Bearer <supabase-jwt>
 *    Verifies the JWT with Supabase and loads the user's cached tier.
 *
 * 2. Service path (internal adapters: Telegram, WhatsApp) --
 *    X-Service-Secret: <shared-secret>
 *    X-Service-Name:   telegram | whatsapp
 *    X-User-Id:        <supabase-uuid>
 *    The adapter authenticates the channel user externally (e.g. via
 *    channel_identities), then presents the verified Supabase UUID here.
 *    The tier is still looked up from Supabase for correct gating.
 *
 * Returns 401 on any auth failure -- no detail in the response body.
 */

import type { Context, MiddlewareHandler, Next } from 'hono'
import { createServerClient } from '@clawos/shared'
import type { Tier } from '@clawos/shared'
import { timingSafeEqual } from 'node:crypto'
import { ENV } from './env.js'

// Extend Hono's variable types so downstream handlers are type-safe
declare module 'hono' {
  interface ContextVariableMap {
    userId: string
    userTier: Tier
  }
}

// Trusted internal services permitted to use X-Service-Secret auth.
// Adding a new channel adapter = add its name here.
const KNOWN_SERVICES = new Set(['telegram', 'whatsapp'])

/**
 * Constant-time UTF-8 string comparison.
 * Prevents timing attacks on secret comparisons.
 */
function safeStringCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8')
  const bBuf = Buffer.from(b, 'utf8')
  if (aBuf.length !== bBuf.length) return false
  return timingSafeEqual(aBuf, bBuf)
}

export function requireAuth(): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    // -- Service auth path -- for trusted internal channel adapters ----------
    // Presence of X-Service-Secret header routes to the service path.
    const serviceSecret = c.req.header('X-Service-Secret')
    if (serviceSecret !== undefined) {
      return handleServiceAuth(c, next, serviceSecret)
    }

    // -- JWT auth path -- for direct Web client requests --------------------
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json(
        { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' },
        401,
      )
    }

    const jwt = authHeader.slice(7)

    const supabase = createServerClient()
    const { data: authData, error: authError } = await supabase.auth.getUser(jwt)

    if (authError || !authData.user) {
      return c.json({ code: 'UNAUTHORIZED', message: 'Invalid or expired token' }, 401)
    }

    const userId = authData.user.id

    const { data: userRow, error: userError } = await supabase
      .from('users')
      .select('tier')
      .eq('id', userId)
      .single()

    if (userError || !userRow) {
      // User row missing -- treat as free tier rather than hard-failing.
      // Can happen briefly after signup before the trigger-created row arrives.
      c.set('userId', userId)
      c.set('userTier', 'free' as Tier)
      return next()
    }

    const tier: Tier = userRow.tier === 'pro' ? 'pro' : 'free'
    c.set('userId', userId)
    c.set('userTier', tier)

    return next()
  }
}

async function handleServiceAuth(
  c: Context,
  next: Next,
  incomingSecret: string,
): Promise<Response | void> {
  const configured = ENV.SERVICE_SECRET
  if (!configured) {
    return c.json({ code: 'UNAUTHORIZED', message: 'Service auth not configured' }, 401)
  }

  if (!safeStringCompare(incomingSecret, configured)) {
    return c.json({ code: 'UNAUTHORIZED', message: 'Invalid service secret' }, 401)
  }

  const serviceName = c.req.header('X-Service-Name')
  if (!serviceName || !KNOWN_SERVICES.has(serviceName)) {
    return c.json({ code: 'UNAUTHORIZED', message: 'Unknown or missing X-Service-Name' }, 401)
  }

  const userId = c.req.header('X-User-Id')
  if (!userId) {
    return c.json({ code: 'UNAUTHORIZED', message: 'Missing X-User-Id header' }, 401)
  }

  // Look up the user's tier for correct rate limiting and feature gating.
  const supabase = createServerClient()
  const { data: userRow } = await supabase
    .from('users')
    .select('tier')
    .eq('id', userId)
    .maybeSingle()

  const tier: Tier = userRow?.tier === 'pro' ? 'pro' : 'free'
  c.set('userId', userId)
  c.set('userTier', tier)

  return next()
}
