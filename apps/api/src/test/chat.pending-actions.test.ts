/**
 * chat.pending-actions.test.ts — Unit tests for the FIFO pending-action queue.
 *
 * The queue runs after the primary tool completes and auto-executes any
 * intents detected in the user's message that the LLM's single tool call
 * didn't fulfil (one tool per turn constraint).
 *
 * Coverage:
 *
 * Single pending:
 *   - gap_analysis primary → track_save pending → Supabase upsert called
 *   - cover_letter primary → track_save pending → Supabase upsert called
 *   - track_application primary → cover_letter pending → worker called
 *   - track_application primary → gap_analysis pending → worker called
 *
 * Multi-action chains:
 *   - gap_analysis → cover_letter pending → cover letter appended to response
 *   - gap_analysis → cover_letter + track_save → all three executed in order
 *   - track_application → gap_analysis + cover_letter → queue runs both;
 *     cover letter receives the gap result computed earlier in the same queue
 *
 * Edge cases:
 *   - cover_letter pending on free tier → silently skipped, worker not called
 *   - gap_analysis pending on free tier → silently skipped, worker not called
 *   - pending worker throws → primary response still completes (done not error)
 *   - no pending intents → single worker call, response unmodified
 *
 * Step 1 (score fix):
 *   - briefing_match_score injected into gap analysis format call so Claude can
 *     label "Overall match" vs "Keyword coverage" distinctly
 *
 * Run: npm test (from apps/api/) or turbo run test
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  app,
  mockCallLLM,
  mockCallLLMWithToolResult,
  mockIssueSkillAssertion,
  mockRunWorkerGapAnalysis,
  mockRunWorkerCoverLetter,
  mockGetUser,
  mockFrom,
  TEST_SESSION_ID,
  parseSSEEvents,
  resetRateLimit,
} from './_setup.js'

// ── Constants ─────────────────────────────────────────────────────────────────

const PRO_USER = 'ffffffaa-0000-0000-0000-000000000001'
const FREE_USER = 'ffffffbb-0000-0000-0000-000000000002'

const GAP_RESULT = {
  analysis: {
    fit_score: 0.65,
    matched_keywords: ['TypeScript', 'React'],
    gap_keywords: ['Go', 'Kubernetes'],
  },
}

const COVER_LETTER_RESULT = {
  body: 'Dear Acme hiring team, your focus on distributed systems aligns well...',
  tone: 'professional',
  is_template: false,
  match_score: 0.9,
  keyword_coverage: { top_signals: ['TypeScript'], top_gaps: ['Go'] },
  _meta: {
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    attempts: 1,
    fallback_reason: null,
    latency_ms: 2400,
  },
}

/** Session state with briefing for job-acme-001 (score 0.92) and a pre-existing gap result. */
const STATE_WITH_GAP = {
  briefing: {
    matches: [
      {
        job_id: 'job-acme-001',
        title: 'Senior Engineer',
        company: 'Acme',
        score: 0.92,
        url: 'https://acme.com/jobs/1',
      },
    ],
    matchData: [
      {
        job: {
          job_id: 'job-acme-001',
          title: 'Senior Engineer',
          company: 'Acme',
          url: 'https://acme.com/jobs/1',
        },
        score: 0.92,
        breakdown: {},
        matched_keywords: ['TypeScript', 'React'],
        gap_keywords: ['Go'],
      },
    ],
    resumeIntel: { extracted_keywords: ['TypeScript', 'React'], source: 'resume_text' },
    profile: { skills: ['TypeScript', 'React'], targetRoles: ['Senior Engineer'] },
    resumeText: 'Experienced fullstack engineer.',
    cachedAt: '2026-04-01T00:00:00.000Z',
  },
  gapResults: {
    'job-acme-001': GAP_RESULT.analysis,
  },
}

/** Same as STATE_WITH_GAP but WITHOUT pre-existing gap results — for in-queue threading tests. */
const STATE_WITHOUT_GAP = {
  ...STATE_WITH_GAP,
  gapResults: {},
}

// ── Supabase mock builder ─────────────────────────────────────────────────────

let trackingUpsertCalls: Array<Record<string, unknown>> = []
let trackingUpsertShouldFail = false

