/**
 * chat.errors.test.ts — POST /chat error path tests (worker + LLM failures).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  app,
  buildSupabaseMock,
  mockCallLLM,
  mockCallLLMWithToolResult,
  mockRunWorkerCareerclaw,
  parseSSEEvents,
  resetRateLimit,
  VALID_BODY,
  MOCK_BRIEFING,
} from './_setup.js'

const ERR_USER = '00000000-0000-0000-0000-000000000015'

beforeEach(() => {
  resetRateLimit()
})

describe('POST /chat -- error paths', () => {
  beforeEach(() => {
    buildSupabaseMock({ userId: ERR_USER, tier: 'free' })
    mockCallLLM.mockResolvedValue({
      type: 'tool_use',
      toolName: 'run_careerclaw',
      toolUseId: 'tool_err',
      toolInput: {
        topK: 3,
        includeOutreach: false,
        includeCoverLetter: false,
        includeGapAnalysis: false,
      },
      provider: 'anthropic',
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('emits error event on worker timeout', async () => {
    const { WorkerError } = await import('../worker-client.js')
    mockRunWorkerCareerclaw.mockRejectedValueOnce(new WorkerError('timeout', 504, true))
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...VALID_BODY, userId: ERR_USER }),
    })
    const text = await res.text()
    const events = parseSSEEvents(text)
    const errorEvent = events.find((e) => e['type'] === 'error')
    expect(errorEvent).toBeDefined()
    expect(errorEvent!['code']).toBe('WORKER_TIMEOUT')
  })

  it('emits error event on worker failure (non-timeout)', async () => {
    const { WorkerError } = await import('../worker-client.js')
    mockRunWorkerCareerclaw.mockRejectedValueOnce(new WorkerError('internal error', 500, false))
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...VALID_BODY, userId: ERR_USER }),
    })
    const text = await res.text()
    const events = parseSSEEvents(text)
    const errorEvent = events.find((e) => e['type'] === 'error')
    expect(errorEvent!['code']).toBe('WORKER_ERROR')
  })

  it('emits error event when second LLM call (format) fails', async () => {
    mockRunWorkerCareerclaw.mockResolvedValueOnce({ briefing: MOCK_BRIEFING, durationMs: 1500 })
    mockCallLLMWithToolResult.mockRejectedValueOnce(new Error('LLM unavailable'))
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...VALID_BODY, userId: ERR_USER }),
    })
    const text = await res.text()
    const events = parseSSEEvents(text)
    const errorEvent = events.find((e) => e['type'] === 'error')
    expect(errorEvent!['code']).toBe('LLM_ERROR')
  })
})
