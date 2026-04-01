/**
 * session.ts — Platform session management.
 *
 * Rules (from Strategy v1.7, Appendix A.1 — updated post-MVP):
 *   - One active session row per (userId, channel).
 *   - Messages stored as {role, content, timestamp}.
 *   - Full formatted responses stored verbatim (no truncation).
 *   - On load: prune to 20 messages and 8,000 tokens before passing to Claude.
 *   - Sessions inactive for 30 days are soft-deleted.
 *
 * State (structured scratchpad):
 *   - Stored in a separate `state` JSONB column on the sessions row.
 *   - Contains briefing match data, gap analysis results, profile snapshots.
 *   - Never pruned by message-count or token-budget logic.
 *   - Updated atomically alongside messages on each turn (Option A — batch write).
 *   - Follows the Google ADK session state pattern.
 */

import { createServerClient } from '@clawos/shared'
import type { Channel, Json, Message, Session, SessionState } from '@clawos/shared'

// Add a type for the insert payload
type SessionInsert = {
  user_id: string
  channel: string
  messages: Json
  last_active: string
  state?: Json
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_MESSAGES = 20
const MAX_TOKEN_BUDGET = 8_000
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

  // Parse state — default to empty object for sessions created before migration
  let state: SessionState = {}
  if (data.state && typeof data.state === 'object' && !Array.isArray(data.state)) {
    state = data.state as unknown as SessionState
  }

  return {
    id: data.id,
    userId: data.user_id,
    channel: data.channel as Channel,
    messages,
    state,
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

// ── State helpers ────────────────────────────────────────────────────────────

/**
 * Deep-merge a partial state update into an existing SessionState.
 * Top-level keys are merged (not replaced). `gapResults` and
 * `coverLetterResults` are merged additively (per-job_id entries are
 * added without removing existing ones). A new briefing clears both
 * caches to prevent stale job_ids from a previous briefing run surviving.
 */
export function mergeSessionState(
  existing: SessionState,
  update: Partial<SessionState>,
): SessionState {
  const merged = { ...existing }

  // If briefing is provided, replace entirely (new briefing replaces old)
  if (update.briefing !== undefined) {
    merged.briefing = update.briefing
    // A new briefing clears stale results from the previous briefing
    merged.gapResults = {}
    merged.coverLetterResults = {}
  }

  // Merge gap results additively (new results added to existing)
  if (update.gapResults) {
    merged.gapResults = {
      ...(merged.gapResults ?? {}),
      ...update.gapResults,
    }
  }

  // Merge cover letter results additively (new results added to existing)
  if (update.coverLetterResults) {
    merged.coverLetterResults = {
      ...(merged.coverLetterResults ?? {}),
      ...update.coverLetterResults,
    }
  }

  return merged
}

/**
 * Look up a specific match by job_id within session state.
 * Returns the compact match entry and the full match data.
 */
export function getMatchFromState(
  state: SessionState,
  jobId: string,
): {
  entry: { job_id: string; title: string; company: string; score: number; url: string | null }
  matchData: Record<string, unknown>
  resumeIntel: Record<string, unknown>
  profile: Record<string, unknown>
  resumeText: string | null
} | null {
  if (!state.briefing) return null

  const index = state.briefing.matches.findIndex((m) => m.job_id === jobId)
  if (index === -1) return null

  const matchData = state.briefing.matchData[index]
  if (!matchData) return null

  return {
    entry: state.briefing.matches[index]!,
    matchData,
    resumeIntel: state.briefing.resumeIntel,
    profile: state.briefing.profile,
    resumeText: state.briefing.resumeText,
  }
}

/**
 * Retrieve a cached gap analysis result for a specific job_id.
 */
export function getGapResultFromState(
  state: SessionState,
  jobId: string,
): Record<string, unknown> | null {
  return state.gapResults?.[jobId] ?? null
}

// ── Save ──────────────────────────────────────────────────────────────────────

/**
 * Upsert the session after a turn completes.
 * If sessionId is provided, updates that row. Otherwise creates a new row.
 *
 * messages should already include the new user + assistant messages appended.
 * The full message array (not just the delta) is written — the pruning
 * threshold for storage is softer than the Claude context limit.
 *
 * stateUpdate: optional partial state to merge into the existing session state.
 * Uses mergeSessionState() — briefing replaces, gapResults and coverLetterResults
 * merge additively. A new briefing clears both result caches.
 */
export async function saveSession(
  userId: string,
  channel: Channel,
  messages: Message[],
  sessionId?: string,
  stateUpdate?: Partial<SessionState>,
  existingState?: SessionState,
): Promise<string> {
  const supabase = createServerClient()
  const now = new Date().toISOString()

  // Store at most MAX_MESSAGES — prune oldest on write too
  const toStore = messages.slice(-MAX_MESSAGES)

  // Compute merged state if an update is provided
  const mergedState = stateUpdate
    ? mergeSessionState(existingState ?? {}, stateUpdate)
    : existingState

  if (sessionId) {
    const updatePayload: Record<string, unknown> = {
      messages: toStore as unknown as Json,
      last_active: now,
    }
    if (mergedState !== undefined) {
      updatePayload['state'] = mergedState as unknown as Json
    }

    const { error } = await supabase
      .from('sessions')
      .update(updatePayload)
      .eq('id', sessionId)
      .eq('user_id', userId)

    if (error) {
      console.error('[session] Failed to update session:', error.message)
    }
    return sessionId
  }

  // Create new session
  const insertPayload: SessionInsert = {
    user_id: userId,
    channel,
    messages: toStore as unknown as Json,
    last_active: now,
  }
  if (mergedState !== undefined) {
    insertPayload['state'] = mergedState as unknown as Json
  }

  // onConflict: 'user_id,channel' — when a session already exists for this
  // (user, channel) pair (e.g. after "New Conversation" clears activeSessionId),
  // UPDATE the existing row with fresh messages and state instead of failing
  // with a unique-constraint violation. The existing session UUID is returned
  // so the web client can reference it on subsequent turns.
  const { data, error } = await supabase
    .from('sessions')
    .upsert(insertPayload, { onConflict: 'user_id,channel' })
    .select('id')
    .single()

  if (error || !data) {
    console.error('[session] Failed to create session:', error?.message)
    return 'unknown'
  }

  return data.id
}