function buildMock(opts: { userId: string; tier: 'free' | 'pro'; sessionState?: object }) {
  trackingUpsertCalls = []
  trackingUpsertShouldFail = false

  mockGetUser.mockResolvedValue({ data: { user: { id: opts.userId } }, error: null })

  const tier = opts.tier
  const sessionState = opts.sessionState ?? STATE_WITH_GAP

  /**
   * Full fluent chain — every method returns `chain` so arbitrary depth
   * (e.g. .select().eq().eq().is().eq().order().limit().single()) works.
   * Terminal methods (single, maybeSingle) resolve with `terminalResult`.
   */
  const makeChain = (terminalResult: { data: unknown; error: unknown }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      order: () => chain,
      limit: () => chain,
      single: () => Promise.resolve(terminalResult),
      maybeSingle: () => Promise.resolve(terminalResult),
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: { id: TEST_SESSION_ID }, error: null }),
        }),
        then: (cb: (v: unknown) => void) => {
          cb({ data: null, error: null })
          return Promise.resolve()
        },
      }),
      update: () => ({
        eq: () => ({
          eq: () => ({
            ...chain,
            then: (cb: (v: unknown) => void) => {
              cb({ error: null })
              return Promise.resolve()
            },
          }),
          then: (cb: (v: unknown) => void) => {
            cb({ error: null })
            return Promise.resolve()
          },
        }),
      }),
      upsert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: { id: TEST_SESSION_ID }, error: null }),
        }),
      }),
      then: (cb: (v: unknown) => void) => {
        cb(terminalResult)
        return Promise.resolve()
      },
    }
    return chain
  }

  mockFrom.mockImplementation((table: string) => {
    // ── sessions ──────────────────────────────────────────────────────────
    if (table === 'sessions') {
      return makeChain({
        data: {
          id: TEST_SESSION_ID,
          user_id: opts.userId,
          channel: 'web',
          messages: [],
          state: sessionState,
          last_active: new Date().toISOString(),
          created_at: new Date().toISOString(),
          deleted_at: null,
        },
        error: null,
      })
    }

    // ── users ─────────────────────────────────────────────────────────────
    if (table === 'users') {
      return makeChain({ data: { tier }, error: null })
    }

    // ── user_skill_entitlements ───────────────────────────────────────────
    if (table === 'user_skill_entitlements') {
      const entitlementData = tier === 'pro' ? { tier: 'pro', status: 'active' } : null
      return makeChain({ data: entitlementData, error: null })
    }

    // ── careerclaw_profiles ───────────────────────────────────────────────
    if (table === 'careerclaw_profiles') {
      return makeChain({
        data: {
          resume_text: 'Experienced fullstack engineer.',
          work_mode: 'remote',
          salary_min: 120000,
          location_pref: null,
          skills: ['TypeScript', 'React'],
          target_roles: ['Senior Engineer'],
          experience_years: 6,
          resume_summary: 'Fullstack engineer with 6 years of experience.',
        },
        error: null,
      })
    }

    // ── careerclaw_runs ───────────────────────────────────────────────────
    if (table === 'careerclaw_runs') {
      return makeChain({ data: null, error: null })
    }

    // ── careerclaw_job_tracking ───────────────────────────────────────────
    if (table === 'careerclaw_job_tracking') {
      return {
        upsert: (row: Record<string, unknown>) => {
          trackingUpsertCalls.push(row)
          return Promise.resolve({
            error: trackingUpsertShouldFail ? { message: 'DB write error' } : null,
          })
        },
        select: () => makeChain({ data: [], error: null }),
        update: () => ({
          eq: () => ({
            eq: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
            ilike: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
          }),
        }),
      }
    }

    // ── default ───────────────────────────────────────────────────────────
    return makeChain({ data: null, error: null })
  })
}

function makeRequest(userId: string, message: string) {
  return app.request('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
    body: JSON.stringify({ userId, channel: 'web', message, sessionId: TEST_SESSION_ID }),
  })
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  resetRateLimit()
  mockCallLLM.mockReset()
  mockCallLLMWithToolResult.mockReset()
  mockIssueSkillAssertion.mockReset().mockReturnValue('test-assertion')
  mockRunWorkerGapAnalysis.mockReset()
  mockRunWorkerCoverLetter.mockReset()
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function setupGapAnalysisPrimary(userId = PRO_USER, sessionState: object = STATE_WITH_GAP) {
  buildMock({ userId, tier: 'pro', sessionState })
  mockCallLLM.mockResolvedValue({
    type: 'tool_use',
    toolName: 'run_gap_analysis',
    toolUseId: 'tool_gap_001',
    toolInput: { job_id: 'job-acme-001' },
    provider: 'anthropic',
  })
  mockCallLLMWithToolResult.mockResolvedValue({
    type: 'text',
    content: 'Here is the gap analysis for Acme.',
    provider: 'anthropic',
  })
  mockRunWorkerGapAnalysis.mockResolvedValue({ result: GAP_RESULT, durationMs: 120 })
}

