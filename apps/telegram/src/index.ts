/**
 * ClawOS Telegram Bot Adapter
 *
 * Security:
 *   - Every incoming webhook is validated against X-Telegram-Bot-Api-Secret-Token.
 *     Unsigned requests are rejected with 401 before touching the body.
 *   - No OpenClaw dependencies anywhere in this adapter.
 *
 * Update routing:
 *   /start          -- Welcome message.
 *   /link <token>   -- Telegram-to-Web account claim flow.
 *   /help           -- Usage instructions.
 *   document (PDF)  -- Resume upload: extract text, save to careerclaw_profiles.
 *   text message    -- Forward to Agent API, reply with result.
 *   other           -- Polite unsupported reply.
 *
 * Telegram UX:
 *   Webhook is acknowledged immediately (200 OK before async processing).
 *   Typing indicator is sent before Agent API calls (sendChatAction).
 *   Errors are delivered to the user via sendMessage.
 */

import express from 'express'
import type { Request, Response } from 'express'
import { timingSafeEqual } from 'node:crypto'
import { createServerClient } from '@clawos/shared'
import { ENV } from './env.js'
import { resolveOrCreateTelegramUser } from './identity.js'
import { claimLinkToken } from './link.js'
import { extractPdfFromTelegram, PdfExtractionError } from './pdf.js'
import { callAgentApi, AgentApiError } from './agent-client.js'
import { createRequire } from 'node:module'

// ── Telegram Bot API types ────────────────────────────────────────────────────

export interface TelegramDocument {
  file_id: string
  file_name?: string
  mime_type?: string
  file_size?: number
}

export interface TelegramMessage {
  message_id: number
  from?: { id: number; first_name?: string; username?: string }
  chat: { id: number; type: string }
  text?: string
  document?: TelegramDocument
}

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
}

// ── Signature validation ──────────────────────────────────────────────────────
// Telegram sends X-Telegram-Bot-Api-Secret-Token with each webhook update.
// Validated via constant-time comparison against TELEGRAM_WEBHOOK_SECRET.

export function validateWebhookSecret(incoming: string): boolean {
  const expected = Buffer.from(ENV.TELEGRAM_WEBHOOK_SECRET, 'utf8')
  const actual = Buffer.from(incoming, 'utf8')
  if (expected.length !== actual.length) return false
  return timingSafeEqual(expected, actual)
}

// ── Telegram Bot API helpers ──────────────────────────────────────────────────

export async function sendMessage(chatId: number, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${ENV.TELEGRAM_BOT_TOKEN}/sendMessage`
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // sendMessage text limit is 4096 chars. Truncate defensively.
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4096) }),
    })
  } catch (err) {
    console.error(
      '[telegram] sendMessage failed:',
      err instanceof Error ? err.message : String(err),
    )
  }
}

export async function sendChatAction(chatId: number, action: string): Promise<void> {
  const url = `https://api.telegram.org/bot${ENV.TELEGRAM_BOT_TOKEN}/sendChatAction`
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action }),
    })
  } catch {
    // Non-critical -- do not fail the flow if typing indicator fails.
  }
}

// ── Update handlers ───────────────────────────────────────────────────────────

async function handleTextMessage(chatId: number, userId: string, text: string): Promise<void> {
  await sendChatAction(chatId, 'typing')
  try {
    const { text: reply } = await callAgentApi(userId, text)
    await sendMessage(chatId, reply)
  } catch (err) {
    if (err instanceof AgentApiError && err.httpStatus === 429) {
      await handleRateLimitUpgrade(chatId, userId)
      return
    }
    throw err
  }
}

/**
 * Fetch a Polar checkout URL for a Telegram user via the Agent API.
 * Uses the same service-auth path as normal chat requests.
 * Returns null if billing is not configured or the request fails.
 */
async function fetchCheckoutUrl(userId: string): Promise<string | null> {
  try {
    const response = await fetch(`${ENV.AGENT_API_URL}/billing/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Secret': ENV.SERVICE_SECRET,
        'X-Service-Name': 'telegram',
        'X-User-Id': userId,
      },
      body: JSON.stringify({ source: 'telegram' }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return null
    const data = (await response.json()) as { url?: string }
    return data.url ?? null
  } catch {
    return null
  }
}

/** Send an upgrade prompt when the user has hit the free-tier rate limit. */
async function handleRateLimitUpgrade(chatId: number, userId: string): Promise<void> {
  const checkoutUrl = await fetchCheckoutUrl(userId)

  if (checkoutUrl) {
    await sendMessage(
      chatId,
      `⚡ You've reached the free tier limit.\n\nUpgrade to ClawOS Pro to continue:\n${checkoutUrl}\n\nAfter upgrading, send your next message and Pro access will be active automatically.`,
    )
  } else {
    await sendMessage(
      chatId,
      `⚡ You've reached the free tier limit.\n\nVisit ${ENV.AGENT_API_URL.replace('api.', 'app.')} to upgrade to Pro.`,
    )
  }
}

async function handleDocumentUpload(
  chatId: number,
  userId: string,
  doc: TelegramDocument,
): Promise<void> {
  if (doc.mime_type !== 'application/pdf') {
    await sendMessage(chatId, 'Please upload your resume as a PDF file.')
    return
  }

  await sendChatAction(chatId, 'upload_document')

  let resumeText: string
  try {
    resumeText = await extractPdfFromTelegram(doc.file_id, doc.file_size)
  } catch (err) {
    if (err instanceof PdfExtractionError) {
      await sendMessage(chatId, err.userMessage)
    } else {
      await sendMessage(chatId, 'Failed to read your PDF. Please try again.')
    }
    return
  }

  const supabase = createServerClient()
  const { error } = await supabase
    .from('careerclaw_profiles')
    .upsert({ user_id: userId, resume_text: resumeText }, { onConflict: 'user_id' })

  if (error) {
    console.error('[telegram] Failed to save resume:', error.message)
    await sendMessage(chatId, 'Your resume was read but could not be saved. Please try again.')
    return
  }

  await sendMessage(
    chatId,
    '✅ Resume saved! I have extracted your resume text.\n\nYou can now ask me to find matching jobs — for example: "Find me remote Python engineer roles"',
  )
}

