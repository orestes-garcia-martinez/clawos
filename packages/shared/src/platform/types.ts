// ─────────────────────────────────────────────────────────────────────────────
// Platform domain types — core enums, literals, and entity interfaces.
// ─────────────────────────────────────────────────────────────────────────────

// ── Enums / Literals ──────────────────────────────────────────────────────────

export type Channel = 'web' | 'telegram' | 'whatsapp'
export type Tier = 'free' | 'pro'
export type MessageRole = 'user' | 'assistant'

// ── Platform domain types ─────────────────────────────────────────────────────

/** Canonical platform user. tier is a cached snapshot — Polar.sh is authoritative. */
export interface User {
  id: string
  email: string | null
  name: string | null
  tier: Tier
  createdAt: string
  updatedAt: string
}

/** Maps an external channel user ID to a canonical Supabase Auth UUID. */
export interface ChannelIdentity {
  id: string
  userId: string
  channel: Channel
  /** External channel user ID — e.g. Telegram numeric user ID as a string. */
  channelUserId: string
  createdAt: string
}

/**
 * A single message in a session's conversation history.
 * This is the only content type stored in sessions.messages.
 * Full formatted responses are stored verbatim — the 20-message /
 * 8,000-token pruning system handles size naturally.
 */
export interface Message {
  role: MessageRole
  content: string
  timestamp: string
}

// ── Session state (structured scratchpad) ────────────────────────────────────

/**
 * Compact match entry in session state.
 * Stored in state.briefing.matches for Claude to identify matches by job_id.
 */
export interface SessionMatchEntry {
  job_id: string
  title: string
  company: string
  score: number
  url: string | null
}

/**
 * Structured session state — persisted alongside messages in the sessions table.
 * Survives message pruning. Never truncated.
 *
 * Follows the Google ADK pattern: messages are the conversation history,
 * state is the agent's working scratchpad for structured data that must
 * survive across turns regardless of message pruning.
 */
export interface SessionState {
  /** Active briefing data — replaced on each new briefing run */
  briefing?: {
    /** ISO timestamp when this briefing was cached */
    cachedAt: string
    /** Compact match index for Claude to resolve job_ids */
    matches: SessionMatchEntry[]
    /** Full match data for worker calls (gap analysis, cover letter) */
    matchData: Array<Record<string, unknown>>
    /** Resume intelligence used for this briefing */
    resumeIntel: Record<string, unknown>
    /** Profile snapshot at time of briefing */
    profile: Record<string, unknown>
    /** Resume text at time of briefing */
    resumeText: string | null
  }
  /** Gap analysis results, keyed by job_id — reused by cover letters */
  gapResults?: Record<string, Record<string, unknown>>
  coverLetterResults?: Record<string, Record<string, unknown>>
}

/**
 * Platform-level conversation session.
 * One active row per (userId, channel).
 * Messages are pruned to 20 max and 8,000 tokens before each Claude call.
 * State is a structured scratchpad that survives message pruning.
 * Sessions inactive for 30 days are soft-deleted.
 */
export interface Session {
  id: string
  userId: string
  channel: Channel
  messages: Message[]
  state: SessionState
  lastActive: string
  createdAt: string
  deletedAt: string | null
}
