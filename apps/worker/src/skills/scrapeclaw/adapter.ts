import { runScrapeClawAgent1Research } from '@clawos/scrapeclaw-engine'
import type { ScrapeClawResearchWorkerInput, VerifiedSkillExecutionContext } from '@clawos/shared'
import { ScrapeClawResearchWorkerInputSchema } from '@clawos/security'

export const scrapeClawResearchAdapter = {
  slug: 'scrapeclaw' as const,

  validateInput(input: unknown): ScrapeClawResearchWorkerInput {
    return ScrapeClawResearchWorkerInputSchema.parse(input)
  },

  async execute(
    input: ScrapeClawResearchWorkerInput,
    _ctx: VerifiedSkillExecutionContext,
  ): Promise<Record<string, unknown>> {
    return (await runScrapeClawAgent1Research(input)) as unknown as Record<string, unknown>
  },
}
