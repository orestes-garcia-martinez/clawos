// ─────────────────────────────────────────────────────────────────────────────
// @clawos/shared — public API
//
// Platform types only. Skill-specific types (CareerClaw, etc.) live alongside
// their skill workers and are added from Chat 3 onwards.
// ─────────────────────────────────────────────────────────────────────────────

// ── Re-exports from sub-modules ───────────────────────────────────────────────

export { createBrowserClient, createServerClient } from './supabase.js'
export type { Database, TypedSupabaseClient } from './supabase.js'
export type { Json } from './types/database.types.js'

import type { Database } from './types/database.types.js'

export type UserRow = Database['public']['Tables']['users']['Row']
export type UserInsert = Database['public']['Tables']['users']['Insert']
export type UserUpdate = Database['public']['Tables']['users']['Update']

export type ChannelIdentityRow = Database['public']['Tables']['channel_identities']['Row']
export type ChannelIdentityInsert = Database['public']['Tables']['channel_identities']['Insert']

export type SessionRow = Database['public']['Tables']['sessions']['Row']
export type SessionInsert = Database['public']['Tables']['sessions']['Insert']
export type SessionUpdate = Database['public']['Tables']['sessions']['Update']

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
 * Raw skill outputs are never stored here — summaries only.
 */
export interface Message {
  role: MessageRole
  content: string
  timestamp: string
}

/**
 * Platform-level conversation session.
 * One active row per (userId, channel).
 * Messages are pruned to 20 max and 8,000 tokens before each Claude call.
 * Sessions inactive for 30 days are soft-deleted.
 */
export interface Session {
  id: string
  userId: string
  channel: Channel
  messages: Message[]
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
