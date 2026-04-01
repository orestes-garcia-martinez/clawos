/**
 * cover-letter-enforcer.ts — Deterministic cover letter worker enforcement.
 *
 * Problem: When a user asks to "rewrite" or "personalize" a cover letter,
 * Claude sometimes generates the letter as a direct text response (skill:"none")
 * instead of calling run_cover_letter. This bypasses the careerclaw-js worker
 * pipeline, meaning the letter misses resume-specific data, gap analysis context,
 * and quality signals like is_template.
 *
 * Solution: In the 7a text-response path, check whether the user's message is
 * a cover letter rewrite request AND a previous cover letter exists in session
 * state. If both true, reject the text response and force the worker path.
 *
 * Design:
 *   - Detection is regex-based (deterministic, no LLM involved)
 *   - Only triggers on explicit rewrite/revision language
 *   - Does NOT trigger on first-time cover letter requests (those correctly
 *     go through the tool path via Claude's tool_use decision)
 *   - The response is formatted programmatically — no second LLM call —
 *     so the format LLM cannot bypass the worker again
 */

import type { SessionState } from '@clawos/shared'

// ── Detection ────────────────────────────────────────────────────────────────

/**
 * Patterns indicating the user wants to rewrite/revise a cover letter.
 * Must reference a cover letter AND indicate revision, not a first-time request.
 */
const COVER_LETTER_REWRITE_PATTERN =
  /\b(re[\s-]?write|re[\s-]?generate|revise|personali[sz]e|adjust|improve|better\s+version|more\s+personali[sz]ed|redo)\b.*\b(cover\s+letter|letter)\b|\b(cover\s+letter|letter)\b.*\b(re[\s-]?write|re[\s-]?generate|revise|personali[sz]e|adjust|improve|better\s+version|more\s+personali[sz]ed|redo)\b/i

/**
 * Check whether the user's message is a cover letter rewrite request.
 */
export function isCoverLetterRewriteRequest(message: string): boolean {
  return COVER_LETTER_REWRITE_PATTERN.test(message)
}

// ── Resolution ───────────────────────────────────────────────────────────────

export interface CoverLetterEnforcerResult {
  /** Whether the enforcer should fire (reject text response, force worker). */
  shouldEnforce: boolean
  /** The job_id to regenerate the cover letter for. */
  jobId: string | null
  /** The company name (for user-facing messages). */
  company: string | null
}

/**
 * Determine whether the text response should be rejected in favor of
 * a worker call. Returns the job_id to use for regeneration.
 *
 * Resolution order:
 *   1. If only one cover letter exists in session state → use that job_id
 *   2. If multiple exist, try to match the user's message to a company name
 *   3. If ambiguous → don't enforce (let the text response through; the user
 *      can be asked to clarify on their next turn)
 */
export function shouldForceWorkerCoverLetter(
  message: string,
  sessionState: SessionState,
): CoverLetterEnforcerResult {
  const NO_ENFORCE: CoverLetterEnforcerResult = {
    shouldEnforce: false,
    jobId: null,
    company: null,
  }

  // Gate 1: is this a rewrite request?
  if (!isCoverLetterRewriteRequest(message)) return NO_ENFORCE

  // Gate 2: does session state have any previous cover letter results?
  const coverLetterResults = sessionState.coverLetterResults
  if (!coverLetterResults) return NO_ENFORCE

  const jobIds = Object.keys(coverLetterResults)
  if (jobIds.length === 0) return NO_ENFORCE

  // Gate 3: can we resolve to a single job_id?
  if (jobIds.length === 1) {
    const jobId = jobIds[0]!
    const match = sessionState.briefing?.matches.find((m) => m.job_id === jobId)
    return {
      shouldEnforce: true,
      jobId,
      company: match?.company ?? null,
    }
  }

  // Multiple cover letters exist — try to match by company name in user message
  const messageLower = message.toLowerCase()
  const matches = sessionState.briefing?.matches ?? []

  for (const jobId of jobIds) {
    const match = matches.find((m) => m.job_id === jobId)
    if (match && messageLower.includes(match.company.toLowerCase())) {
      return {
        shouldEnforce: true,
        jobId,
        company: match.company,
      }
    }
  }

  // Ambiguous — don't enforce, let the text response through
  return NO_ENFORCE
}

// ── Formatting ───────────────────────────────────────────────────────────────

/**
 * Format a cover letter worker result into a user-facing response.
 *
 * Deterministic — no LLM call. Mirrors the format from the system prompt's
 * <tool_result_handling> → run_cover_letter result section. This ensures
 * the worker is always the source of truth for cover letter content.
 *
 * NOTE: First-time cover letters (7d path) use callLLMWithToolResult for
 * formatting, which produces slightly more natural prose. Rewrites enforced
 * by P1a use this deterministic formatter instead, so there is a minor style
 * difference between first-generation and re-generation responses. This is
 * intentional — the LLM format path is what caused the original bypass.
 * Tracked for future alignment once enforcement proves stable.
 */
export function formatCoverLetterResponse(
  coverLetterResult: Record<string, unknown>,
  company: string,
): string {
  const body = (coverLetterResult['body'] as string) ?? ''
  const isTemplate = (coverLetterResult['is_template'] as boolean) ?? false
  const keywordCoverage = coverLetterResult['keyword_coverage'] as
    | { top_signals?: string[]; top_gaps?: string[] }
    | undefined

  const lines: string[] = []

  lines.push(`Here's your tailored cover letter for ${company}:\n`)
  lines.push(body)

  if (isTemplate) {
    lines.push(
      '\n*This is a template version — a more personalized version may be available if you retry.*',
    )
  }

  if (keywordCoverage) {
    const signals = (keywordCoverage.top_signals ?? []).slice(0, 5)
    const gaps = (keywordCoverage.top_gaps ?? []).slice(0, 3)

    const parts: string[] = []
    if (signals.length > 0) {
      parts.push(signals.map((s) => `${s} ✓`).join(' | '))
    }
    if (gaps.length > 0) {
      parts.push(gaps.map((g) => `${g} — addressed`).join(' | '))
    }
    if (parts.length > 0) {
      lines.push(`\n**Keyword coverage:** ${parts.join(' | ')}`)
    }
  }

  lines.push('\nWant me to save this job to your tracker, or adjust the tone?')

  return lines.join('\n')
}
