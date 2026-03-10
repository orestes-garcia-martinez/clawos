// ClawOS Telegram Bot Adapter
// Chat 5 builds the full implementation:
//   - HMAC-SHA256 signature validation on every incoming update
//   - Message normalization → Agent API format
//   - Resume PDF extraction
//   - Supabase user identity mapping (channel_identities table)
//   - /link account claim flow (Telegram-to-Web account merge)
//
// Security: unsigned webhooks are rejected with 401 — non-negotiable.
// No OpenClaw dependencies anywhere in this file.
//
// Design note: we use the Telegram Bot API directly via fetch rather than
// node-telegram-bot-api, which carries critical transitive CVEs (form-data,
// qs, tough-cookie via the deprecated `request` lib). Raw webhook handling
// needs only Express + fetch. Chat 5 will add typed Bot API helpers inline.

import express from 'express'
import type { Request, Response } from 'express'
import { createHmac, timingSafeEqual } from 'node:crypto'

// ── Boot guards ───────────────────────────────────────────────────────────────

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET

if (!TELEGRAM_BOT_TOKEN) {
  console.error('[telegram] Fatal: TELEGRAM_BOT_TOKEN env var is required.')
  process.exit(1)
}

if (!TELEGRAM_WEBHOOK_SECRET) {
  console.error('[telegram] Fatal: TELEGRAM_WEBHOOK_SECRET env var is required.')
  process.exit(1)
}

// ── Signature validation ──────────────────────────────────────────────────────
// Telegram sends an X-Telegram-Bot-Api-Secret-Token header with every webhook.
// We validate it against our TELEGRAM_WEBHOOK_SECRET to reject forged requests.

function validateTelegramSecret(incomingSecret: string): boolean {
  const expected = Buffer.from(TELEGRAM_WEBHOOK_SECRET as string)
  const incoming = Buffer.from(incomingSecret)
  if (expected.length !== incoming.length) return false
  return timingSafeEqual(expected, incoming)
}

// ── App ───────────────────────────────────────────────────────────────────────

const app = express()
app.use(express.json())

// ── Health check — no auth ────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'clawos-telegram', version: '0.1.0' })
})

// ── Webhook handler ───────────────────────────────────────────────────────────
app.post('/webhook', (req: Request, res: Response) => {
  // Step 1: validate Telegram secret token header
  const secretHeader = req.headers['x-telegram-bot-api-secret-token']
  if (typeof secretHeader !== 'string' || !validateTelegramSecret(secretHeader)) {
    res.status(401).json({ error: 'Invalid or missing signature' })
    return
  }

  // Step 2: acknowledge receipt immediately (Telegram requires fast response)
  res.json({ ok: true })

  // TODO Chat 5: Determine update type (message, document, command)
  // TODO Chat 5: Map telegram_user_id → Supabase user via channel_identities
  // TODO Chat 5: Handle /link <token> command (account claim flow)
  // TODO Chat 5: Normalize message → Agent API ChatRequest format
  // TODO Chat 5: Extract resume text if document upload
  // TODO Chat 5: POST to Agent API, deliver response back to user

  const update = req.body as Record<string, unknown>
  console.log('[telegram] Update received:', JSON.stringify(update).slice(0, 200))
})

// ── Unused var suppression — remove after Chat 5 ─────────────────────────────
const _hmac = createHmac // imported for use in Chat 5 full implementation

// ── Server ────────────────────────────────────────────────────────────────────
const port = Number(process.env.PORT ?? 3003)
app.listen(port, () => {
  console.log(`[telegram] ClawOS Telegram adapter running on http://localhost:${port}`)
  console.log(`[telegram] Webhook endpoint: POST http://localhost:${port}/webhook`)
})
