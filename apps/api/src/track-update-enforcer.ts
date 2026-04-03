/**
 * track-update-enforcer.ts — Deterministic tracker update enforcement (P1b).
 *
 * Problem: When a user says "I applied to that job" or "Update it to applied",
 * Claude sometimes produces a conversational acknowledgement (text response)
 * instead of calling track_application with action: update_status. The P0
 * hallucination detector then strips the false tracker_update claim, and the
 * action is silently lost.
 *
 * Solution: After P0 sanitisation in the 7a text path, check whether P0 found
 * a tracker_update false claim. If it did — meaning Claude intended to update
 * the tracker but expressed it in prose — force a second LLM call with
 * tool_choice: 'any' and only track_application available. Claude must then
 * call the tool, and the handler executes the Supabase update directly.
 *
 * This approach is robust to vocabulary variation because the trigger is
 * Claude's output behaviour (claiming an update happened), not the user's
 * phrasing. Claude is trained to reflect completed actions in its responses,
 * so any status-update intent will leave a trace in the false-claim signal.
 *
 * Design:
 *   - Detection uses P0's false-claim signal (no additional regex)
 *   - Resolution uses session state (top briefing match as default target)
 *   - The second LLM call is forced with tool_choice 'any' — Claude must call
 *     track_application; it fills status and job_id from conversation context
 *   - Supabase update mirrors the 7e path (primary job_id, fallback ilike)
 */

import type { SessionState } from '@clawos/shared'

// ── Resolution ───────────────────────────────────────────────────────────────

export interface TrackUpdateEnforcerResult {
  /** Whether the P1b enforcer should fire. */
  shouldEnforce: boolean
  /** The job_id to update (top briefing match, or null if no briefing). */
  jobId: string | null
  /** The company name (for Supabase fallback ilike query). */
  company: string | null
}

/**
 * Determine whether the text response should trigger a forced tracker update.
 *
 * Gates:
 *   1. P0 detected a tracker_update false claim in Claude's text response
 *   2. Session state has at least one briefing match to resolve the target job
 *
 * If both gates pass, the enforcer fires and returns the top match's job_id
 * and company so the caller can execute the Supabase update.
 */
export function shouldForceTrackUpdate(
  falseClaims: string[],
  sessionState: SessionState,
): TrackUpdateEnforcerResult {
  const NO_ENFORCE: TrackUpdateEnforcerResult = { shouldEnforce: false, jobId: null, company: null }

  // Gate 1: did P0 detect a tracker_update false claim?
  if (!falseClaims.includes('tracker_update')) return NO_ENFORCE

  // Gate 2: does session state have briefing matches to resolve the target?
  const matches = sessionState.briefing?.matches
  if (!matches || matches.length === 0) return NO_ENFORCE

  const topMatch = matches[0]!
  return {
    shouldEnforce: true,
    jobId: topMatch.job_id,
    company: topMatch.company,
  }
}
