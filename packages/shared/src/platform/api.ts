// ─────────────────────────────────────────────────────────────────────────────
// API contracts — request/response shapes shared between server and clients.
// ─────────────────────────────────────────────────────────────────────────────

import type { Channel } from './types.js'

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
