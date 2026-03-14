/**
 * index.ts — ClawOS Agent API entry point.
 *
 * Routes:
 *   GET  /health          — public health check
 *   POST /chat            — main agent endpoint (auth + rate limit + SSE)
 *
 * Chat 7 will add:
 *   POST /billing/webhook      — Polar.sh webhook handler
 *   POST /billing/force-sync   — Admin tier sync endpoint
 *
 * Exported as `app` for Vercel serverless (vercel.json routes all to this).
 * Also starts a local @hono/node-server when run directly.
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { ENV } from './env.js'
import { requireAuth } from './auth.js'
import { rateLimit } from './rate-limit.js'
import { chatHandler } from './routes/chat.js'

// ── App ───────────────────────────────────────────────────────────────────────

const app = new Hono()

// ── CORS — strict: only the ClawOS web domain ─────────────────────────────────
app.use(
  '*',
  cors({
    origin: ENV.ALLOWED_ORIGIN,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'X-Channel',
      'X-Service-Secret',
      'X-Service-Name',
      'X-User-Id',
    ],
    exposeHeaders: ['Content-Type'],
  }),
)

// ── Health check — no auth required ──────────────────────────────────────────
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'clawos-api',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  })
})

// ── POST /chat — main agent endpoint ─────────────────────────────────────────
// Auth → rate limit → SSE handler
app.post('/chat', requireAuth(), rateLimit(), chatHandler)

// ── Stubs — Chat 7 (Billing) ──────────────────────────────────────────────────
// TODO Chat 7: POST /billing/webhook
// TODO Chat 7: POST /billing/force-sync

// ── Server (local dev + Lightsail) ───────────────────────────────────────────
// Vercel uses the default export (app.fetch) — this block is skipped there.

if (!process.env['VERCEL']) {
  const port = ENV.PORT
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[api] ClawOS Agent API running on http://localhost:${info.port}`)
  })
}

export default app