async function handleLinkCommand(
  chatId: number,
  telegramUserId: string,
  text: string,
): Promise<void> {
  const rawToken = text.slice('/link'.length).trim()

  if (!rawToken) {
    await sendMessage(
      chatId,
      'Usage: /link <token>\n\nGenerate a link token from the ClawOS web app under Settings → Link Telegram Account.',
    )
    return
  }

  const result = await claimLinkToken(telegramUserId, rawToken)

  if (result.ok) {
    await sendMessage(
      chatId,
      '✅ Your Telegram account is now linked to your ClawOS web account. Your job history and profile are now shared across both channels.',
    )
    return
  }

  const messages: Record<string, string> = {
    invalid_or_expired:
      '❌ This link token is invalid or has expired (tokens are valid for 10 minutes). Please generate a new token from the ClawOS web app.',
    already_linked:
      '⚠️ Your Telegram account is already linked to a different ClawOS account. Contact support if you need to change this.',
    internal_error: 'Something went wrong while linking your account. Please try again.',
  }

  await sendMessage(chatId, messages[result.reason] ?? 'Something went wrong. Please try again.')
}

// ── Main update dispatcher ────────────────────────────────────────────────────

export async function handleUpdate(update: TelegramUpdate): Promise<void> {
  const message = update.message
  if (!message) return // Ignore non-message updates (callbacks, inline, etc.)

  const chatId = message.chat.id
  const telegramUserId = String(message.from?.id ?? chatId)

  try {
    const userId = await resolveOrCreateTelegramUser(telegramUserId)

    if (message.text) {
      const text = message.text.trim()

      if (text === '/start') {
        await sendMessage(
          chatId,
          'Welcome to ClawOS! 🦀\n\nI can help you find matching jobs based on your resume and preferences.\n\nTo get started:\n1. Upload your resume as a PDF\n2. Ask me to find jobs — e.g. "Find remote Python roles"\n\nType /help for more commands.',
        )
        return
      }

      if (text === '/help') {
        await sendMessage(
          chatId,
          'ClawOS commands:\n\n/start — Welcome message\n/help — Show this message\n/link <token> — Link your Telegram to your web account\n\nYou can also:\n• Upload a PDF to set your resume\n• Ask me anything about job searching',
        )
        return
      }

      if (text.startsWith('/link')) {
        await handleLinkCommand(chatId, telegramUserId, text)
        return
      }

      await handleTextMessage(chatId, userId, text)
      return
    }

    if (message.document) {
      await handleDocumentUpload(chatId, userId, message.document)
      return
    }

    await sendMessage(
      chatId,
      'I can process text messages and PDF resume uploads. Type /help for more info.',
    )
  } catch (err) {
    console.error(
      '[telegram] Error handling update:',
      err instanceof Error ? err.message : String(err),
    )

    let userMsg: string
    if (err instanceof AgentApiError && err.httpStatus === 429) {
      // Rate limit bubble-up (e.g. from document upload path calling agent API indirectly).
      try {
        const telegramUserId = String(message?.from?.id ?? message?.chat.id ?? 'unknown')
        const userId2 = await resolveOrCreateTelegramUser(telegramUserId)
        await handleRateLimitUpgrade(message?.chat.id ?? 0, userId2)
      } catch {
        // Best-effort only.
      }
      return
    } else if (err instanceof AgentApiError && err.code === 'TIMEOUT') {
      userMsg = 'The job search is taking too long. Please try again in a moment.'
    } else {
      userMsg = 'Something went wrong. Please try again in a moment.'
    }

    try {
      await sendMessage(chatId, userMsg)
    } catch {
      // sendMessage itself failed -- nothing more to do.
    }
  }
}

// ── Express app ───────────────────────────────────────────────────────────────

// ── Package version ───────────────────────────────────────────────────────────
const require = createRequire(import.meta.url)
const pkg = require('../package.json') as { version: string }

export const app = express()
app.use(express.json())

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'clawos-telegram',
    version: pkg.version,
    timestamp: new Date().toISOString(),
  })
})

app.post('/webhook', (req: Request, res: Response) => {
  const secretHeader = req.headers['x-telegram-bot-api-secret-token']

  if (typeof secretHeader !== 'string' || !validateWebhookSecret(secretHeader)) {
    res.status(401).json({ error: 'Invalid or missing signature' })
    return
  }

  // Acknowledge immediately -- Telegram requires a response within 5 seconds.
  res.json({ ok: true })

  void handleUpdate(req.body as TelegramUpdate).catch((err: unknown) => {
    console.error(
      '[telegram] Unhandled async error:',
      err instanceof Error ? err.message : String(err),
    )
  })
})

// ── Start ─────────────────────────────────────────────────────────────────────

if (process.env['VITEST'] !== 'true') {
  const port = ENV.PORT
  app.listen(port, () => {
    console.log(`[telegram] ClawOS Telegram adapter running on http://localhost:${port}`)
    console.log(`[telegram] Webhook endpoint: POST http://localhost:${port}/webhook`)
  })
}
