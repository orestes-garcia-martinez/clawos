/**
 * rate-limit.ts — In-memory sliding window rate limiter for Hono.
 *
 * Limits: free = 10 req/hr, pro = 60 req/hr (from packages/security RATE_LIMITS).
 *
 * Risk accepted at MVP: in-memory state is per-process. On Vercel serverless,
 * each function instance has its own store. This means the effective limit is
 * per-instance, not per-user globally. This is acceptable for MVP — a shared
 * Redis store (e.g. Upstash) can replace this at Phase 2 if abuse is observed.
 *
 * Returns 429 with a Retry-After header when the limit is exceeded.
 * Audit-logs the rate_limited event (metadata only — no message bodies).
 */

import type { Context, MiddlewareHandler, Next } from 'hono'
import { RATE_LIMITS, buildAuditEntry } from '@clawos/security'
import type { Tier } from '@clawos/shared'

interface WindowEntry {
  timestamps: number[]
}

// Module-level store — one entry per userId
const store = new Map<string, WindowEntry>()

/** Reset all rate limit state — for use in tests only. */
export function _resetRateLimitStore(): void {
  store.clear()
}

export function rateLimit(): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const userId = c.get('userId') as string | undefined
    const tier = (c.get('userTier') as Tier | undefined) ?? 'free'

    // Auth middleware must run before this
    if (!userId) {
      return c.json({ code: 'UNAUTHORIZED', message: 'Not authenticated' }, 401)
    }

    const limit = RATE_LIMITS[tier]
    const now = Date.now()
    const windowStart = now - limit.windowMs

    let entry = store.get(userId)
    if (!entry) {
      entry = { timestamps: [] }
      store.set(userId, entry)
    }

    // Prune timestamps outside the current window
    entry.timestamps = entry.timestamps.filter((t) => t > windowStart)

    if (entry.timestamps.length >= limit.maxRequests) {
      const oldestInWindow = entry.timestamps[0] ?? now
      const retryAfterMs = oldestInWindow + limit.windowMs - now
      const retryAfterSec = Math.ceil(retryAfterMs / 1000)

      const auditEntry = buildAuditEntry({
        userId,
        skill: 'api',
        channel: c.req.header('X-Channel') ?? 'unknown',
        status: 'rate_limited',
        statusCode: 429,
        durationMs: 0,
      })
      console.log(JSON.stringify(auditEntry))

      return c.json(
        {
          code: 'RATE_LIMITED',
          message: `Rate limit exceeded. Retry after ${retryAfterSec} seconds.`,
        },
        429,
        { 'Retry-After': String(retryAfterSec) },
      )
    }

    entry.timestamps.push(now)
    return next()
  }
}
