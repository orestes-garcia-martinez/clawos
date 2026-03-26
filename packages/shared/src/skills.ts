/**
 * skills.ts — shared platform skill contracts.
 *
 * These types define the ClawOS-side contract between:
 *   - Agent API
 *   - worker
 *   - first-party skill adapters
 *
 * They are intentionally generic enough to scale to future skills while
 * still exporting the concrete CareerClaw worker input contract used today.
 */

export type SkillSlug = 'careerclaw'
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

export interface CareerClawWorkerProfile {
  name?: string
  workMode?: 'remote' | 'hybrid' | 'onsite'
  salaryMin?: number
  salaryMax?: number
  locationPref?: string
  skills?: string[]
  targetRoles?: string[]
  experienceYears?: number | null
  resumeSummary?: string | null
}

export interface CareerClawWorkerInput {
  profile: CareerClawWorkerProfile
  resumeText?: string
  topK: number
}
