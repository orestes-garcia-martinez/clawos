import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  app,
  buildSupabaseMock,
  mockCallLLM,
  mockCallLLMWithToolResult,
  mockRunWorkerCoverLetter,
  mockRunWorkerGapAnalysis,
  parseSSEEvents,
  resetRateLimit,
  VALID_BODY,
  MOCK_SESSION_STATE,
} from './_setup.js'

const TARGET_USER = '00000000-0000-0000-0000-000000000031'

const GAP_WORKER_RESULT = { result: { analysis: { overall_score: 0.85 } }, durationMs: 21 }
const COVER_WORKER_RESULT = { result: { content: 'Dear Hiring Team...' }, durationMs: 30 }

describe('POST /chat — tool target enforcement', () => {
  beforeEach(() => {
    resetRateLimit()
    vi.clearAllMocks()
    buildSupabaseMock({
      userId: TARGET_USER,
      tier: 'pro',
      entitlementTier: 'pro',
      entitlementStatus: 'active',
      sessionState: MOCK_SESSION_STATE,
    })
  })

  // ── Case 1: valid job_id → proceeds ────────────────────────────────────────
  it('proceeds directly when Claude provides a valid current-briefing job_id', async () => {
    mockCallLLM.mockResolvedValueOnce({
      type: 'tool_use',
      toolName: 'run_gap_analysis',
      toolUseId: 'tool-gap-1',
      toolInput: { job_id: 'job-acme-001' },
      provider: 'anthropic',
    })
    mockRunWorkerGapAnalysis.mockResolvedValueOnce(GAP_WORKER_RESULT)
    mockCallLLMWithToolResult.mockResolvedValueOnce({
      type: 'text',
      content: 'Here is the gap analysis for Acme.',
      provider: 'anthropic',
    })

    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...VALID_BODY, userId: TARGET_USER, message: 'Analyze Acme' }),
    })

    const events = parseSSEEvents(await res.text())
    const doneEvent = events.find((e) => e['type'] === 'done')

    expect(doneEvent?.['message']).toBe('Here is the gap analysis for Acme.')
    expect(mockRunWorkerGapAnalysis).toHaveBeenCalledTimes(1)
    // job_id passed to worker unchanged
    expect(mockCallLLMWithToolResult.mock.calls[0]?.[4]).toEqual({ job_id: 'job-acme-001' })
  })

  // ── Case 2: missing job_id + ordinal reference → resolves and proceeds ─────
  it('resolves a missing job_id from an ordinal user reference and proceeds', async () => {
    mockCallLLM.mockResolvedValueOnce({
      type: 'tool_use',
      toolName: 'run_gap_analysis',
      toolUseId: 'tool-gap-2',
      toolInput: {},
      provider: 'anthropic',
    })
    mockRunWorkerGapAnalysis.mockResolvedValueOnce(GAP_WORKER_RESULT)
    mockCallLLMWithToolResult.mockResolvedValueOnce({
      type: 'text',
      content: 'Here is the gap analysis for Beta.',
      provider: 'anthropic',
    })

    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({
        ...VALID_BODY,
        userId: TARGET_USER,
        message: 'Analyze the second one',
      }),
    })

    const events = parseSSEEvents(await res.text())
    const doneEvent = events.find((e) => e['type'] === 'done')

    expect(doneEvent?.['message']).toBe('Here is the gap analysis for Beta.')
    expect(mockRunWorkerGapAnalysis).toHaveBeenCalledTimes(1)
    // job_id overridden to second match
    expect(mockCallLLMWithToolResult.mock.calls[0]?.[4]).toEqual({ job_id: 'job-beta-002' })
  })

  // ── Case 3: hallucinated job_id + text reference → overridden and proceeds ─
  it('overrides a hallucinated cover-letter job_id using a company name reference', async () => {
    mockCallLLM.mockResolvedValueOnce({
      type: 'tool_use',
      toolName: 'run_cover_letter',
      toolUseId: 'tool-cover-3',
      toolInput: { job_id: 'hallucinated-job-999' },
      provider: 'anthropic',
    })
    mockRunWorkerCoverLetter.mockResolvedValueOnce(COVER_WORKER_RESULT)
    mockCallLLMWithToolResult.mockResolvedValueOnce({
      type: 'text',
      content: 'Here is your cover letter for Acme.',
      provider: 'anthropic',
    })

    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({
        ...VALID_BODY,
        userId: TARGET_USER,
        message: 'Write a cover letter for Acme',
      }),
    })

    const events = parseSSEEvents(await res.text())
    const doneEvent = events.find((e) => e['type'] === 'done')

    expect(doneEvent?.['message']).toBe('Here is your cover letter for Acme.')
    expect(mockRunWorkerCoverLetter).toHaveBeenCalledTimes(1)
    // hallucinated job_id overridden to Acme
    expect(mockCallLLMWithToolResult.mock.calls[0]?.[4]).toEqual({ job_id: 'job-acme-001' })
  })

  // ── Case 4: ambiguous multi-match → clarify, no worker call ───────────────
  it('returns a clarification and skips the worker when multiple matches are referenced', async () => {
    mockCallLLM.mockResolvedValueOnce({
      type: 'tool_use',
      toolName: 'run_gap_analysis',
      toolUseId: 'tool-gap-4',
      toolInput: { job_id: 'hallucinated-job-999' },
      provider: 'anthropic',
    })

    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({
        ...VALID_BODY,
        userId: TARGET_USER,
        message: 'Analyze Acme and Beta',
      }),
    })

    const events = parseSSEEvents(await res.text())
    const doneEvent = events.find((e) => e['type'] === 'done')

    expect(doneEvent?.['message']).toBe(
      'I can do one at a time. Which role do you want first: Acme or Beta?',
    )
    expect(mockRunWorkerGapAnalysis).not.toHaveBeenCalled()
    expect(mockCallLLMWithToolResult).not.toHaveBeenCalled()
  })

  // ── Case 5: no-match reference → clarify, no worker call ──────────────────
  it('returns a clarification and skips the worker when nothing matches the current briefing', async () => {
    mockCallLLM.mockResolvedValueOnce({
      type: 'tool_use',
      toolName: 'run_gap_analysis',
      toolUseId: 'tool-gap-5',
      toolInput: { job_id: 'hallucinated-job-999' },
      provider: 'anthropic',
    })

    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({
        ...VALID_BODY,
        userId: TARGET_USER,
        message: 'Analyze the Stripe role',
      }),
    })

    const events = parseSSEEvents(await res.text())
    const doneEvent = events.find((e) => e['type'] === 'done')

    expect(doneEvent?.['message']).toBe(
      "I couldn't match that to your current briefing. Tell me the company name or match number.",
    )
    expect(mockRunWorkerGapAnalysis).not.toHaveBeenCalled()
    expect(mockCallLLMWithToolResult).not.toHaveBeenCalled()
  })
})
