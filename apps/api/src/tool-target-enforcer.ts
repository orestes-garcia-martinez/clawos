import type { SessionState } from '@clawos/shared'
import { resolveReferencedMatches } from './briefing-grounding.js'

export type EnforceableToolName = 'run_gap_analysis' | 'run_cover_letter' | 'track_application'

export type ToolTargetResolution =
  | { kind: 'proceed'; jobId: string }
  | { kind: 'clarify'; message: string }

type EnforcementReason = 'valid_input' | 'resolved_from_message' | 'ambiguous' | 'no_match'

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

  if (toolName === 'track_application') {
    return `I can track one role at a time. Which role do you want first: ${joined}?`
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

  let resolution: ToolTargetResolution
  let reason: EnforcementReason

  if (briefingMatches.length === 0) {
    resolution = { kind: 'clarify', message: NO_MATCH_MESSAGE }
    reason = 'no_match'
  } else {
    // Check message ambiguity before accepting a valid job_id. A message that
    // references multiple briefing matches must clarify even when Claude supplies
    // a technically valid job_id — otherwise one match silently proceeds while
    // the rest of the user's request is dropped.
    const references = resolveReferencedMatches(message, state)

    if (references.length > 1) {
      resolution = { kind: 'clarify', message: buildAmbiguousMessage(references, toolName) }
      reason = 'ambiguous'
    } else {
      const requestedJobId = isNonEmptyString(toolInput.job_id) ? toolInput.job_id.trim() : null

      if (requestedJobId && currentBriefingHasJobId(state, requestedJobId)) {
        resolution = { kind: 'proceed', jobId: requestedJobId }
        reason = 'valid_input'
      } else if (references.length === 1) {
        resolution = { kind: 'proceed', jobId: references[0]!.job_id }
        reason = 'resolved_from_message'
      } else {
        resolution = { kind: 'clarify', message: NO_MATCH_MESSAGE }
        reason = 'no_match'
      }
    }
  }

  console.log(
    JSON.stringify({
      event: 'tool_target_enforced',
      toolName,
      enforcementKind: resolution.kind,
      resolvedJobId: resolution.kind === 'proceed' ? resolution.jobId : null,
      reason,
    }),
  )

  return resolution
}
