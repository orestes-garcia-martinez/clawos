import { z } from 'zod'

export const WorkModeSchema = z.enum(['remote', 'hybrid', 'onsite'])

export const CareerClawProfileSchema = z.object({
  name: z.string().max(200).optional(),
  skills: z.array(z.string().max(100)).max(100).optional().default([]),
  targetRoles: z.array(z.string().max(200)).max(20).optional().default([]),
  experienceYears: z.number().int().min(0).max(60).nullable().optional(),
  resumeSummary: z.string().max(2_000).nullable().optional(),
  workMode: WorkModeSchema.optional(),
  salaryMin: z.number().int().positive().max(10_000_000).optional(),
  salaryMax: z.number().int().positive().max(10_000_000).optional(),
  locationPref: z.string().max(200).optional(),
  locationRadiusMi: z.number().int().min(1).max(100).nullable().optional(),
  targetIndustry: z.string().max(200).nullable().optional(),
})

export const CareerClawWorkerInputSchema = z
  .object({
    profile: CareerClawProfileSchema,
    resumeText: z.string().max(50_000, 'Resume text too long (max 50k chars)').optional(),
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

export const WorkerAssertionTokenSchema = z.string().min(32).max(8_000)

export const CareerClawRunRequestSchema = z.object({
  assertion: WorkerAssertionTokenSchema,
  input: CareerClawWorkerInputSchema,
})

// ── Post-briefing action schemas ─────────────────────────────────────────────

// NOTE: ScoredJobSchema and ResumeIntelSchema mirror careerclaw-js internal types.
// If careerclaw-js changes field shapes (additions, renames, type changes), update
// these schemas to match — validation will silently pass stale shapes otherwise.
// Cross-reference: careerclaw-js ScoredJob and ResumeIntelligence interfaces.

/** Serialized ScoredJob from careerclaw-js — validated structurally. */
const ScoredJobSchema = z.object({
  job: z.object({
    job_id: z.string(),
    title: z.string(),
    company: z.string(),
    location: z.string(),
    description: z.string(),
    url: z.string(),
    source: z.string(),
    salary_min: z.number().nullable(),
    salary_max: z.number().nullable(),
    work_mode: z.string().nullable(),
    experience_years: z.number().nullable(),
    posted_at: z.string().nullable(),
    fetched_at: z.string(),
  }),
  score: z.number(),
  breakdown: z.record(z.number()),
  matched_keywords: z.array(z.string()),
  gap_keywords: z.array(z.string()),
})

/** Serialized ResumeIntelligence from careerclaw-js — validated structurally. */
const ResumeIntelSchema = z.object({
  extracted_keywords: z.array(z.string()),
  extracted_phrases: z.array(z.string()),
  keyword_stream: z.array(z.string()),
  phrase_stream: z.array(z.string()),
  impact_signals: z.array(z.string()),
  keyword_weights: z.record(z.number()),
  phrase_weights: z.record(z.number()),
  source: z.string(),
})

/** Serialized GapAnalysisResult from careerclaw-js — validated structurally. */
const GapAnalysisResultSchema = z.object({
  fit_score: z.number(),
  fit_score_unweighted: z.number(),
  signals: z.object({
    keywords: z.array(z.string()),
    phrases: z.array(z.string()),
  }),
  gaps: z.object({
    keywords: z.array(z.string()),
    phrases: z.array(z.string()),
  }),
  summary: z.object({
    top_signals: z.object({
      keywords: z.array(z.string()),
      phrases: z.array(z.string()),
    }),
    top_gaps: z.object({
      keywords: z.array(z.string()),
      phrases: z.array(z.string()),
    }),
  }),
})

export const CareerClawGapAnalysisInputSchema = z.object({
  match: ScoredJobSchema,
  resumeIntel: ResumeIntelSchema,
})

export const CareerClawGapAnalysisRequestSchema = z.object({
  assertion: WorkerAssertionTokenSchema,
  input: CareerClawGapAnalysisInputSchema,
})

export const CareerClawCoverLetterInputSchema = z.object({
  match: ScoredJobSchema,
  profile: CareerClawProfileSchema,
  resumeIntel: ResumeIntelSchema,
  resumeText: z.string().max(50_000).optional(),
  precomputedGap: GapAnalysisResultSchema.optional(),
})

export const CareerClawCoverLetterRequestSchema = z.object({
  assertion: WorkerAssertionTokenSchema,
  input: CareerClawCoverLetterInputSchema,
})

export type CareerClawWorkerInputParsed = z.infer<typeof CareerClawWorkerInputSchema>
export type CareerClawRunRequestInput = z.infer<typeof CareerClawRunRequestSchema>
export type CareerClawGapAnalysisInputParsed = z.infer<typeof CareerClawGapAnalysisInputSchema>
export type CareerClawCoverLetterInputParsed = z.infer<typeof CareerClawCoverLetterInputSchema>
