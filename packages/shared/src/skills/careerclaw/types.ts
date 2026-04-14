// ─────────────────────────────────────────────────────────────────────────────
// CareerClaw skill types — worker input contracts for the CareerClaw skill.
//
// These types define the API ↔ worker boundary for CareerClaw:
//   - CareerClawWorkerProfile  — user profile shape sent to the worker
//   - SearchOverrides          — session-scoped search refinements from the agent
//   - CareerClawWorkerInput    — primary briefing input
//   - CareerClawGapAnalysisWorkerInput  — post-briefing gap analysis input
//   - CareerClawCoverLetterWorkerInput  — post-briefing cover letter input
//
// Business logic lives in careerclaw-js; these types govern the serialisation
// boundary between the API server and the Lightsail skill worker.
// ─────────────────────────────────────────────────────────────────────────────

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
  /**
   * Target industry or sector (e.g. "B2B SaaS", "fintech", "healthtech").
   * Included in SerpAPI queries to narrow results to the user's domain.
   * Supports future agent-driven overrides: "find me fintech jobs".
   */
  targetIndustry?: string | null
}

/**
 * Session-scoped search overrides — agent-driven query refinements that
 * augment the user's profile for a single briefing run without mutating it.
 *
 * Populated by the API when Claude detects a search qualifier in the user's
 * message (e.g. "find me AI jobs" → { targetIndustry: "artificial intelligence" }).
 *
 * Maps to careerclaw-js SearchOverrides (snake_case) in the worker adapter.
 */
export interface SearchOverrides {
  /** Override the profile's target industry for this run (e.g. "fintech", "artificial intelligence"). */
  targetIndustry?: string
  /** Restrict results to specific companies — wired in careerclaw-js Phase 2. */
  targetCompanies?: string[]
}

export interface CareerClawWorkerInput {
  profile: CareerClawWorkerProfile
  resumeText?: string
  topK: number
  /** Session-scoped search refinements extracted from the user's message by the agent. */
  searchOverrides?: SearchOverrides
}

/**
 * Worker input for post-briefing gap analysis.
 * The API serialises cached ScoredJob + ResumeIntelligence from the briefing cache.
 * The worker adapter casts these to careerclaw-js types internally.
 */
export interface CareerClawGapAnalysisWorkerInput {
  /** Serialised ScoredJob from careerclaw-js */
  match: Record<string, unknown>
  /** Serialised ResumeIntelligence from careerclaw-js */
  resumeIntel: Record<string, unknown>
}

/**
 * Worker input for post-briefing cover letter generation.
 * The API serialises cached match data + profile + resume intel.
 * Accepts optional precomputed gap to avoid redundant analysis.
 */
export interface CareerClawCoverLetterWorkerInput {
  /** Serialised ScoredJob from careerclaw-js */
  match: Record<string, unknown>
  /** User profile for the cover letter prompt */
  profile: CareerClawWorkerProfile
  /** Serialised ResumeIntelligence from careerclaw-js */
  resumeIntel: Record<string, unknown>
  /** Optional: resume text for fallback intelligence resolution */
  resumeText?: string
  /** Optional: pre-computed GapAnalysisResult to avoid redundant analysis */
  precomputedGap?: Record<string, unknown>
}
