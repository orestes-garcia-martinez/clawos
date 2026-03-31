import type { SessionState } from '@clawos/shared'
import { normalize, resolveReferencedMatches } from './briefing-grounding.js'

export type ResolvedIntentKind =
  | 'single_match_analysis'
  | 'single_match_cover_letter'
  | 'single_match_tracking'
  | 'comparison'
  | 'ambiguous_multi_match'
  | 'none'

export interface ResolvedIntentHint {
  kind: ResolvedIntentKind
  jobId?: string
  company?: string
  title?: string
  referencedJobIds: string[]
  reason: string
}

function hasAny(message: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(message))
}

function looksLikeComparison(message: string): boolean {
  return hasAny(message, [
    /\bcompare\b/,
    /\bcomparison\b/,
    /\bversus\b/,
    /\bvs\b/,
    /\bwhich one\b/,
    /\bwhich role\b/,
    /\bbetter\b/,
    /\bstronger\b/,
    /\bbest fit\b/,
  ])
}

function looksLikeGapAnalysis(message: string): boolean {
  return hasAny(message, [
    /\banalyze\b/,
    /\bgap analysis\b/,
    /\bwhat am i missing\b/,
    /\bwhy did .* score\b/,
    /\bwhy is .* lower\b/,
    /\bwhy is .* better\b/,
  ])
}

function looksLikeCoverLetter(message: string): boolean {
  return hasAny(message, [
    /\bcover letter\b/,
    /\bwrite .* cover letter\b/,
    /\bgenerate .* cover letter\b/,
    /\bdraft .* cover letter\b/,
  ])
}

function looksLikeTracking(message: string): boolean {
  return hasAny(message, [
    /\btrack\b/,
    /\badd to applications\b/,
    /\badd to tracker\b/,
    /\bmark as applied\b/,
  ])
}

export function resolveIntentHint(message: string, state: SessionState): ResolvedIntentHint {
  const normalized = normalize(message)
  const references = resolveReferencedMatches(message, state)

  if (references.length === 0) {
    return {
      kind: 'none',
      referencedJobIds: [],
      reason: 'No cached briefing match was confidently resolved from this turn.',
    }
  }

  if (looksLikeComparison(normalized)) {
    return {
      kind: 'comparison',
      referencedJobIds: references.map((r) => r.job_id),
      reason: 'The user appears to be comparing multiple cached briefing matches.',
    }
  }

  if (references.length > 1) {
    return {
      kind: 'ambiguous_multi_match',
      referencedJobIds: references.map((r) => r.job_id),
      reason: 'Multiple cached matches were referenced, but the requested action is single-match.',
    }
  }

  const match = references[0]

  if (looksLikeCoverLetter(normalized)) {
    return {
      kind: 'single_match_cover_letter',
      jobId: match!.job_id,
      company: match!.company,
      title: match!.title,
      referencedJobIds: [match!.job_id],
      reason: 'Single cached briefing match resolved for cover letter intent.',
    }
  }

  if (looksLikeTracking(normalized)) {
    return {
      kind: 'single_match_tracking',
      jobId: match!.job_id,
      company: match!.company,
      title: match!.title,
      referencedJobIds: [match!.job_id],
      reason: 'Single cached briefing match resolved for tracking intent.',
    }
  }

  if (looksLikeGapAnalysis(normalized)) {
    return {
      kind: 'single_match_analysis',
      jobId: match!.job_id,
      company: match!.company,
      title: match!.title,
      referencedJobIds: [match!.job_id],
      reason: 'Single cached briefing match resolved for analysis intent.',
    }
  }

  return {
    kind: 'none',
    referencedJobIds: references.map((r) => r.job_id),
    reason: 'Cached match reference was found, but no specific tool-oriented intent was inferred.',
  }
}

export function buildResolvedIntentMessage(message: string, state: SessionState): string | null {
  const hint = resolveIntentHint(message, state)
  if (hint.kind === 'none') return null

  const lines = [
    '[Server-side resolved intent hint]',
    `kind=${hint.kind}`,
    `reason=${hint.reason}`,
    `referenced_job_ids=${hint.referencedJobIds.length > 0 ? hint.referencedJobIds.join(', ') : 'none'}`,
  ]

  if (hint.jobId) lines.push(`resolved_job_id=${hint.jobId}`)
  if (hint.company) lines.push(`resolved_company=${hint.company}`)
  if (hint.title) lines.push(`resolved_title=${hint.title}`)

  lines.push('Use this hint to reduce ambiguity, but do not invent tool results.')

  if (hint.kind === 'comparison') {
    lines.push(
      'For comparison requests, answer from cached briefing data first before suggesting any deeper single-match tool call.',
    )
  }

  if (hint.kind === 'ambiguous_multi_match') {
    lines.push(
      'The user referenced multiple matches for a single-match action. Ask which one they want first.',
    )
  }

  if (
    hint.kind === 'single_match_analysis' ||
    hint.kind === 'single_match_cover_letter' ||
    hint.kind === 'single_match_tracking'
  ) {
    lines.push('If you call a single-match tool, prefer the resolved_job_id above.')
  }

  return lines.join('\n')
}
