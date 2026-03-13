import { z } from 'zod'
import type { Tier } from '@clawos/shared'

// ── Input validation schemas ───────────────────────────────────────────────────
// All API inputs are validated against these schemas before reaching business logic.
// Malformed inputs are rejected before they touch the skill layer.

export const ChannelSchema = z.enum(['web', 'telegram', 'whatsapp'])
export const TierSchema = z.enum(['free', 'pro'])
export const WorkModeSchema = z.enum(['remote', 'hybrid', 'onsite'])

export const ChatRequestSchema = z.object({
  userId: z.string().uuid('userId must be a valid UUID'),
  channel: ChannelSchema,
  message: z
    .string()
    .min(1, 'Message cannot be empty')
    .max(4_000, 'Message too long (max 4000 chars)'),
  sessionId: z.string().uuid().optional(),
})

/**
 * CareerClawProfileSchema — validates the profile payload sent from the Agent API
 * to the worker. Field names are camelCase (ClawOS convention); cli-adapter.ts
 * translates them to snake_case for profile.json (careerclaw-js convention).
 *
 * Mapping to careerclaw-js UserProfile:
 *   skills          → skills          (primary keyword corpus — must be populated for matches)
 *   targetRoles     → target_roles    (secondary keyword corpus)
 *   experienceYears → experience_years
 *   resumeSummary   → resume_summary  (tertiary keyword corpus)
 *   workMode        → work_mode
 *   salaryMin       → salary_min
 *   locationPref    → location
 */
export const CareerClawProfileSchema = z.object({
  name: z.string().max(200).optional(),
  /** Skills list — primary keyword matching corpus. Empty = zero matches from engine. */
  skills: z.array(z.string().max(100)).max(100).optional().default([]),
  /** Target role titles — secondary keyword corpus. */
  targetRoles: z.array(z.string().max(200)).max(20).optional().default([]),
  /** Total years of professional experience. */
  experienceYears: z.number().int().min(0).max(60).nullable().optional(),
  /** Short resume summary — tertiary keyword corpus. Max 2000 chars. */
  resumeSummary: z.string().max(2_000).nullable().optional(),
  workMode: WorkModeSchema.optional(),
  salaryMin: z.number().int().positive().max(10_000_000).optional(),
  salaryMax: z.number().int().positive().max(10_000_000).optional(),
  /** User's preferred work location (free-text, max 200 chars). */
  locationPref: z.string().max(200).optional(),
})

export const CareerClawRunSchema = z
  .object({
    userId: z.string().uuid(),
    profile: CareerClawProfileSchema,
    /** Extracted resume text — never the raw PDF */
    resumeText: z.string().max(50_000, 'Resume text too long (max 50k chars)').optional(),
    /** Free tier max: 3. Pro tier max: 10. */
    topK: z.number().int().min(1).max(10).default(3),
  })
  .refine(
    (d) => {
      if (d.profile.salaryMin != null && d.profile.salaryMax != null) {
        return d.profile.salaryMin <= d.profile.salaryMax
      }
      return true
    },
    { message: 'salaryMin must be <= salaryMax', path: ['profile', 'salaryMin'] },
  )

export const ResumeUploadSchema = z.object({
  userId: z.string().uuid(),
  /** Extracted plain text only. 5MB PDF limit enforced at upload; 50k chars stored. */
  extractedText: z
    .string()
    .min(1, 'Resume text cannot be empty')
    .max(50_000, 'Resume text too long (max 50k chars)'),
})

export const LinkTokenSchema = z.object({
  token: z.string().min(16).max(256),
  telegramUserId: z.string(),
})

// Inferred types for use in apps
export type ChatRequestInput = z.infer<typeof ChatRequestSchema>
export type CareerClawRunInput = z.infer<typeof CareerClawRunSchema>
export type ResumeUploadInput = z.infer<typeof ResumeUploadSchema>

// ── Rate limit config ─────────────────────────────────────────────────────────

export interface RateLimitConfig {
  /** Window duration in milliseconds */
  windowMs: number
  /** Max requests per window */
  maxRequests: number
}

/** Per-tier rate limits for the Agent API */
export const RATE_LIMITS: Record<Tier, RateLimitConfig> = {
  free: { windowMs: 60 * 60 * 1_000, maxRequests: 10 }, // 10 req/hour
  pro: { windowMs: 60 * 60 * 1_000, maxRequests: 60 }, //  60 req/hour
}

/** Top-K job result limits per tier */
export const TOP_K_LIMITS: Record<Tier, number> = {
  free: 3,
  pro: 10,
}

// ── Audit logging ─────────────────────────────────────────────────────────────
// Audit logs record metadata only.
// Raw resume text, full prompts, and message bodies are NEVER logged.

export interface AuditEntry {
  /** Supabase user UUID */
  userId: string
  /** Skill invoked, e.g. 'careerclaw' */
  skill: string
  /** Channel the request came from */
  channel: string
  /** Outcome */
  status: 'success' | 'error' | 'rate_limited'
  /** HTTP status or error code */
  statusCode: number
  /** Wall-clock duration of the full skill invocation */
  durationMs: number
  timestamp: string
}

/**
 * Build a safe audit entry. Never pass raw user content here.
 */
export function buildAuditEntry(params: Omit<AuditEntry, 'timestamp'>): AuditEntry {
  return { ...params, timestamp: new Date().toISOString() }
}

// ── HMAC helpers ──────────────────────────────────────────────────────────────
// Used for Telegram webhook validation and account-link tokens.
// Full implementations wired in Chat 5 (Telegram) and Chat 7 (Billing).

import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Compute an HMAC-SHA256 hex digest.
 */
export function hmacSha256(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

/**
 * Constant-time comparison of two hex digests.
 * Prevents timing attacks on signature checks.
 */
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
}
