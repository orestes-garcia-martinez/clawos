import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cacheBriefingResult,
  cacheGapResult,
  getCachedBriefing,
  getCachedGapResult,
  getCachedMatch,
} from './briefing-cache.js'
import type { CachedMatch } from './briefing-cache.js'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const OTHER_USER_ID = '00000000-0000-0000-0000-000000000002'
const JOB_ID = 'job-abc-123'
const JOB_ID_2 = 'job-xyz-456'

const makeMatch = (jobId: string): CachedMatch => ({
  job: { job_id: jobId, title: 'Senior Engineer', company: 'Acme' },
  score: 0.85,
  breakdown: { skills: 0.9, experience: 0.8 },
  matched_keywords: ['TypeScript', 'React'],
  gap_keywords: ['Go'],
})

const BASE_BRIEFING = {
  matches: [makeMatch(JOB_ID)],
  resumeIntel: { extracted_keywords: ['TypeScript'], source: 'skills_injected' },
  profile: { skills: ['TypeScript'], targetRoles: ['Senior Engineer'] },
  resumeText: null,
}

describe('cacheBriefingResult / getCachedBriefing', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('stores and retrieves a briefing', () => {
    cacheBriefingResult(USER_ID, BASE_BRIEFING)
    const result = getCachedBriefing(USER_ID)
    expect(result).not.toBeNull()
    expect(result!.matches).toHaveLength(1)
    expect(result!.matches[0]!.score).toBe(0.85)
  })

  it('initialises gapResults as an empty Map', () => {
    cacheBriefingResult(USER_ID, BASE_BRIEFING)
    const result = getCachedBriefing(USER_ID)
    expect(result!.gapResults).toBeInstanceOf(Map)
    expect(result!.gapResults.size).toBe(0)
  })

  it('returns null for an unknown user', () => {
    expect(getCachedBriefing(OTHER_USER_ID)).toBeNull()
  })

  it('replaces existing entry on re-cache', () => {
    cacheBriefingResult(USER_ID, BASE_BRIEFING)
    cacheBriefingResult(USER_ID, {
      ...BASE_BRIEFING,
      matches: [makeMatch(JOB_ID), makeMatch(JOB_ID_2)],
    })
    const result = getCachedBriefing(USER_ID)
    expect(result!.matches).toHaveLength(2)
  })

  it('returns null after TTL expires', () => {
    vi.useFakeTimers()
    cacheBriefingResult(USER_ID, BASE_BRIEFING)

    // Advance 31 minutes past the 30-minute TTL
    vi.advanceTimersByTime(31 * 60 * 1_000)

    expect(getCachedBriefing(USER_ID)).toBeNull()
  })

  it('returns entry before TTL expires', () => {
    vi.useFakeTimers()
    cacheBriefingResult(USER_ID, BASE_BRIEFING)

    vi.advanceTimersByTime(29 * 60 * 1_000)

    expect(getCachedBriefing(USER_ID)).not.toBeNull()
  })

  it('evicts expired entry from cache on access', () => {
    vi.useFakeTimers()
    cacheBriefingResult(USER_ID, BASE_BRIEFING)
    vi.advanceTimersByTime(31 * 60 * 1_000)

    getCachedBriefing(USER_ID) // triggers eviction
    vi.useRealTimers()

    // After eviction, a new cache without fake timers should also return null
    expect(getCachedBriefing(USER_ID)).toBeNull()
  })
})

describe('getCachedMatch', () => {
  beforeEach(() => {
    cacheBriefingResult(USER_ID, {
      ...BASE_BRIEFING,
      matches: [makeMatch(JOB_ID), makeMatch(JOB_ID_2)],
    })
  })

  it('returns match and briefing for a known job_id', () => {
    const result = getCachedMatch(USER_ID, JOB_ID)
    expect(result).not.toBeNull()
    expect(result!.match.score).toBe(0.85)
    expect((result!.match.job as { job_id: string }).job_id).toBe(JOB_ID)
  })

  it('returns null for an unknown job_id', () => {
    expect(getCachedMatch(USER_ID, 'nonexistent-job')).toBeNull()
  })

  it('returns null for an unknown user', () => {
    expect(getCachedMatch(OTHER_USER_ID, JOB_ID)).toBeNull()
  })

  it('exposes the briefing alongside the match', () => {
    const result = getCachedMatch(USER_ID, JOB_ID_2)
    expect(result!.briefing.matches).toHaveLength(2)
  })
})

describe('cacheGapResult / getCachedGapResult', () => {
  beforeEach(() => {
    cacheBriefingResult(USER_ID, BASE_BRIEFING)
  })

  it('stores and retrieves a gap result', () => {
    const gap = { fit_score: 0.72, signals: ['TypeScript'], gaps: ['Go'] }
    cacheGapResult(USER_ID, JOB_ID, gap)
    expect(getCachedGapResult(USER_ID, JOB_ID)).toEqual(gap)
  })

  it('returns null when no gap result has been cached', () => {
    expect(getCachedGapResult(USER_ID, JOB_ID)).toBeNull()
  })

  it('returns null for an unknown user', () => {
    cacheGapResult(USER_ID, JOB_ID, { fit_score: 0.5 })
    expect(getCachedGapResult(OTHER_USER_ID, JOB_ID)).toBeNull()
  })

  it('returns null for a different job_id', () => {
    cacheGapResult(USER_ID, JOB_ID, { fit_score: 0.5 })
    expect(getCachedGapResult(USER_ID, JOB_ID_2)).toBeNull()
  })

  it('is a no-op when briefing has expired', () => {
    vi.useFakeTimers()
    vi.advanceTimersByTime(31 * 60 * 1_000)
    cacheGapResult(USER_ID, JOB_ID, { fit_score: 0.5 }) // briefing expired — should not throw
    vi.useRealTimers()
    expect(getCachedGapResult(USER_ID, JOB_ID)).toBeNull()
  })

  it('overwrites an existing gap result for the same job_id', () => {
    cacheGapResult(USER_ID, JOB_ID, { fit_score: 0.5 })
    cacheGapResult(USER_ID, JOB_ID, { fit_score: 0.9 })
    expect(getCachedGapResult(USER_ID, JOB_ID)).toEqual({ fit_score: 0.9 })
  })
})
