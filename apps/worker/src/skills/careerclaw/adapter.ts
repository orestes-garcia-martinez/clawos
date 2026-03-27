import {
  CAREERCLAW_FEATURES,
  createClawOsExecutionContext,
  runCareerClawWithContext,
  type BriefingResult,
  type ClawOsExecutionContext,
  type UserProfile,
} from 'careerclaw-js'
import type {
  CareerClawWorkerInput,
  CareerClawWorkerProfile,
  VerifiedSkillExecutionContext,
} from '@clawos/shared'
import { CareerClawWorkerInputSchema } from '@clawos/security'

const PRO_TOPK_FEATURE = CAREERCLAW_FEATURES.TOPK_EXTENDED

export function clampTopK(ctx: VerifiedSkillExecutionContext, topK: number): number {
  const maxTopK = ctx.features.includes(PRO_TOPK_FEATURE) ? 10 : 3
  return Math.min(topK, maxTopK)
}

export function buildCareerClawProfile(input: CareerClawWorkerProfile): UserProfile {
  return {
    skills: input.skills ?? [],
    target_roles: input.targetRoles ?? [],
    experience_years: input.experienceYears ?? null,
    work_mode: input.workMode ?? null,
    resume_summary: input.resumeSummary ?? null,
    location: input.locationPref ?? null,
    salary_min: input.salaryMin ?? null,
  }
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

    return result as unknown as Record<string, unknown>
  },
}
