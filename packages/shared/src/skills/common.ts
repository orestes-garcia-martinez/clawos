// ─────────────────────────────────────────────────────────────────────────────
// Shared skill contracts — platform-level types used across all skills.
//
// These types define the ClawOS-side contract between:
//   - Agent API (apps/api)
//   - Skill worker (apps/worker)
//   - First-party skill adapters (e.g. careerclaw, scrapeclaw)
//
// They are intentionally generic so that new skills can reuse the same
// execution context, request/result envelope, and slug registry without
// touching this file beyond extending the SkillSlug union.
// ─────────────────────────────────────────────────────────────────────────────

export const SKILL_SLUGS = ['careerclaw', 'scrapeclaw'] as const
export type SkillSlug = (typeof SKILL_SLUGS)[number]
export type SkillFeatureKey = string

export interface VerifiedSkillExecutionContext {
  source: 'clawos'
  verified: true
  userId: string
  skill: SkillSlug
  tier: 'free' | 'pro'
  features: SkillFeatureKey[]
  requestId: string
  issuedAt: number
  expiresAt: number
}

export interface WorkerSkillRunRequest<TInput> {
  assertion: string
  input: TInput
}

export interface WorkerSkillRunResult<TResult> {
  result: TResult
  durationMs: number
}