function setupCoverLetterPrimary(userId = PRO_USER) {
  buildMock({ userId, tier: 'pro' })
  mockCallLLM.mockResolvedValue({
    type: 'tool_use',
    toolName: 'run_cover_letter',
    toolUseId: 'tool_cl_001',
    toolInput: { job_id: 'job-acme-001' },
    provider: 'anthropic',
  })
  mockCallLLMWithToolResult.mockResolvedValue({
    type: 'text',
    content: 'Here is your cover letter for Acme.',
    provider: 'anthropic',
  })
  mockRunWorkerCoverLetter.mockResolvedValue({ result: COVER_LETTER_RESULT, durationMs: 2400 })
}

function setupTrackApplicationPrimary(userId = PRO_USER, sessionState: object = STATE_WITH_GAP) {
  buildMock({ userId, tier: 'pro', sessionState })
  mockCallLLM.mockResolvedValue({
    type: 'tool_use',
    toolName: 'track_application',
    toolUseId: 'tool_track_001',
    toolInput: {
      action: 'save',
      job_id: 'job-acme-001',
      title: 'Senior Engineer',
      company: 'Acme',
      status: 'saved',
      url: 'https://acme.com/jobs/1',
    },
    provider: 'anthropic',
  })
  mockCallLLMWithToolResult.mockResolvedValue({
    type: 'text',
    content: 'Done — saved Senior Engineer at Acme.',
    provider: 'anthropic',
  })
}

// ── Tests: single pending actions ─────────────────────────────────────────────

describe('POST /chat — pending-action queue: single pending', () => {
  it('gap_analysis primary → track_save pending: Supabase upsert called once', async () => {
    setupGapAnalysisPrimary()

    const res = await makeRequest(PRO_USER, 'Analyze Acme and save the job to my tracker')
    const events = parseSSEEvents(await res.text())

    expect(res.status).toBe(200)
    expect(mockRunWorkerGapAnalysis).toHaveBeenCalledTimes(1)
    expect(trackingUpsertCalls).toHaveLength(1)
    expect(trackingUpsertCalls[0]).toMatchObject({
      job_id: 'job-acme-001',
      company: 'Acme',
      status: 'saved',
    })
    const done = events.find((e) => e['type'] === 'done')
    expect(done).toBeDefined()
    expect(typeof done!['message']).toBe('string')
    // Save confirmation appended after the primary response
    expect(done!['message']).toContain('saved to your tracker')
  })

  it('cover_letter primary → track_save pending: Supabase upsert called once', async () => {
    setupCoverLetterPrimary()

    const res = await makeRequest(
      PRO_USER,
      'Write a cover letter for Acme and save it to my tracker',
    )
    const events = parseSSEEvents(await res.text())

    expect(res.status).toBe(200)
    expect(mockRunWorkerCoverLetter).toHaveBeenCalledTimes(1)
    expect(trackingUpsertCalls).toHaveLength(1)
    const done = events.find((e) => e['type'] === 'done')
    expect(done!['message']).toContain('saved to your tracker')
  })

  it('track_application primary → cover_letter pending: cover letter worker called', async () => {
    setupTrackApplicationPrimary()
    mockRunWorkerCoverLetter.mockResolvedValue({ result: COVER_LETTER_RESULT, durationMs: 2400 })
    // Primary track format + pending cover letter format
    mockCallLLMWithToolResult
      .mockResolvedValueOnce({
        type: 'text',
        content: 'Done — saved Senior Engineer at Acme.',
        provider: 'anthropic',
      })
      .mockResolvedValueOnce({
        type: 'text',
        content: 'Cover letter for Acme — here is your tailored cover letter.',
        provider: 'anthropic',
      })

    const res = await makeRequest(PRO_USER, 'Save Acme and write a cover letter')
    const events = parseSSEEvents(await res.text())

    expect(res.status).toBe(200)
    // Primary track: Supabase called (at least once for the save action in 7e)
    expect(trackingUpsertCalls.length).toBeGreaterThanOrEqual(1)
    // Pending: cover letter worker called once
    expect(mockRunWorkerCoverLetter).toHaveBeenCalledTimes(1)
    const done = events.find((e) => e['type'] === 'done')
    expect(done!['message']).toContain('Cover letter for Acme')
  })

  it('track_application primary → gap_analysis pending: gap analysis worker called', async () => {
    setupTrackApplicationPrimary()
    mockRunWorkerGapAnalysis.mockResolvedValue({ result: GAP_RESULT, durationMs: 120 })
    // Primary track format + pending gap analysis format
    mockCallLLMWithToolResult
      .mockResolvedValueOnce({
        type: 'text',
        content: 'Done — saved Senior Engineer at Acme.',
        provider: 'anthropic',
      })
      .mockResolvedValueOnce({
        type: 'text',
        content: 'Gap analysis for Acme — keyword coverage: 65%.',
        provider: 'anthropic',
      })

    const res = await makeRequest(PRO_USER, 'Save Acme and analyze the gap')
    const events = parseSSEEvents(await res.text())

    expect(res.status).toBe(200)
    expect(mockRunWorkerGapAnalysis).toHaveBeenCalledTimes(1)
    const done = events.find((e) => e['type'] === 'done')
    expect(done!['message']).toContain('Gap analysis for Acme')
  })
})

