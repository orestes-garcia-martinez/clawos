import type { SessionState } from '@clawos/shared'
import { resolveReferencedMatches } from './briefing-grounding.js'

export type EnforceableToolName = 'run_gap_analysis' | 'run_cover_letter'

export type ToolTargetResolution =
  | { kind: 'proceed'; jobId: string }
  | { kind: 'clarify'; message: string }

interface EnforceToolTargetArgs {
  toolName: EnforceableToolName
  message: string
  state: SessionState
  toolInput: {
    job_id?: unknown
  }
}

const NO_MATCH_MESSAGE =
  "I couldn't match that to your current briefing. Tell me the company name or match number."

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function currentBriefingHasJobId(state: SessionState, jobId: string): boolean {
  return Boolean(state.briefing?.matches.some((match) => match.job_id === jobId))
}

function buildChoiceLabel(
  reference: { title: string; company: string },
  allReferences: Array<{ title: string; company: string }>,
): string {
  const companySiblings = allReferences.filter((r) => r.company === reference.company)
  if (companySiblings.length > 1) {
    return `${reference.title} at ${reference.company}`
  }
  return reference.company.trim() || `${reference.title} role`
}

function buildAmbiguousMessage(
  references: Array<{ title: string; company: string }>,
  toolName: EnforceableToolName,
): string {
  const joined = references.map((ref) => buildChoiceLabel(ref, references)).join(' or ')

  if (toolName === 'run_cover_letter') {
    return `I can write one cover letter at a time. Which role do you want first: ${joined}?`
  }

  return `I can do one at a time. Which role do you want first: ${joined}?`
}

export function enforceSingleMatchToolTarget({
  toolName,
  message,
  state,
  toolInput,
}: EnforceToolTargetArgs): ToolTargetResolution {
  const briefingMatches = state.briefing?.matches ?? []
  if (briefingMatches.length === 0) {
    return {
      kind: 'clarify',
      message: NO_MATCH_MESSAGE,
    }
  }

  const requestedJobId = isNonEmptyString(toolInput.job_id) ? toolInput.job_id.trim() : null
  if (requestedJobId && currentBriefingHasJobId(state, requestedJobId)) {
    return {
      kind: 'proceed',
      jobId: requestedJobId,
    }
  }

  const references = resolveReferencedMatches(message, state)

  if (references.length === 1) {
    return {
      kind: 'proceed',
      jobId: references[0]!.job_id,
    }
  }

  if (references.length > 1) {
    return {
      kind: 'clarify',
      message: buildAmbiguousMessage(references, toolName),
    }
  }

  return {
    kind: 'clarify',
    message: NO_MATCH_MESSAGE,
  }
}
