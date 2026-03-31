import type { SkillSlug, VerifiedSkillExecutionContext } from '@clawos/shared'
import { careerClawAdapter } from './skills/careerclaw/adapter.js'

export interface SkillAdapter<TInput = unknown, TResult = unknown> {
  slug: SkillSlug
  validateInput: (input: unknown) => TInput
  execute: (input: TInput, ctx: VerifiedSkillExecutionContext) => Promise<TResult>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const skillRegistry: Record<SkillSlug, SkillAdapter<any, any>> = {
  careerclaw: careerClawAdapter,
}