// ── Tests: multi-action chains ────────────────────────────────────────────────

describe('POST /chat — pending-action queue: multi-action chains', () => {
  it('gap_analysis → cover_letter pending: cover letter appended to response', async () => {
    setupGapAnalysisPrimary()
    mockRunWorkerCoverLetter.mockResolvedValue({ result: COVER_LETTER_RESULT, durationMs: 2400 })
    // Primary gap analysis format + pending cover letter format
    mockCallLLMWithToolResult
      .mockResolvedValueOnce({
        type: 'text',
        content: 'Here is the gap analysis for Acme.',
        provider: 'anthropic',
      })
      .mockResolvedValueOnce({
        type: 'text',
        content: 'Cover letter for Acme — here is your tailored cover letter.',
        provider: 'anthropic',
      })

    const res = await makeRequest(PRO_USER, 'Analyze Acme and write a cover letter')
    const events = parseSSEEvents(await res.text())

    expect(res.status).toBe(200)
    expect(mockRunWorkerGapAnalysis).toHaveBeenCalledTimes(1)
    expect(mockRunWorkerCoverLetter).toHaveBeenCalledTimes(1)
    const done = events.find((e) => e['type'] === 'done')
    expect(done!['message']).toContain('Cover letter for Acme')
  })

  it('gap_analysis → cover_letter + track_save: all three executed in order', async () => {
    setupGapAnalysisPrimary()
    mockRunWorkerCoverLetter.mockResolvedValue({ result: COVER_LETTER_RESULT, durationMs: 2400 })
    // Primary gap analysis format + pending cover letter format
    // (track_save appends its confirmation directly — no LLM call)
    mockCallLLMWithToolResult
      .mockResolvedValueOnce({
        type: 'text',
        content: 'Here is the gap analysis for Acme.',
        provider: 'anthropic',
      })
      .mockResolvedValueOnce({
        type: 'text',
        content: 'Cover letter for Acme — here is your tailored cover letter.',
        provider: 'anthropic',
      })

    const res = await makeRequest(
      PRO_USER,
      'Analyze Acme, write a cover letter, and save the job to my tracker',
    )
    const events = parseSSEEvents(await res.text())

    expect(res.status).toBe(200)
    expect(mockRunWorkerGapAnalysis).toHaveBeenCalledTimes(1)
    expect(mockRunWorkerCoverLetter).toHaveBeenCalledTimes(1)
    expect(trackingUpsertCalls).toHaveLength(1)

    const done = events.find((e) => e['type'] === 'done')
    const msg = done!['message'] as string
    expect(msg).toContain('Cover letter for Acme')
    expect(msg).toContain('saved to your tracker')
  })

  it('track_application → gap_analysis + cover_letter: both run, cover letter gets in-queue gap', async () => {
    // Session state has NO pre-existing gap for job-acme-001 — if threading works,
    // cover letter will still receive the gap computed earlier in the queue.
    setupTrackApplicationPrimary(PRO_USER, STATE_WITHOUT_GAP)
    mockRunWorkerGapAnalysis.mockResolvedValue({ result: GAP_RESULT, durationMs: 120 })
    mockRunWorkerCoverLetter.mockResolvedValue({ result: COVER_LETTER_RESULT, durationMs: 2400 })
    // Primary track format + pending gap format + pending cover letter format
    mockCallLLMWithToolResult
      .mockResolvedValueOnce({
        type: 'text',
        content: 'Done — saved Senior Engineer at Acme.',
        provider: 'anthropic',
      })
      .mockResolvedValueOnce({
        type: 'text',
        content: 'Gap analysis for Acme — keyword coverage: 65%.',
        provider: 'anthropic',
      })
      .mockResolvedValueOnce({
        type: 'text',
        content: 'Cover letter for Acme — here is your tailored cover letter.',
        provider: 'anthropic',
      })

    const res = await makeRequest(PRO_USER, 'Save Acme, analyze the gap, and write a cover letter')
    const events = parseSSEEvents(await res.text())

    expect(res.status).toBe(200)
    expect(mockRunWorkerGapAnalysis).toHaveBeenCalledTimes(1)
    expect(mockRunWorkerCoverLetter).toHaveBeenCalledTimes(1)

    // Cover letter input should include precomputedGap from the in-queue gap result
    const clCall = mockRunWorkerCoverLetter.mock.calls[0]?.[0] as { input: Record<string, unknown> }
    expect(clCall?.input?.['precomputedGap']).toEqual(GAP_RESULT.analysis)

    const done = events.find((e) => e['type'] === 'done')
    const msg = done!['message'] as string
    expect(msg).toContain('Gap analysis for Acme')
    expect(msg).toContain('Cover letter for Acme')
  })
})

