/**
 * index.ts — ClawOS Agent API entry point.
 *
 * Routes:
 *   GET  /health              — public health check
 *   POST /chat                — main agent endpoint (auth + rate limit + SSE)
 *   POST /resume/extract      — PDF text extraction for web client (Chat 6)
 *   POST /link-token          — generate Telegram linking token (Chat 6)
 *
 * Chat 7 will add:
 *   POST /billing/webhook      — Polar.sh webhook handler
 *   POST /billing/force-sync   — Admin tier sync endpoint
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { bodyLimit } from 'hono/body-limit'
import { serve } from '@hono/node-server'
import { ENV } from './env.js'
import { requireAuth } from './auth.js'
import { rateLimit } from './rate-limit.js'
import { chatHandler } from './routes/chat.js'
import { resumeExtractHandler } from './routes/resume.js'
import { linkTokenHandler } from './routes/link-token.js'

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

// ── POST /resume/extract — PDF text extraction (web client) ───────────────────
// Auth required; no rate limit separate from /chat for MVP.
app.post(
  '/resume/extract',
  requireAuth(),
  bodyLimit({ maxSize: 6 * 1024 * 1024 }), // ~6 MB to allow multipart overhead on a 5 MB PDF
  resumeExtractHandler,
)

// ── POST /link-token — Telegram account linking ───────────────────────────────
// Auth required. Generates a single-use 10-min HMAC token.
app.post('/link-token', requireAuth(), linkTokenHandler)

// ── Stubs — Chat 7 (Billing) ──────────────────────────────────────────────────
// TODO Chat 7: POST /billing/webhook
// TODO Chat 7: POST /billing/force-sync

// ── Server (local dev + Lightsail) ───────────────────────────────────────────

if (process.env['VITEST'] !== 'true') {
  const port = ENV.PORT
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[api] ClawOS Agent API running on http://localhost:${info.port}`)
  })
}

export { app }
export default app
