/**
 * session.test.ts — Unit tests for session state management.
 *
 * Tests cover:
 *   - pruneMessages (existing behavior preserved)
 *   - mergeSessionState (briefing replace, gapResults merge)
 *   - getMatchFromState (job_id lookup)
 *   - getGapResultFromState (gap result lookup)
 *   - loadSession state parsing
 *   - saveSession state write-through
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Message, SessionState } from '@clawos/shared'

// ── Mock Supabase ────────────────────────────────────────────────────────────

const _mockSelect = vi.fn()
const _mockUpdate = vi.fn()
const _mockUpsert = vi.fn()
const mockFrom = vi.fn()

vi.mock('@clawos/shared', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actual = (await importOriginal()) as any
  return {
    ...actual,
    createServerClient: () => ({
      from: mockFrom,
    }),
  }
})

import {
  pruneMessages,
  mergeSessionState,
  getMatchFromState,
  getGapResultFromState,
  loadSession,
  saveSession,
} from '../session.js'
import { buildActiveBriefingGroundingMessage } from '../briefing-grounding.js'

// ── Test data ────────────────────────────────────────────────────────────────

const USER_ID = '00000000-0000-0000-0000-000000000001'
const SESSION_ID = '00000000-0000-0000-0000-000000000099'
const JOB_ID_1 = 'abc123def456'
const JOB_ID_2 = 'xyz789ghi012'

function makeMessage(content: string, role: 'user' | 'assistant' = 'user'): Message {
  return { role, content, timestamp: new Date().toISOString() }
}

const BRIEFING_STATE: SessionState = {
  briefing: {
    cachedAt: new Date().toISOString(),
    matches: [
      {
        job_id: JOB_ID_1,
        title: 'Senior Engineer',
        company: 'Acme Corp',
        score: 0.92,
        url: 'https://acme.com/jobs/1',
      },
      { job_id: JOB_ID_2, title: 'Staff Engineer', company: 'Beta Inc', score: 0.85, url: null },
    ],
    matchData: [
      {
        job: { job_id: JOB_ID_1, title: 'Senior Engineer', company: 'Acme Corp' },
        score: 0.92,
        matched_keywords: ['TypeScript'],
      },
      {
        job: { job_id: JOB_ID_2, title: 'Staff Engineer', company: 'Beta Inc' },
        score: 0.85,
        matched_keywords: ['React'],
      },
    ],
    resumeIntel: { extracted_keywords: ['TypeScript', 'React'], source: 'resume_text' },
    profile: { skills: ['TypeScript', 'React'], targetRoles: ['Senior Engineer'] },
    resumeText: 'Experienced fullstack engineer with 8 years of TypeScript and React.',
  },
  gapResults: {},
}

const GAP_RESULT = {
  fit_score: 0.72,
  signals: ['TypeScript', 'React'],
  gaps: ['Go', 'Kubernetes'],
}

// ── pruneMessages ────────────────────────────────────────────────────────────

describe('pruneMessages', () => {
  it('keeps all messages when under the 20-message cap', () => {
    const msgs = Array.from({ length: 5 }, (_, i) => makeMessage(`msg ${i}`))
    expect(pruneMessages(msgs)).toHaveLength(5)
  })

  it('trims to 20 messages, keeping the most recent', () => {
    const msgs = Array.from({ length: 25 }, (_, i) => makeMessage(`msg ${i}`))
    const pruned = pruneMessages(msgs)
    expect(pruned).toHaveLength(20)
    expect(pruned[0]!.content).toBe('msg 5')
    expect(pruned[19]!.content).toBe('msg 24')
  })

  it('further prunes to stay under 8,000 token budget', () => {
    // Each message is ~1,000 tokens (4,000 chars)
    const msgs = Array.from({ length: 15 }, (_, i) => makeMessage('x'.repeat(4000) + ` msg${i}`))
    const pruned = pruneMessages(msgs)
    const totalTokens = pruned.reduce(
      (sum: number, m: Message) => sum + Math.ceil(m.content.length / 4),
      0,
    )
    expect(totalTokens).toBeLessThanOrEqual(8_000)
  })

  it('always keeps at least one message', () => {
    const msgs = [makeMessage('x'.repeat(40000))]
    expect(pruneMessages(msgs)).toHaveLength(1)
  })

  it('preserves a full briefing response without truncation', () => {
    // A 1,300-token briefing response (~5,200 chars)
    const briefingContent = 'Match details with job_ids and outreach drafts... '.repeat(104)
    const msgs = [makeMessage('Run my briefing'), makeMessage(briefingContent, 'assistant')]
    const pruned = pruneMessages(msgs)
    expect(pruned).toHaveLength(2)
    expect(pruned[1]!.content).toBe(briefingContent)
  })
})

// ── mergeSessionState ────────────────────────────────────────────────────────

describe('mergeSessionState', () => {
  it('merges briefing into empty state', () => {
    const merged = mergeSessionState({}, { briefing: BRIEFING_STATE.briefing })
    expect(merged.briefing).toBeDefined()
    expect(merged.briefing!.matches).toHaveLength(2)
  })

  it('replaces existing briefing entirely on new briefing', () => {
    const existing: SessionState = {
      briefing: {
        cachedAt: '2026-01-01T00:00:00Z',
        matches: [{ job_id: 'old', title: 'Old Job', company: 'Old Corp', score: 0.5, url: null }],
        matchData: [{ job: { job_id: 'old' }, score: 0.5 }],
        resumeIntel: {},
        profile: {},
        resumeText: null,
      },
      gapResults: { old: { fit_score: 0.3 } },
    }
    const merged = mergeSessionState(existing, { briefing: BRIEFING_STATE.briefing })
    expect(merged.briefing!.matches).toHaveLength(2)
    expect(merged.briefing!.matches[0]!.job_id).toBe(JOB_ID_1)
  })

  it('clears stale gap results when briefing is replaced', () => {
    const existing: SessionState = {
      briefing: BRIEFING_STATE.briefing,
      gapResults: { 'stale-job-id': { fit_score: 0.1 } },
    }
    const newBriefing = { ...BRIEFING_STATE.briefing!, cachedAt: new Date().toISOString() }
    const merged = mergeSessionState(existing, { briefing: newBriefing })
    expect(merged.gapResults).toEqual({})
  })

  it('merges gap results additively', () => {
    const existing: SessionState = {
      briefing: BRIEFING_STATE.briefing,
      gapResults: { [JOB_ID_1]: { fit_score: 0.72 } },
    }
    const merged = mergeSessionState(existing, {
      gapResults: { [JOB_ID_2]: { fit_score: 0.65 } },
    })
    expect(merged.gapResults![JOB_ID_1]).toEqual({ fit_score: 0.72 })
    expect(merged.gapResults![JOB_ID_2]).toEqual({ fit_score: 0.65 })
  })

  it('overwrites gap result for same job_id', () => {
    const existing: SessionState = {
      gapResults: { [JOB_ID_1]: { fit_score: 0.5 } },
    }
    const merged = mergeSessionState(existing, {
      gapResults: { [JOB_ID_1]: { fit_score: 0.9 } },
    })
    expect(merged.gapResults![JOB_ID_1]).toEqual({ fit_score: 0.9 })
  })

  it('preserves existing state when update is empty', () => {
    const existing: SessionState = {
      briefing: BRIEFING_STATE.briefing,
      gapResults: { [JOB_ID_1]: GAP_RESULT },
    }
    const merged = mergeSessionState(existing, {})
    expect(merged.briefing).toBe(existing.briefing)
    expect(merged.gapResults).toBe(existing.gapResults)
  })

  it('merges coverLetterResults additively', () => {
    const existing: SessionState = {
      briefing: BRIEFING_STATE.briefing,
      coverLetterResults: { [JOB_ID_1]: { content: 'Cover letter for job 1' } },
    }
    const merged = mergeSessionState(existing, {
      coverLetterResults: { [JOB_ID_2]: { content: 'Cover letter for job 2' } },
    })
    expect(merged.coverLetterResults![JOB_ID_1]).toEqual({ content: 'Cover letter for job 1' })
    expect(merged.coverLetterResults![JOB_ID_2]).toEqual({ content: 'Cover letter for job 2' })
  })

  it('overwrites coverLetterResult for the same job_id', () => {
    const existing: SessionState = {
      coverLetterResults: { [JOB_ID_1]: { content: 'old draft' } },
    }
    const merged = mergeSessionState(existing, {
      coverLetterResults: { [JOB_ID_1]: { content: 'revised draft' } },
    })
    expect(merged.coverLetterResults![JOB_ID_1]).toEqual({ content: 'revised draft' })
  })

  it('clears stale coverLetterResults when briefing is replaced', () => {
    const existing: SessionState = {
      briefing: BRIEFING_STATE.briefing,
      gapResults: { [JOB_ID_1]: GAP_RESULT },
      coverLetterResults: { [JOB_ID_1]: { content: 'stale cover letter' } },
    }
    const newBriefing = { ...BRIEFING_STATE.briefing!, cachedAt: new Date().toISOString() }
    const merged = mergeSessionState(existing, { briefing: newBriefing })
    expect(merged.gapResults).toEqual({})
    expect(merged.coverLetterResults).toEqual({})
  })
})

// ── getMatchFromState ────────────────────────────────────────────────────────

describe('getMatchFromState', () => {
  it('returns match data for a known job_id', () => {
    const result = getMatchFromState(BRIEFING_STATE, JOB_ID_1)
    expect(result).not.toBeNull()
    expect(result!.entry.title).toBe('Senior Engineer')
    expect(result!.entry.company).toBe('Acme Corp')
    expect(result!.matchData).toBeDefined()
    expect(result!.resumeIntel).toBe(BRIEFING_STATE.briefing!.resumeIntel)
    expect(result!.resumeText).toBe(BRIEFING_STATE.briefing!.resumeText)
  })

  it('returns match data for the second match', () => {
    const result = getMatchFromState(BRIEFING_STATE, JOB_ID_2)
    expect(result).not.toBeNull()
    expect(result!.entry.title).toBe('Staff Engineer')
    expect(result!.entry.company).toBe('Beta Inc')
  })

  it('returns null for an unknown job_id', () => {
    expect(getMatchFromState(BRIEFING_STATE, 'nonexistent')).toBeNull()
  })

  it('returns null when no briefing exists in state', () => {
    expect(getMatchFromState({}, JOB_ID_1)).toBeNull()
  })

  it('returns null when briefing is undefined', () => {
    expect(getMatchFromState({ gapResults: {} }, JOB_ID_1)).toBeNull()
  })

  it('includes profile and resumeIntel from the briefing', () => {
    const result = getMatchFromState(BRIEFING_STATE, JOB_ID_1)
    expect(result!.profile).toEqual(BRIEFING_STATE.briefing!.profile)
    expect(result!.resumeIntel).toEqual(BRIEFING_STATE.briefing!.resumeIntel)
  })
})

// ── getGapResultFromState ────────────────────────────────────────────────────

describe('getGapResultFromState', () => {
  it('returns gap result for a cached job_id', () => {
    const state: SessionState = { gapResults: { [JOB_ID_1]: GAP_RESULT } }
    expect(getGapResultFromState(state, JOB_ID_1)).toEqual(GAP_RESULT)
  })

  it('returns null for an uncached job_id', () => {
    const state: SessionState = { gapResults: { [JOB_ID_1]: GAP_RESULT } }
    expect(getGapResultFromState(state, JOB_ID_2)).toBeNull()
  })

  it('returns null when gapResults is undefined', () => {
    expect(getGapResultFromState({}, JOB_ID_1)).toBeNull()
  })

  it('returns null when state is empty', () => {
    expect(getGapResultFromState({}, JOB_ID_1)).toBeNull()
  })
})

// ── loadSession (state parsing) ──────────────────────────────────────────────

describe('loadSession', () => {
  function mockSessionQuery(sessionData: object | null) {
    const chain = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      order: () => chain,
      limit: () => chain,
      single: () =>
        Promise.resolve({
          data: sessionData,
          error: sessionData ? null : { message: 'not found' },
        }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }
    mockFrom.mockReturnValue(chain)
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('parses state from the session row', async () => {
    mockSessionQuery({
      id: SESSION_ID,
      user_id: USER_ID,
      channel: 'web',
      messages: [],
      state: BRIEFING_STATE,
      last_active: new Date().toISOString(),
      created_at: new Date().toISOString(),
      deleted_at: null,
    })

    const session = await loadSession(USER_ID, 'web')
    expect(session).not.toBeNull()
    expect(session!.state.briefing).toBeDefined()
    expect(session!.state.briefing!.matches).toHaveLength(2)
    expect(session!.state.briefing!.matches[0]!.job_id).toBe(JOB_ID_1)
  })

  it('defaults to empty state for pre-migration sessions', async () => {
    mockSessionQuery({
      id: SESSION_ID,
      user_id: USER_ID,
      channel: 'web',
      messages: [{ role: 'user', content: 'hello', timestamp: '2026-03-01T00:00:00Z' }],
      state: null, // pre-migration row
      last_active: new Date().toISOString(),
      created_at: new Date().toISOString(),
      deleted_at: null,
    })

    const session = await loadSession(USER_ID, 'web')
    expect(session).not.toBeNull()
    expect(session!.state).toEqual({})
    expect(session!.messages).toHaveLength(1)
  })

  it('defaults to empty state when state column is empty object', async () => {
    mockSessionQuery({
      id: SESSION_ID,
      user_id: USER_ID,
      channel: 'web',
      messages: [],
      state: {},
      last_active: new Date().toISOString(),
      created_at: new Date().toISOString(),
      deleted_at: null,
    })

    const session = await loadSession(USER_ID, 'web')
    expect(session!.state).toEqual({})
  })

  it('returns null when no session exists', async () => {
    mockSessionQuery(null)
    const session = await loadSession(USER_ID, 'web')
    expect(session).toBeNull()
  })

  it('soft-deletes expired sessions', async () => {
    const expiredDate = new Date()
    expiredDate.setDate(expiredDate.getDate() - 31)

    const mockUpdateChain = { eq: vi.fn().mockResolvedValue({ error: null }) }
    const chain = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      order: () => chain,
      limit: () => chain,
      single: () =>
        Promise.resolve({
          data: {
            id: SESSION_ID,
            user_id: USER_ID,
            channel: 'web',
            messages: [],
            state: {},
            last_active: expiredDate.toISOString(),
            created_at: expiredDate.toISOString(),
            deleted_at: null,
          },
          error: null,
        }),
      update: () => mockUpdateChain,
    }
    mockFrom.mockReturnValue(chain)

    const session = await loadSession(USER_ID, 'web')
    expect(session).toBeNull()
  })
})

// ── saveSession (state write-through) ────────────────────────────────────────

describe('saveSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes state alongside messages on update', async () => {
    const updateEq2 = vi.fn().mockResolvedValue({ error: null })
    const updateEq1 = vi.fn().mockReturnValue({ eq: updateEq2 })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq1 })
    mockFrom.mockReturnValue({ update: updateFn })

    const msgs: Message[] = [makeMessage('hello')]
    const stateUpdate: Partial<SessionState> = { briefing: BRIEFING_STATE.briefing }

    await saveSession(USER_ID, 'web', msgs, SESSION_ID, stateUpdate, {})

    expect(updateFn).toHaveBeenCalledTimes(1)
    const payload = updateFn.mock.calls[0]![0] as Record<string, unknown>
    expect(payload).toHaveProperty('messages')
    expect(payload).toHaveProperty('state')
    expect(payload).toHaveProperty('last_active')
    const savedState = payload['state'] as SessionState
    expect(savedState.briefing!.matches).toHaveLength(2)
  })

  it('preserves existing state when no stateUpdate is provided', async () => {
    const updateEq2 = vi.fn().mockResolvedValue({ error: null })
    const updateEq1 = vi.fn().mockReturnValue({ eq: updateEq2 })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq1 })
    mockFrom.mockReturnValue({ update: updateFn })

    const existing: SessionState = { briefing: BRIEFING_STATE.briefing, gapResults: {} }
    await saveSession(USER_ID, 'web', [makeMessage('hi')], SESSION_ID, undefined, existing)

    const payload = updateFn.mock.calls[0]![0] as Record<string, unknown>
    expect(payload).toHaveProperty('state')
    expect((payload['state'] as SessionState).briefing).toBeDefined()
  })

  it('omits state from payload when neither update nor existing provided', async () => {
    const updateEq2 = vi.fn().mockResolvedValue({ error: null })
    const updateEq1 = vi.fn().mockReturnValue({ eq: updateEq2 })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq1 })
    mockFrom.mockReturnValue({ update: updateFn })

    await saveSession(USER_ID, 'web', [makeMessage('hi')], SESSION_ID)

    const payload = updateFn.mock.calls[0]![0] as Record<string, unknown>
    expect(payload).not.toHaveProperty('state')
  })

  it('merges gap results into existing state', async () => {
    const updateEq2 = vi.fn().mockResolvedValue({ error: null })
    const updateEq1 = vi.fn().mockReturnValue({ eq: updateEq2 })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq1 })
    mockFrom.mockReturnValue({ update: updateFn })

    const existing: SessionState = {
      briefing: BRIEFING_STATE.briefing,
      gapResults: { [JOB_ID_1]: GAP_RESULT },
    }
    const stateUpdate: Partial<SessionState> = {
      gapResults: { [JOB_ID_2]: { fit_score: 0.65 } },
    }

    await saveSession(USER_ID, 'web', [makeMessage('hi')], SESSION_ID, stateUpdate, existing)

    const payload = updateFn.mock.calls[0]![0] as Record<string, unknown>
    const savedState = payload['state'] as SessionState
    expect(savedState.gapResults![JOB_ID_1]).toEqual(GAP_RESULT)
    expect(savedState.gapResults![JOB_ID_2]).toEqual({ fit_score: 0.65 })
  })

  it('merges coverLetterResults into existing state', async () => {
    const updateEq2 = vi.fn().mockResolvedValue({ error: null })
    const updateEq1 = vi.fn().mockReturnValue({ eq: updateEq2 })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq1 })
    mockFrom.mockReturnValue({ update: updateFn })

    const existing: SessionState = {
      briefing: BRIEFING_STATE.briefing,
      coverLetterResults: { [JOB_ID_1]: { content: 'Cover letter for job 1' } },
    }
    const stateUpdate: Partial<SessionState> = {
      coverLetterResults: { [JOB_ID_2]: { content: 'Cover letter for job 2' } },
    }

    await saveSession(USER_ID, 'web', [makeMessage('hi')], SESSION_ID, stateUpdate, existing)

    const payload = updateFn.mock.calls[0]![0] as Record<string, unknown>
    const savedState = payload['state'] as SessionState
    expect(savedState.coverLetterResults![JOB_ID_1]).toEqual({ content: 'Cover letter for job 1' })
    expect(savedState.coverLetterResults![JOB_ID_2]).toEqual({ content: 'Cover letter for job 2' })
  })

  it('creates new session with state on insert', async () => {
    const singleFn = vi.fn().mockResolvedValue({ data: { id: SESSION_ID }, error: null })
    const selectFn = vi.fn().mockReturnValue({ single: singleFn })
    const upsertFn = vi.fn().mockReturnValue({ select: selectFn })
    mockFrom.mockReturnValue({ upsert: upsertFn })

    const stateUpdate: Partial<SessionState> = { briefing: BRIEFING_STATE.briefing }
    await saveSession(USER_ID, 'web', [makeMessage('hi')], undefined, stateUpdate, {})

    const payload = upsertFn.mock.calls[0]![0] as Record<string, unknown>
    expect(payload).toHaveProperty('state')
    expect((payload['state'] as SessionState).briefing!.matches).toHaveLength(2)
  })

  it('prunes messages to 20 on write', async () => {
    const updateEq2 = vi.fn().mockResolvedValue({ error: null })
    const updateEq1 = vi.fn().mockReturnValue({ eq: updateEq2 })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq1 })
    mockFrom.mockReturnValue({ update: updateFn })

    const msgs = Array.from({ length: 25 }, (_, i) => makeMessage(`msg ${i}`))
    await saveSession(USER_ID, 'web', msgs, SESSION_ID)

    const payload = updateFn.mock.calls[0]![0] as Record<string, unknown>
    const savedMsgs = payload['messages'] as Message[]
    expect(savedMsgs).toHaveLength(20)
    expect(savedMsgs[0]!.content).toBe('msg 5')
  })
})

// ── buildActiveBriefingGroundingMessage — cached flags ───────────────────────

describe('buildActiveBriefingGroundingMessage — gap_analysis_cached and cover_letter_cached', () => {
  it('emits gap_analysis_cached=no and cover_letter_cached=no when no results are stored', () => {
    const state: SessionState = { briefing: BRIEFING_STATE.briefing }
    const message = buildActiveBriefingGroundingMessage(state)
    expect(message).not.toBeNull()
    expect(message).toContain('gap_analysis_cached=no')
    expect(message).toContain('cover_letter_cached=no')
  })

  it('emits gap_analysis_cached=yes for a job_id with a stored gap result', () => {
    const state: SessionState = {
      briefing: BRIEFING_STATE.briefing,
      gapResults: { [JOB_ID_1]: { overall_score: 0.92 } },
    }
    const message = buildActiveBriefingGroundingMessage(state)!
    const lines = message.split('\n')
    const job1Line = lines.find((l) => l.includes(`job_id=${JOB_ID_1}`))
    const job2Line = lines.find((l) => l.includes(`job_id=${JOB_ID_2}`))
    expect(job1Line).toContain('gap_analysis_cached=yes')
    expect(job1Line).toContain('cover_letter_cached=no')
    expect(job2Line).toContain('gap_analysis_cached=no')
  })

  it('emits cover_letter_cached=yes for a job_id with a stored cover letter result', () => {
    const state: SessionState = {
      briefing: BRIEFING_STATE.briefing,
      coverLetterResults: { [JOB_ID_2]: { content: 'Dear Hiring Team...' } },
    }
    const message = buildActiveBriefingGroundingMessage(state)!
    const lines = message.split('\n')
    const job1Line = lines.find((l) => l.includes(`job_id=${JOB_ID_1}`))
    const job2Line = lines.find((l) => l.includes(`job_id=${JOB_ID_2}`))
    expect(job2Line).toContain('cover_letter_cached=yes')
    expect(job2Line).toContain('gap_analysis_cached=no')
    expect(job1Line).toContain('cover_letter_cached=no')
  })

  it('emits correct independent flags when both results are stored for different jobs', () => {
    const state: SessionState = {
      briefing: BRIEFING_STATE.briefing,
      gapResults: { [JOB_ID_1]: { overall_score: 0.92 } },
      coverLetterResults: { [JOB_ID_2]: { content: 'Dear Hiring Team...' } },
    }
    const message = buildActiveBriefingGroundingMessage(state)!
    const lines = message.split('\n')
    const job1Line = lines.find((l) => l.includes(`job_id=${JOB_ID_1}`))
    const job2Line = lines.find((l) => l.includes(`job_id=${JOB_ID_2}`))
    expect(job1Line).toContain('gap_analysis_cached=yes')
    expect(job1Line).toContain('cover_letter_cached=no')
    expect(job2Line).toContain('gap_analysis_cached=no')
    expect(job2Line).toContain('cover_letter_cached=yes')
  })

  it('reflects gap result persisted via mergeSessionState', () => {
    const after = mergeSessionState(
      { briefing: BRIEFING_STATE.briefing },
      { gapResults: { [JOB_ID_1]: { overall_score: 0.92 } } },
    )
    const message = buildActiveBriefingGroundingMessage(after)!
    expect(message).toContain('gap_analysis_cached=yes')
  })

  it('reflects cover letter result persisted via mergeSessionState', () => {
    const after = mergeSessionState(
      { briefing: BRIEFING_STATE.briefing },
      { coverLetterResults: { [JOB_ID_2]: { content: 'Dear...' } } },
    )
    const message = buildActiveBriefingGroundingMessage(after)!
    const lines = message.split('\n')
    const job2Line = lines.find((l) => l.includes(`job_id=${JOB_ID_2}`))
    expect(job2Line).toContain('cover_letter_cached=yes')
  })
})