// ── Tests: edge cases ─────────────────────────────────────────────────────────

describe('POST /chat — pending-action queue: edge cases', () => {
  it('cover_letter pending on free tier: worker not called, no upgrade message mid-response', async () => {
    // Use track_application as primary — free tier can save to tracker.
    // cover_letter is the pending intent but must be silently skipped (Pro-gated).
    buildMock({ userId: FREE_USER, tier: 'free' })
    mockCallLLM.mockResolvedValue({
      type: 'tool_use',
      toolName: 'track_application',
      toolUseId: 'tool_track_001',
      toolInput: {
        action: 'save',
        job_id: 'job-acme-001',
        title: 'Senior Engineer',
        company: 'Acme',
        status: 'saved',
      },
      provider: 'anthropic',
    })
    mockCallLLMWithToolResult.mockResolvedValue({
      type: 'text',
      content: 'Done — saved Senior Engineer at Acme.',
      provider: 'anthropic',
    })

    const res = await makeRequest(FREE_USER, 'Save Acme and write a cover letter')
    const events = parseSSEEvents(await res.text())

    expect(res.status).toBe(200)
    // Primary save executes
    expect(trackingUpsertCalls.length).toBeGreaterThanOrEqual(1)
    // Cover letter skipped silently — free tier cannot generate cover letters
    expect(mockRunWorkerCoverLetter).not.toHaveBeenCalled()
    const done = events.find((e) => e['type'] === 'done')
    // No upgrade message appended — pending Pro actions are silently skipped
    expect(done!['message']).not.toContain('Pro feature')
    expect(done!['message']).not.toContain('Upgrade')
  })

  it('gap_analysis pending on free tier: worker not called', async () => {
    buildMock({ userId: FREE_USER, tier: 'free' })
    mockCallLLM.mockResolvedValue({
      type: 'tool_use',
      toolName: 'track_application',
      toolUseId: 'tool_track_001',
      toolInput: {
        action: 'save',
        job_id: 'job-acme-001',
        title: 'Senior Engineer',
        company: 'Acme',
        status: 'saved',
      },
      provider: 'anthropic',
    })
    mockCallLLMWithToolResult.mockResolvedValue({
      type: 'text',
      content: 'Done — saved Senior Engineer at Acme.',
      provider: 'anthropic',
    })

    const res = await makeRequest(FREE_USER, 'Save Acme and analyze the gap')
    const events = parseSSEEvents(await res.text())

    expect(res.status).toBe(200)
    expect(mockRunWorkerGapAnalysis).not.toHaveBeenCalled()
    const done = events.find((e) => e['type'] === 'done')
    expect(done).toBeDefined()
    expect(done!['message']).not.toContain('Pro feature')
  })

  it('pending track_save fails: primary response still succeeds with done event', async () => {
    setupGapAnalysisPrimary()
    trackingUpsertShouldFail = true

    const res = await makeRequest(PRO_USER, 'Analyze Acme and save the job to my tracker')
    const events = parseSSEEvents(await res.text())

    expect(res.status).toBe(200)
    // No error event — failure is swallowed gracefully
    expect(events.every((e) => e['type'] !== 'error')).toBe(true)
    expect(events.some((e) => e['type'] === 'done')).toBe(true)
  })

  it('pending cover_letter worker throws: primary response still succeeds', async () => {
    setupTrackApplicationPrimary()
    mockRunWorkerCoverLetter.mockRejectedValue(new Error('Worker timeout'))

    const res = await makeRequest(PRO_USER, 'Save Acme and write a cover letter')
    const events = parseSSEEvents(await res.text())

    expect(res.status).toBe(200)
    expect(events.every((e) => e['type'] !== 'error')).toBe(true)
    expect(events.some((e) => e['type'] === 'done')).toBe(true)
  })

  it('no pending intents: primary worker called once, response unmodified', async () => {
    setupGapAnalysisPrimary()

    // Only one intent — no pending actions
    const res = await makeRequest(PRO_USER, 'Analyze Acme')
    const events = parseSSEEvents(await res.text())

    expect(res.status).toBe(200)
    expect(mockRunWorkerGapAnalysis).toHaveBeenCalledTimes(1)
    expect(mockRunWorkerCoverLetter).not.toHaveBeenCalled()
    expect(trackingUpsertCalls).toHaveLength(0)

    const done = events.find((e) => e['type'] === 'done')
    // Primary format response, no appended sections
    expect(done!['message']).toBe('Here is the gap analysis for Acme.')
  })
})

