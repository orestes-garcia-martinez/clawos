/**
 * chat.careerclaw.streaming.test.ts
 *
 * Tests for the token-streaming path introduced for the briefing format call.
 * Verifies that:
 *   1. chunk events are emitted before done
 *   2. done carries the full sanitized response, not raw chunks
 *   3. an LLM error during streaming sends an error event instead of done
 *   4. chunks emitted mid-stream are visible in the SSE body
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  app,
  buildSupabaseMock,
  mockCallLLM,
  mockCallLLMWithToolResultStream,
  mockIssueSkillAssertion,
  mockRunWorkerCareerclaw,
  parseSSEEvents,
  resetRateLimit,
  VALID_BODY,
  MOCK_BRIEFING,
} from './_setup.js'

const FREE_USER = '00000000-0000-0000-0000-000000000030'
const PRO_USER = '00000000-0000-0000-0000-000000000031'

const BRIEFING_TOOL_RESPONSE = {
  type: 'tool_use' as const,
  toolName: 'run_careerclaw',
  toolUseId: 'streaming_tool_001',
  toolInput: { topK: 3 },
  provider: 'anthropic' as const,
}

describe('POST /chat — briefing format streaming', () => {
  beforeEach(() => {
    resetRateLimit()
    mockIssueSkillAssertion.mockReset()
    mockRunWorkerCareerclaw.mockReset()
    mockCallLLM.mockReset()
    mockCallLLMWithToolResultStream.mockReset()

    mockIssueSkillAssertion.mockReturnValue('test-signed-assertion')
    mockRunWorkerCareerclaw.mockResolvedValue({ result: MOCK_BRIEFING, durationMs: 1500 })
  })

  it('emits chunk events followed by a done event', async () => {
    buildSupabaseMock({ userId: FREE_USER, tier: 'free' })
    mockCallLLM.mockResolvedValue(BRIEFING_TOOL_RESPONSE)

    mockCallLLMWithToolResultStream.mockImplementation(
      async (
        _sys: unknown,
        _msgs: unknown,
        _id: unknown,
        _name: unknown,
        _input: unknown,
        _result: unknown,
        onChunk: (text: string) => Promise<void>,
      ) => {
        await onChunk('Found ')
        await onChunk('3 matches.')
        return { type: 'text', content: 'Found 3 matches.', provider: 'anthropic' }
      },
    )

    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...VALID_BODY, userId: FREE_USER }),
    })

    const body = await res.text()
    const events = parseSSEEvents(body)

    expect(res.status).toBe(200)

    const chunkEvents = events.filter((e) => e['type'] === 'chunk')
    expect(chunkEvents).toHaveLength(2)
    expect(chunkEvents[0]).toMatchObject({ type: 'chunk', text: 'Found ' })
    expect(chunkEvents[1]).toMatchObject({ type: 'chunk', text: '3 matches.' })

    const doneEvent = events.find((e) => e['type'] === 'done')
    expect(doneEvent).toBeDefined()
    expect(doneEvent!['message']).toBe('Found 3 matches.')
  })

  it('chunk events appear before the done event in stream order', async () => {
    buildSupabaseMock({ userId: FREE_USER, tier: 'free' })
    mockCallLLM.mockResolvedValue(BRIEFING_TOOL_RESPONSE)

    mockCallLLMWithToolResultStream.mockImplementation(
      async (
        _sys: unknown,
        _msgs: unknown,
        _id: unknown,
        _name: unknown,
        _input: unknown,
        _result: unknown,
        onChunk: (text: string) => Promise<void>,
      ) => {
        await onChunk('Token A')
        await onChunk('Token B')
        return { type: 'text', content: 'Token AToken B', provider: 'anthropic' }
      },
    )

    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...VALID_BODY, userId: FREE_USER }),
    })

    const body = await res.text()
    const events = parseSSEEvents(body)

    const firstChunkIdx = events.findIndex((e) => e['type'] === 'chunk')
    const doneIdx = events.findIndex((e) => e['type'] === 'done')

    expect(firstChunkIdx).toBeGreaterThanOrEqual(0)
    expect(doneIdx).toBeGreaterThan(firstChunkIdx)
  })

  it('done message reflects sanitized content even if chunks had raw text', async () => {
    buildSupabaseMock({ userId: FREE_USER, tier: 'free' })
    mockCallLLM.mockResolvedValue(BRIEFING_TOOL_RESPONSE)

    // The stream emits raw text; the buffered content is what sanitizeFormatOutput sees.
    // For this test, the mock returns a clean string (sanitization is a no-op here)
    // — just verify done.message matches the full buffered content.
    const fullContent = 'Here are your 3 matches.'
    mockCallLLMWithToolResultStream.mockImplementation(
      async (
        _sys: unknown,
        _msgs: unknown,
        _id: unknown,
        _name: unknown,
        _input: unknown,
        _result: unknown,
        onChunk: (text: string) => Promise<void>,
      ) => {
        await onChunk('Here are your ')
        await onChunk('3 matches.')
        return { type: 'text', content: fullContent, provider: 'anthropic' }
      },
    )

    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...VALID_BODY, userId: FREE_USER }),
    })

    const body = await res.text()
    const events = parseSSEEvents(body)

    const doneEvent = events.find((e) => e['type'] === 'done')
    expect(doneEvent).toBeDefined()
    expect(doneEvent!['message']).toBe(fullContent)
  })

  it('sends an error event when callLLMWithToolResultStream throws', async () => {
    buildSupabaseMock({ userId: FREE_USER, tier: 'free' })
    mockCallLLM.mockResolvedValue(BRIEFING_TOOL_RESPONSE)

    mockCallLLMWithToolResultStream.mockRejectedValue(new Error('Anthropic connection timeout'))

    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...VALID_BODY, userId: FREE_USER }),
    })

    const body = await res.text()
    const events = parseSSEEvents(body)

    expect(res.status).toBe(200) // SSE streams always open with 200
    const errorEvent = events.find((e) => e['type'] === 'error')
    expect(errorEvent).toBeDefined()
    expect(errorEvent!['code']).toBe('LLM_ERROR')
    expect(events.some((e) => e['type'] === 'done')).toBe(false)
  })

  it('works correctly for pro-tier users (topK 10)', async () => {
    buildSupabaseMock({
      userId: PRO_USER,
      tier: 'free',
      entitlementTier: 'pro',
      entitlementStatus: 'active',
    })
    mockCallLLM.mockResolvedValue({
      ...BRIEFING_TOOL_RESPONSE,
      toolUseId: 'streaming_tool_pro',
      toolInput: { topK: 10 },
    })

    mockCallLLMWithToolResultStream.mockImplementation(
      async (
        _sys: unknown,
        _msgs: unknown,
        _id: unknown,
        _name: unknown,
        _input: unknown,
        _result: unknown,
        onChunk: (text: string) => Promise<void>,
      ) => {
        await onChunk('Pro briefing result.')
        return { type: 'text', content: 'Pro briefing result.', provider: 'anthropic' }
      },
    )

    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...VALID_BODY, userId: PRO_USER }),
    })

    const body = await res.text()
    const events = parseSSEEvents(body)

    expect(events.some((e) => e['type'] === 'chunk')).toBe(true)
    expect(events.find((e) => e['type'] === 'done')).toMatchObject({
      type: 'done',
      message: 'Pro briefing result.',
    })
  })
})
