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
  /**
   * Search radius in **miles** as entered by the user (US-facing UI).
   * The worker adapter converts to km before populating
   * `UserProfile.location_radius_km` in the careerclaw-js engine.
   * Only applied when `workMode` is `'onsite'` or `'hybrid'`.
   */
  locationRadiusMi?: number | null
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

/**
 * Worker input for post-briefing gap analysis.
 * The API serializes cached ScoredJob + ResumeIntelligence from the briefing cache.
 * The worker adapter casts these to careerclaw-js types internally.
 */
export interface CareerClawGapAnalysisWorkerInput {
  /** Serialized ScoredJob from careerclaw-js */
  match: Record<string, unknown>
  /** Serialized ResumeIntelligence from careerclaw-js */
  resumeIntel: Record<string, unknown>
}

/**
 * Worker input for post-briefing cover letter generation.
 * The API serializes cached match data + profile + resume intel.
 * Accepts optional precomputed gap to avoid redundant analysis.
 */
export interface CareerClawCoverLetterWorkerInput {
  /** Serialized ScoredJob from careerclaw-js */
  match: Record<string, unknown>
  /** User profile for the cover letter prompt */
  profile: CareerClawWorkerProfile
  /** Serialized ResumeIntelligence from careerclaw-js */
  resumeIntel: Record<string, unknown>
  /** Optional: resume text for fallback intelligence resolution */
  resumeText?: string
  /** Optional: pre-computed GapAnalysisResult to avoid redundant analysis */
  precomputedGap?: Record<string, unknown>
}
