// ─────────────────────────────────────────────────────────────────────────────
// @clawos/shared — public API
//
// Platform types only. Skill-specific types (CareerClaw, etc.) live alongside
// their skill workers and are added from Chat 3 onwards.
// ─────────────────────────────────────────────────────────────────────────────

// ── Re-exports from sub-modules ───────────────────────────────────────────────

export { createBrowserClient, createServerClient } from './supabase.js'
export type {
  CareerClawWorkerInput,
  CareerClawWorkerProfile,
  CareerClawGapAnalysisWorkerInput,
  CareerClawCoverLetterWorkerInput,
  SkillFeatureKey,
  SkillSlug,
  VerifiedSkillExecutionContext,
  WorkerSkillRunRequest,
  WorkerSkillRunResult,
} from './skills.js'
export type { Database, TypedSupabaseClient } from './supabase.js'
export type { Json } from './types/database.types.js'

// ── Prompts ───────────────────────────────────────────────────────────────────
export {
  CAREERCLAW_SYSTEM_PROMPT,
  RUN_CAREERCLAW_TOOL,
  RUN_GAP_ANALYSIS_TOOL,
  RUN_COVER_LETTER_TOOL,
  TRACK_APPLICATION_TOOL,
} from './prompts/careerclaw.js'
export type {
  RunCareerClawInput,
  RunGapAnalysisInput,
  RunCoverLetterInput,
  TrackApplicationInput,
} from './prompts/careerclaw.js'

import type { Database } from './types/database.types.js'

export type UserRow = Database['public']['Tables']['users']['Row']
export type UserInsert = Database['public']['Tables']['users']['Insert']
export type UserUpdate = Database['public']['Tables']['users']['Update']

export type ChannelIdentityRow = Database['public']['Tables']['channel_identities']['Row']
export type ChannelIdentityInsert = Database['public']['Tables']['channel_identities']['Insert']

export type SessionRow = Database['public']['Tables']['sessions']['Row']
export type SessionInsert = Database['public']['Tables']['sessions']['Insert']
export type SessionUpdate = Database['public']['Tables']['sessions']['Update']

export type BillingWebhookEventRow = Database['public']['Tables']['billing_webhook_events']['Row']
export type BillingWebhookEventInsert =
  Database['public']['Tables']['billing_webhook_events']['Insert']

export type UserSkillEntitlementRow = Database['public']['Tables']['user_skill_entitlements']['Row']
export type UserSkillEntitlementInsert =
  Database['public']['Tables']['user_skill_entitlements']['Insert']
export type UserSkillEntitlementUpdate =
  Database['public']['Tables']['user_skill_entitlements']['Update']

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

// ── API contracts ─────────────────────────────────────────────────────────────

export interface ChatRequest {
  userId: string
  channel: Channel
  message: string
  sessionId?: string
}

export interface ChatResponse {
  sessionId: string
  message: string
  skill: string | null
  metadata?: Record<string, unknown>
}

/** SSE progress event emitted during long-running skill invocations. */
export interface ProgressEvent {
  type: 'progress'
  step: string
  message: string
}

export interface ApiError {
  code: string
  message: string
  status: number
}
