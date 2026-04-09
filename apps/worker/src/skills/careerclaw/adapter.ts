import {
  CAREERCLAW_FEATURES,
  createClawOsExecutionContext,
  runCareerClawWithContext,
  generateGapAnalysisForMatch,
  generateCoverLetterForMatch,
  type BriefingResult,
  type ClawOsExecutionContext,
  type UserProfile,
  type ScoredJob,
  type ResumeIntelligence,
  type GapAnalysisResult,
  type GapAnalysisReport,
  type CoverLetter,
} from 'careerclaw-js'
import type {
  CareerClawWorkerInput,
  CareerClawWorkerProfile,
  CareerClawGapAnalysisWorkerInput,
  CareerClawCoverLetterWorkerInput,
  VerifiedSkillExecutionContext,
} from '@clawos/shared'
import {
  CareerClawWorkerInputSchema,
  CareerClawGapAnalysisInputSchema,
  CareerClawCoverLetterInputSchema,
} from '@clawos/security'

const PRO_TOPK_FEATURE = CAREERCLAW_FEATURES.TOPK_EXTENDED

export function clampTopK(ctx: VerifiedSkillExecutionContext, topK: number): number {
  const maxTopK = ctx.features.includes(PRO_TOPK_FEATURE) ? 10 : 3
  return Math.min(topK, maxTopK)
}

export function buildCareerClawProfile(input: CareerClawWorkerProfile): UserProfile {
  // location_radius_km is added in careerclaw-js 1.10.0 (PR#71).
  // Cast via unknown until that release is consumed.
  return {
    skills: input.skills ?? [],
    target_roles: input.targetRoles ?? [],
    experience_years: input.experienceYears ?? null,
    work_mode: input.workMode ?? null,
    resume_summary: input.resumeSummary ?? null,
    location: input.locationPref ?? null,
    location_radius_km:
      input.locationRadiusMi != null ? Math.round(input.locationRadiusMi * 1.60934) : null,
    salary_min: input.salaryMin ?? null,
    target_industry: input.targetIndustry ?? null,
  } as UserProfile
}

export function buildCareerClawExecutionContext(
  ctx: VerifiedSkillExecutionContext,
): ClawOsExecutionContext {
  return createClawOsExecutionContext({
    tier: ctx.tier,
    features: ctx.features,
  })
}

export const careerClawAdapter = {
  slug: 'careerclaw' as const,
  validateInput(input: unknown): CareerClawWorkerInput {
    return CareerClawWorkerInputSchema.parse(input)
  },
  async execute(
    input: CareerClawWorkerInput,
    ctx: VerifiedSkillExecutionContext,
  ): Promise<Record<string, unknown>> {
    const result: BriefingResult = await runCareerClawWithContext(
      {
        profile: buildCareerClawProfile(input.profile),
        ...(input.resumeText !== undefined ? { resumeText: input.resumeText } : {}),
        topK: clampTopK(ctx, input.topK),
        dryRun: true,
      },
      buildCareerClawExecutionContext(ctx),
    )

    // Intentional: BriefingResult is typed by careerclaw-js; we erase to Record
    // at the API boundary so the worker stays decoupled from the engine's types.
    return result as unknown as Record<string, unknown>
  },
}

// ── Post-briefing actions ────────────────────────────────────────────────────

export const careerClawGapAnalysisAdapter = {
  validateInput(input: unknown): CareerClawGapAnalysisWorkerInput {
    return CareerClawGapAnalysisInputSchema.parse(input)
  },
  async execute(
    input: CareerClawGapAnalysisWorkerInput,
    ctx: VerifiedSkillExecutionContext,
  ): Promise<Record<string, unknown>> {
    // Intentional: match/resumeIntel arrive as Record<string,unknown> from the wire;
    // Zod validated the shape above so casting to careerclaw-js types is safe here.
    const match = input.match as unknown as ScoredJob
    const resumeIntel = input.resumeIntel as unknown as ResumeIntelligence
    const report: GapAnalysisReport = await generateGapAnalysisForMatch(match, resumeIntel, {
      executionContext: buildCareerClawExecutionContext(ctx),
    })
    // Intentional: GapAnalysisReport erased to Record so the route handler stays
    // type-agnostic; the API reads .analysis via a structural access, not this type.
    return report as unknown as Record<string, unknown>
  },
}

export const careerClawCoverLetterAdapter = {
  validateInput(input: unknown): CareerClawCoverLetterWorkerInput {
    return CareerClawCoverLetterInputSchema.parse(input)
  },
  async execute(
    input: CareerClawCoverLetterWorkerInput,
    ctx: VerifiedSkillExecutionContext,
  ): Promise<Record<string, unknown>> {
    // Intentional: match/resumeIntel arrive as Record<string,unknown> from the wire;
    // Zod validated the shape above so casting to careerclaw-js types is safe here.
    const match = input.match as unknown as ScoredJob
    const profile = buildCareerClawProfile(input.profile)
    const resumeIntel = input.resumeIntel as unknown as ResumeIntelligence
    // Intentional: precomputedGap is passed through opaquely; careerclaw-js accepts
    // GapAnalysisResult | undefined and the Zod schema already validated the payload.
    const precomputedGap = input.precomputedGap as GapAnalysisResult | undefined

    const coverLetter: CoverLetter = await generateCoverLetterForMatch(
      match,
      profile,
      resumeIntel,
      {
        precomputedGap,
        executionContext: buildCareerClawExecutionContext(ctx),
      },
    )

    // Intentional: CoverLetter erased to Record so the route handler stays type-agnostic.
    return coverLetter as unknown as Record<string, unknown>
  },
}
