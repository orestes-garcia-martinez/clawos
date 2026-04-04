/**
 * chat.cover-letter-retry.test.ts — Unit tests for P1b template retry logic.
 *
 * Coverage:
 *   - Template result + precomputedGap → retry fires, LLM result used
 *   - Template result + precomputedGap → retry also template → original kept
 *   - Template result + precomputedGap → retry throws → original kept
 *   - Template result + NO precomputedGap → no retry, template used directly
 *   - Non-template result → no retry
 *
 * Run: npm test (from apps/api/) or turbo run test
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  app,
  buildSupabaseMock,
  mockCallLLM,
  mockCallLLMWithToolResult,
  mockIssueSkillAssertion,
  mockRunWorkerCoverLetter,
  parseSSEEvents,
  resetRateLimit,
  MOCK_SESSION_STATE,
} from './_setup.js'

const PRO_USER = '00000000-0000-0000-0000-000000000050'

const TEMPLATE_RESULT = {
  body: 'Dear Acme hiring team, I am writing to apply...',
  tone: 'professional',
  is_template: true,
  match_score: 0.32,
  keyword_coverage: { top_signals: ['TypeScript'], top_gaps: ['Go'] },
  _meta: {
    provider: 'template',
    model: 'deterministic',
    attempts: 0,
    fallback_reason: 'llm_chain_exhausted',
    latency_ms: 50,
  },
}

const LLM_RESULT = {
  body: 'Dear Acme team, your need for distributed systems expertise...',
  tone: 'professional',
  is_template: false,
  match_score: 0.92,
  keyword_coverage: { top_signals: ['TypeScript', 'React'], top_gaps: ['Go'] },
  _meta: {
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    attempts: 1,
    fallback_reason: null,
    latency_ms: 2800,
  },
}

const CACHED_GAP_RESULT = {
  fit_score: 0.91,
  fit_score_unweighted: 0.86,
  signals: { keywords: ['TypeScript', 'React'], phrases: [] },
  gaps: { keywords: ['Go'], phrases: [] },
  summary: {
    top_signals: { keywords: ['TypeScript', 'React'], phrases: [] },
    top_gaps: { keywords: ['Go'], phrases: [] },
  },
}

function setupProUser(sessionState?: object) {
  buildSupabaseMock({
    userId: PRO_USER,
    tier: 'pro',
    entitlementTier: 'pro',
    entitlementStatus: 'active',
    sessionState: sessionState ?? MOCK_SESSION_STATE,
  })

  mockIssueSkillAssertion.mockReturnValue('test-assertion')

  // First Claude call → run_cover_letter tool_use
  mockCallLLM.mockResolvedValue({
    type: 'tool_use',
    toolName: 'run_cover_letter',
    toolUseId: 'tool_cl_001',
    toolInput: { job_id: 'job-acme-001' },
    provider: 'anthropic',
  })

  // Second Claude call (format) → text
  mockCallLLMWithToolResult.mockResolvedValue({
    type: 'text',
    content: 'Here is your cover letter for Acme.',
    provider: 'anthropic',
  })
}

function makeRequest(message = 'Write a cover letter for Acme') {
  return app.request('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
    body: JSON.stringify({ userId: PRO_USER, channel: 'web', message }),
  })
}

describe('POST /chat — P1b cover letter template retry', () => {
  beforeEach(() => {
    resetRateLimit()
    mockCallLLM.mockReset()
    mockCallLLMWithToolResult.mockReset()
    mockIssueSkillAssertion.mockReset()
    mockRunWorkerCoverLetter.mockReset()
  })

  it('retries when template returned with precomputedGap, uses LLM result', async () => {
    setupProUser()

    // First call → template, second call → LLM
    mockRunWorkerCoverLetter
      .mockResolvedValueOnce({ result: TEMPLATE_RESULT, durationMs: 100 })
      .mockResolvedValueOnce({ result: LLM_RESULT, durationMs: 3000 })

    const res = await makeRequest()
    const events = parseSSEEvents(await res.text())

    expect(res.status).toBe(200)
    // Worker called twice (initial + retry)
    expect(mockRunWorkerCoverLetter).toHaveBeenCalledTimes(2)

    // The format call receives the LLM result (not the template)
    const formatCallArgs = mockCallLLMWithToolResult.mock.calls[0]
    const toolResult = formatCallArgs?.[5] as Record<string, unknown> | undefined
    expect(toolResult?.['is_template']).toBe(false)

    expect(events.some((e) => e['type'] === 'done')).toBe(true)
  })

  it('keeps template when retry also returns template', async () => {
    setupProUser()

    mockRunWorkerCoverLetter
      .mockResolvedValueOnce({ result: TEMPLATE_RESULT, durationMs: 100 })
      .mockResolvedValueOnce({ result: TEMPLATE_RESULT, durationMs: 100 })

    const res = await makeRequest()
    const events = parseSSEEvents(await res.text())

    expect(res.status).toBe(200)
    expect(mockRunWorkerCoverLetter).toHaveBeenCalledTimes(2)
    expect(events.some((e) => e['type'] === 'done')).toBe(true)
  })

  it('keeps template when retry throws', async () => {
    setupProUser()

    mockRunWorkerCoverLetter
      .mockResolvedValueOnce({ result: TEMPLATE_RESULT, durationMs: 100 })
      .mockRejectedValueOnce(new Error('Worker timeout'))

    const res = await makeRequest()
    const events = parseSSEEvents(await res.text())

    expect(res.status).toBe(200)
    expect(mockRunWorkerCoverLetter).toHaveBeenCalledTimes(2)
    // Should still get a done event (not error)
    expect(events.some((e) => e['type'] === 'done')).toBe(true)
  })

  it('does not retry when no precomputedGap exists', async () => {
    // Session state with gap results cleared
    const stateWithoutGap = {
      ...MOCK_SESSION_STATE,
      gapResults: {},
    }
    setupProUser(stateWithoutGap)

    mockRunWorkerCoverLetter.mockResolvedValue({
      result: TEMPLATE_RESULT,
      durationMs: 100,
    })

    const res = await makeRequest()
    const events = parseSSEEvents(await res.text())

    expect(res.status).toBe(200)
    // Worker called only once — no retry
    expect(mockRunWorkerCoverLetter).toHaveBeenCalledTimes(1)
    expect(events.some((e) => e['type'] === 'done')).toBe(true)
  })

  it('does not retry when result is not a template', async () => {
    setupProUser()

    mockRunWorkerCoverLetter.mockResolvedValue({
      result: LLM_RESULT,
      durationMs: 3000,
    })

    const res = await makeRequest()
    const events = parseSSEEvents(await res.text())

    expect(res.status).toBe(200)
    // Worker called only once — no retry needed
    expect(mockRunWorkerCoverLetter).toHaveBeenCalledTimes(1)
    expect(events.some((e) => e['type'] === 'done')).toBe(true)
  })

  it('reuses the cached gap analysis result shape, not the wrapped report shape', async () => {
    const sessionStateWithCachedGap = {
      ...MOCK_SESSION_STATE,
      gapResults: {
        'job-acme-001': CACHED_GAP_RESULT,
      },
    }
    setupProUser(sessionStateWithCachedGap)

    mockRunWorkerCoverLetter.mockResolvedValue({
      result: LLM_RESULT,
      durationMs: 3000,
    })

    const res = await makeRequest()
    const events = parseSSEEvents(await res.text())

    expect(res.status).toBe(200)
    expect(mockRunWorkerCoverLetter).toHaveBeenCalledTimes(1)
    expect(mockRunWorkerCoverLetter).toHaveBeenCalledWith({
      assertion: 'test-assertion',
      input: expect.objectContaining({
        precomputedGap: CACHED_GAP_RESULT,
      }),
    })

    const workerInput = mockRunWorkerCoverLetter.mock.calls[0]?.[0] as {
      input?: { precomputedGap?: Record<string, unknown> }
    }
    expect(workerInput.input?.precomputedGap).not.toHaveProperty('analysis')
    expect(events.some((e) => e['type'] === 'done')).toBe(true)
  })
})