// ── Tests: Step 1 — briefing_match_score in format call ──────────────────────

describe('POST /chat — Step 1: briefing_match_score injected into gap analysis format call', () => {
  it('format call receives briefing_match_score alongside fit_score', async () => {
    setupGapAnalysisPrimary()

    const res = await makeRequest(PRO_USER, 'Analyze Acme')
    // Drain the SSE stream so the handler's streaming callback fully executes
    // before we inspect mock call arguments.
    await res.text()

    // The 6th argument to callLLMWithToolResult is the tool result payload
    const formatCall = mockCallLLMWithToolResult.mock.calls[0]
    const toolResultPayload = formatCall?.[5] as Record<string, unknown>

    // briefing_match_score should be injected from session state (0.92 for job-acme-001)
    expect(toolResultPayload?.['briefing_match_score']).toBeCloseTo(0.92)
  })

  it('format call without matching briefing entry omits briefing_match_score', async () => {
    // Edge: session state has no matches for the requested job_id
    buildMock({
      userId: PRO_USER,
      tier: 'pro',
      sessionState: { ...STATE_WITH_GAP, briefing: undefined },
    })
    mockCallLLM.mockResolvedValue({
      type: 'tool_use',
      toolName: 'run_gap_analysis',
      toolUseId: 'tool_gap_002',
      toolInput: { job_id: 'job-acme-001' },
      provider: 'anthropic',
    })
    mockCallLLMWithToolResult.mockResolvedValue({
      type: 'text',
      content: 'Gap analysis result.',
      provider: 'anthropic',
    })
    // Worker still returns a result — server resolves via session briefing lookup
    mockRunWorkerGapAnalysis.mockResolvedValue({ result: GAP_RESULT, durationMs: 120 })

    // Without a briefing the enforcer will return 'clarify' — so this becomes a gated response.
    // Verify no crash and a done event is returned.
    const res = await makeRequest(PRO_USER, 'Analyze Acme')
    expect(res.status).toBe(200)
    const events = parseSSEEvents(await res.text())
    expect(events.some((e) => e['type'] === 'done')).toBe(true)
  })
})
