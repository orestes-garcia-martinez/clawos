import { z } from 'zod'
import type { Tier } from '@clawos/shared'

export * from './schemas.js'
export * from './assertions.js'
export * from './worker-run.js'

// ── Input validation schemas ───────────────────────────────────────────────────
// All API inputs are validated against these schemas before reaching business logic.
// Malformed inputs are rejected before they touch the skill layer.

export const ChannelSchema = z.enum(['web', 'telegram', 'whatsapp'])
export const TierSchema = z.enum(['free', 'pro'])

export const ChatRequestSchema = z.object({
  userId: z.string().uuid('userId must be a valid UUID'),
  channel: ChannelSchema,
  message: z
    .string()
    .min(1, 'Message cannot be empty')
    .max(4_000, 'Message too long (max 4000 chars)'),
  sessionId: z.string().uuid().optional(),
})

export const ResumeUploadSchema = z.object({
  userId: z.string().uuid(),
  extractedText: z
    .string()
    .min(1, 'Resume text cannot be empty')
    .max(50_000, 'Resume text too long (max 50k chars)'),
})

export const LinkTokenSchema = z.object({
  token: z.string().min(16).max(256),
  telegramUserId: z.string(),
})

export type ChatRequestInput = z.infer<typeof ChatRequestSchema>
export type ResumeUploadInput = z.infer<typeof ResumeUploadSchema>

// ── Rate limit config ─────────────────────────────────────────────────────────

export interface RateLimitConfig {
  windowMs: number
  maxRequests: number
}

export const RATE_LIMITS: Record<Tier, RateLimitConfig> = {
  free: { windowMs: 60 * 60 * 1_000, maxRequests: 10 },
  pro: { windowMs: 60 * 60 * 1_000, maxRequests: 60 },
}

/**
 * Default top-k guidance kept for backward compatibility in API-level helpers.
 * Verified skill execution should derive effective limits from skill features.
 */
export const TOP_K_LIMITS: Record<Tier, number> = {
  free: 3,
  pro: 10,
}

// ── Audit logging ─────────────────────────────────────────────────────────────

export interface AuditEntry {
  userId: string
  skill: string
  channel: string
  status: 'success' | 'error' | 'rate_limited'
  statusCode: number
  durationMs: number
  timestamp: string
}

export function buildAuditEntry(params: Omit<AuditEntry, 'timestamp'>): AuditEntry {
  return { ...params, timestamp: new Date().toISOString() }
}

// ── HMAC helpers ──────────────────────────────────────────────────────────────

import { createHmac, timingSafeEqual } from 'node:crypto'

export function hmacSha256(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}
