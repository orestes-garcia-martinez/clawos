import type { CareerClawWorkerInput, VerifiedSkillExecutionContext } from '@clawos/shared'
import { CareerClawWorkerInputSchema } from '@clawos/security'
import { runCareerClawCliBridge } from './cli-bridge.js'

const PRO_TOPK_FEATURE = 'careerclaw.topk_extended'

function clampTopK(ctx: VerifiedSkillExecutionContext, topK: number): number {
  const maxTopK = ctx.features.includes(PRO_TOPK_FEATURE) ? 10 : 3
  return Math.min(topK, maxTopK)
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
    const bridged = await runCareerClawCliBridge({
      ...input,
      topK: clampTopK(ctx, input.topK),
    })
    return bridged.briefing
  },
}
