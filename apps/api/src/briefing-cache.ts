/**
 * briefing-cache.ts — In-memory cache for post-briefing advisory tools.
 *
 * After a successful briefing, the API caches the matches, resumeIntel,
 * and profile so that post-briefing tools (gap analysis, cover letter)
 * can look up match data by job_id without re-running the full briefing.
 *
 * Design:
 *   - Key: userId (one active briefing per user)
 *   - TTL: 30 minutes
 *   - Gap results are cached per job_id within the briefing entry
 *   - Cover letter generation reuses cached gap results (single source of truth)
 *   - Cache miss → LLM tells user to run a fresh briefing
 *
 * This is an MVP in-memory cache. It is lost on process restart.
 * Upgrade path: move to Redis or Supabase JSONB if persistence is needed.
 */

import type { CareerClawWorkerProfile } from '@clawos/shared'

const CACHE_TTL_MS = 30 * 60 * 1_000 // 30 minutes

export interface CachedMatch {
  job: Record<string, unknown>
  score: number
  breakdown: Record<string, number>
  matched_keywords: string[]
  gap_keywords: string[]
}

export interface CachedBriefing {
  matches: CachedMatch[]
  resumeIntel: Record<string, unknown>
  profile: CareerClawWorkerProfile
  resumeText: string | null
  /** Cached gap analysis results, keyed by job_id. Populated as gaps are run. */
  gapResults: Map<string, Record<string, unknown>>
  cachedAt: number
}

const cache = new Map<string, CachedBriefing>()

/**
 * Cache a briefing result for a user. Replaces any existing entry.
 */
export function cacheBriefingResult(
  userId: string,
  data: Omit<CachedBriefing, 'gapResults' | 'cachedAt'>,
): void {
  cache.set(userId, {
    ...data,
    gapResults: new Map(),
    cachedAt: Date.now(),
  })
}

/**
 * Retrieve a cached briefing for a user. Returns null if expired or absent.
 */
export function getCachedBriefing(userId: string): CachedBriefing | null {
  const entry = cache.get(userId)
  if (!entry) return null

  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cache.delete(userId)
    return null
  }

  return entry
}

/**
 * Look up a specific match by job_id within a cached briefing.
 */
export function getCachedMatch(
  userId: string,
  jobId: string,
): { briefing: CachedBriefing; match: CachedMatch } | null {
  const briefing = getCachedBriefing(userId)
  if (!briefing) return null

  const match = briefing.matches.find((m) => (m.job as { job_id?: string }).job_id === jobId)
  if (!match) return null

  return { briefing, match }
}

/**
 * Store a gap analysis result in the briefing cache for reuse by cover letters.
 */
export function cacheGapResult(
  userId: string,
  jobId: string,
  gapResult: Record<string, unknown>,
): void {
  const briefing = getCachedBriefing(userId)
  if (!briefing) return

  briefing.gapResults.set(jobId, gapResult)
}

/**
 * Retrieve a cached gap result for a specific job_id.
 */
export function getCachedGapResult(userId: string, jobId: string): Record<string, unknown> | null {
  const briefing = getCachedBriefing(userId)
  if (!briefing) return null

  return briefing.gapResults.get(jobId) ?? null
}
