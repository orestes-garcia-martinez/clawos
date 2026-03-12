/**
 * auth.ts — Supabase JWT validation middleware for Hono.
 *
 * Every protected route runs this middleware. It:
 *   1. Reads the Authorization: Bearer <jwt> header.
 *   2. Verifies the JWT with Supabase (server-side, service role client).
 *   3. Loads the user row to get the cached tier snapshot.
 *   4. Sets c.var.userId and c.var.userTier for downstream handlers.
 *
 * Returns 401 on any auth failure — no detail in the response body.
 */

import type { Context, MiddlewareHandler, Next } from 'hono'
import { createServerClient } from '@clawos/shared'
import type { Tier } from '@clawos/shared'

// Extend Hono's variable types so downstream handlers are type-safe
declare module 'hono' {
  interface ContextVariableMap {
    userId: string
    userTier: Tier
  }
}

export function requireAuth(): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json(
        { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' },
        401,
      )
    }

    const jwt = authHeader.slice(7)

    // Verify the JWT and get the authenticated user
    const supabase = createServerClient()
    const { data: authData, error: authError } = await supabase.auth.getUser(jwt)

    if (authError || !authData.user) {
      return c.json({ code: 'UNAUTHORIZED', message: 'Invalid or expired token' }, 401)
    }

    const userId = authData.user.id

    // Load the user row for the cached tier snapshot
    const { data: userRow, error: userError } = await supabase
      .from('users')
      .select('tier')
      .eq('id', userId)
      .single()

    if (userError || !userRow) {
      // User row missing — treat as free tier rather than hard-failing
      // This can happen briefly after signup before the row is created
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
