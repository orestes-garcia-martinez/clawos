import { z } from 'zod'
import { SCRAPECLAW_WEDGE_SLUGS } from '@clawos/shared'

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

const SearchOverridesSchema = z.object({
  targetIndustry: z.string().max(200).optional(),
  targetCompanies: z.array(z.string().max(200)).max(10).optional(),
})

export const CareerClawWorkerInputSchema = z
  .object({
    profile: CareerClawProfileSchema,
    resumeText: z.string().max(50_000, 'Resume text too long (max 50k chars)').optional(),
    topK: z.number().int().min(1).max(10).default(3),
    searchOverrides: SearchOverridesSchema.optional(),
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

// NOTE: ScoredJobSchema, ResumeIntelSchema, and GapAnalysisResultSchema mirror careerclaw-js
// internal types. If careerclaw-js changes field shapes (additions, renames, type changes),
// update these schemas to match — validation will silently pass stale shapes otherwise.
// Cross-reference: careerclaw-js ScoredJob, ResumeIntelligence, and GapAnalysisResult interfaces.

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

const httpsUrl = z
  .string()
  .url()
  .max(2_000)
  .refine((url) => url.startsWith('https://'), { message: 'URL must use HTTPS' })

const ScrapeClawWedgeSlugSchema = z.enum(SCRAPECLAW_WEDGE_SLUGS)

const ScrapeClawCandidateBusinessSchema = z.object({
  name: z.string().min(1).max(300),
  canonicalWebsiteUrl: httpsUrl,
  sourceUrl: httpsUrl.nullable().optional(),
  businessType: z.string().max(120).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  state: z.string().max(120).nullable().optional(),
  serviceAreaText: z.string().max(500).nullable().optional(),
  nicheSlug: ScrapeClawWedgeSlugSchema.nullable().optional(),
})

export const ScrapeClawResearchWorkerInputSchema = z
  .object({
    mode: z.literal('research').optional(),
    wedgeSlug: ScrapeClawWedgeSlugSchema,
    marketCity: z.string().min(1).max(120),
    marketRegion: z.string().min(1).max(120),
    candidates: z.array(ScrapeClawCandidateBusinessSchema).min(1).max(50),
    maxCandidates: z.number().int().min(1).max(50).optional(),
    maxPagesPerBusiness: z.number().int().min(1).max(6).optional(),
    fetchTimeoutMs: z.number().int().min(1_000).max(20_000).optional(),
    userAgent: z.string().max(300).nullable().optional(),
  })
  .transform((input) => ({ ...input, mode: 'research' as const }))

const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(JsonValueSchema),
  ]),
)

const ScrapeClawEvidenceDraftSchema = z.object({
  pageKind: z.enum(['homepage', 'about', 'services', 'contact', 'niche_relevant', 'other']),
  sourceUrl: httpsUrl,
  observedAt: z.string().datetime(),
  title: z.string().max(300).nullable(),
  snippet: z.string().max(4_000).nullable(),
  extractedFacts: JsonValueSchema,
  sourceConfidence: z.enum(['low', 'medium', 'high']).nullable(),
})

const ScrapeClawProspectDraftSchema = z.object({
  status: z.enum(['qualified', 'disqualified']),
  wedgeSlug: ScrapeClawWedgeSlugSchema,
  marketCity: z.string().min(1).max(120),
  marketRegion: z.string().min(1).max(120),
  fitScore: z.number().min(0).max(1),
  useCaseHypothesis: z.string().min(1).max(2_000),
  dataNeedHypothesis: z.string().min(1).max(2_000),
  demoTypeRecommendation: z.string().min(1).max(120),
  outreachAngle: z.string().min(1).max(1_000),
  confidenceLevel: z.enum(['low', 'medium', 'high']),
})

const ScrapeClawResearchProspectResultSchema = z.object({
  business: ScrapeClawCandidateBusinessSchema,
  prospect: ScrapeClawProspectDraftSchema,
  evidenceItems: z.array(ScrapeClawEvidenceDraftSchema).min(1).max(6),
  reasoning: z.array(z.string().min(1).max(500)).max(10),
})

export const ScrapeClawDiscoveryWorkerInputSchema = z.object({
  mode: z.literal('discover'),
  wedgeSlug: ScrapeClawWedgeSlugSchema,
  marketRegion: z.literal('Clay County'),
  hubNames: z.array(z.string().min(1).max(120)).min(1).max(10).optional(),
  minPrimaryResultsBeforeFallback: z.number().int().min(1).max(20).optional(),
  textSearchPageSize: z.number().int().min(1).max(20).optional(),
})

export const ScrapeClawEnrichmentWorkerInputSchema = z.object({
  mode: z.literal('enrich'),
  wedgeSlug: ScrapeClawWedgeSlugSchema,
  marketCity: z.string().min(1).max(120),
  marketRegion: z.string().min(1).max(120),
  prospects: z.array(ScrapeClawResearchProspectResultSchema).min(1).max(25),
  maxProspects: z.number().int().min(1).max(25).optional(),
  model: z.string().min(1).max(200).nullable().optional(),
})

export const ScrapeClawWorkerInputSchema = z.union([
  ScrapeClawResearchWorkerInputSchema,
  ScrapeClawDiscoveryWorkerInputSchema,
  ScrapeClawEnrichmentWorkerInputSchema,
])

export const ScrapeClawRunRequestSchema = z.object({
  assertion: WorkerAssertionTokenSchema,
  input: ScrapeClawWorkerInputSchema,
})

export const ScrapeClawResearchRunRequestSchema = z.object({
  assertion: WorkerAssertionTokenSchema,
  input: ScrapeClawResearchWorkerInputSchema,
})

export const ScrapeClawDiscoveryRunRequestSchema = z.object({
  assertion: WorkerAssertionTokenSchema,
  input: ScrapeClawDiscoveryWorkerInputSchema,
})

export const ScrapeClawEnrichmentRunRequestSchema = z.object({
  assertion: WorkerAssertionTokenSchema,
  input: ScrapeClawEnrichmentWorkerInputSchema,
})

export type ScrapeClawResearchWorkerInputParsed = z.infer<
  typeof ScrapeClawResearchWorkerInputSchema
>
export type ScrapeClawResearchRunRequestInput = z.infer<typeof ScrapeClawResearchRunRequestSchema>
export type ScrapeClawDiscoveryWorkerInputParsed = z.infer<
  typeof ScrapeClawDiscoveryWorkerInputSchema
>
export type ScrapeClawDiscoveryRunRequestInput = z.infer<typeof ScrapeClawDiscoveryRunRequestSchema>
export type ScrapeClawEnrichmentWorkerInputParsed = z.infer<
  typeof ScrapeClawEnrichmentWorkerInputSchema
>
export type ScrapeClawEnrichmentRunRequestInput = z.infer<
  typeof ScrapeClawEnrichmentRunRequestSchema
>
export type ScrapeClawWorkerInputParsed = z.infer<typeof ScrapeClawWorkerInputSchema>
export type ScrapeClawRunRequestInput = z.infer<typeof ScrapeClawRunRequestSchema>
