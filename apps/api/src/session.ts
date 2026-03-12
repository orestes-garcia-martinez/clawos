/**
 * session.ts — Platform session management.
 *
 * Rules (from Strategy v1.7, Appendix A.1):
 *   - One active session row per (userId, channel).
 *   - Messages stored as {role, content, timestamp} — no raw skill outputs.
 *   - On load: prune to 20 messages and 8,000 tokens before passing to Claude.
 *   - On save: write a human-readable summary of skill output — never raw payloads.
 *     Summarise if skill output exceeds 500 tokens (≈ 375 words).
 *   - Sessions inactive for 30 days are soft-deleted (deleted_at set).
 *   - Expired sessions are excluded from context — user starts fresh.
 */

import { createServerClient } from '@clawos/shared'
import type { Channel, Json, Message, Session } from '@clawos/shared'

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_MESSAGES = 20
const MAX_TOKEN_BUDGET = 8_000
const SUMMARISE_THRESHOLD_TOKENS = 500
const SESSION_EXPIRY_DAYS = 30

// Rough token estimator: 1 token ≈ 4 chars (conservative for English text)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

// ── Load ──────────────────────────────────────────────────────────────────────

/**
 * Load the active session for (userId, channel).
 * If no session exists, or the session is expired, returns null.
 * The caller must create a new session on null return.
 */
export async function loadSession(
  userId: string,
  channel: Channel,
  sessionId?: string,
): Promise<Session | null> {
  const supabase = createServerClient()

  let query = supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('channel', channel)
    .is('deleted_at', null)

  if (sessionId) {
    query = query.eq('id', sessionId)
  }

  const { data, error } = await query.order('last_active', { ascending: false }).limit(1).single()

  if (error || !data) return null

  // Treat sessions inactive for 30+ days as expired — soft-delete and return null
  const lastActive = new Date(data.last_active)
  const expiryMs = SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  if (Date.now() - lastActive.getTime() > expiryMs) {
    await supabase
      .from('sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', data.id)
    return null
  }

  const messages = Array.isArray(data.messages) ? (data.messages as unknown as Message[]) : []

  return {
    id: data.id,
    userId: data.user_id,
    channel: data.channel as Channel,
    messages,
    lastActive: data.last_active,
    createdAt: data.created_at,
    deletedAt: data.deleted_at,
  }
}

// ── Prune ─────────────────────────────────────────────────────────────────────

/**
 * Prune messages to fit within MAX_MESSAGES and MAX_TOKEN_BUDGET.
 * Oldest messages are removed first.
 * Returns the pruned array ready to pass to the Claude API.
 */
export function pruneMessages(messages: Message[]): Message[] {
  // Cap at 20 messages first
  const pruned = messages.slice(-MAX_MESSAGES)

  // Then enforce token budget — remove oldest until we fit
  let totalTokens = pruned.reduce((sum, m) => sum + estimateTokens(m.content), 0)
  while (totalTokens > MAX_TOKEN_BUDGET && pruned.length > 1) {
    const removed = pruned.shift()!
    totalTokens -= estimateTokens(removed.content)
  }

  return pruned
}

// ── Summarise skill output ────────────────────────────────────────────────────

/**
 * Produce a session-safe summary of a skill invocation result.
 *
 * Raw skill JSON is never stored in the session. This function builds a
 * human-readable summary string that captures conversational continuity
 * without storing sensitive resume data or full job payloads.
 *
 * If the formatted response text exceeds SUMMARISE_THRESHOLD_TOKENS,
 * it is truncated to a brief headline summary.
 */
export function summariseSkillOutput(
  skill: string,
  formattedResponse: string,
  metadata: { jobCount?: number; topScore?: number },
): string {
  const tokens = estimateTokens(formattedResponse)

  if (tokens <= SUMMARISE_THRESHOLD_TOKENS) {
    return formattedResponse
  }

  // Build a brief summary for oversized outputs
  const parts: string[] = [`[${skill} result]`]
  if (metadata.jobCount != null) {
    parts.push(`${metadata.jobCount} matches returned.`)
  }
  if (metadata.topScore != null) {
    parts.push(`Top score: ${Math.round(metadata.topScore * 100)}%.`)
  }
  parts.push('Full results delivered to user.')
  return parts.join(' ')
}

// ── Save ──────────────────────────────────────────────────────────────────────

/**
 * Upsert the session after a turn completes.
 * If sessionId is provided, updates that row. Otherwise creates a new row.
 *
 * messages should already include the new user + assistant messages appended.
 * The full message array (not just the delta) is written — the pruning
 * threshold for storage is softer than the Claude context limit.
 */
export async function saveSession(
  userId: string,
  channel: Channel,
  messages: Message[],
  sessionId?: string,
): Promise<string> {
  const supabase = createServerClient()
  const now = new Date().toISOString()

  // Store at most MAX_MESSAGES — prune oldest on write too
  const toStore = messages.slice(-MAX_MESSAGES)

  if (sessionId) {
    const { error } = await supabase
      .from('sessions')
      .update({
        messages: toStore as unknown as Json,
        last_active: now,
      })
      .eq('id', sessionId)
      .eq('user_id', userId)

    if (error) {
      console.error('[session] Failed to update session:', error.message)
    }
    return sessionId
  }

  // Create new session
  const { data, error } = await supabase
    .from('sessions')
    .insert({
      user_id: userId,
      channel,
      messages: toStore as unknown as Json,
      last_active: now,
    })
    .select('id')
    .single()

  if (error || !data) {
    console.error('[session] Failed to create session:', error?.message)
    return 'unknown'
  }

  return data.id
}
