// ClawOS Agent API
// Chat 4 builds: POST /chat, Supabase JWT auth, Claude orchestration, SSE streaming

import { Hono } from 'hono'
import { serve } from '@hono/node-server'

// ── App ───────────────────────────────────────────────────────────────────────

const app = new Hono()

// ── Health check — no auth required ──────────────────────────────────────────
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'clawos-api',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  })
})

// ── Stubs — implemented in subsequent chats ───────────────────────────────────

// TODO Chat 4: POST /chat
//   - Supabase JWT validation
//   - Session context load/save
//   - Claude API orchestration with CareerClaw system prompt
//   - Skill worker invocation (POST to Lightsail worker)
//   - SSE streaming (progress events + final response)
//   - Per-tier rate limiting
//   - Zod input validation
//   - Audit logging (metadata only)

// TODO Chat 7: POST /billing/webhook
//   - Polar.sh signature validation
//   - Update users.tier in Supabase on subscription events

// TODO Chat 7: POST /billing/force-sync (internal admin endpoint)
//   - Force-sync a user's tier from Polar.sh on demand

// ── Server ────────────────────────────────────────────────────────────────────

const port = Number(process.env.PORT ?? 3001)

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`ClawOS API running on http://localhost:${info.port}`)
})

export default app
