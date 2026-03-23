/**
 * chat.text.test.ts — POST /chat direct text response path tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  app,
  buildSupabaseMock,
  mockCallLLM,
  parseSSEEvents,
  resetRateLimit,
  VALID_BODY,
} from './_setup.js'

const DIRECT_TEXT_USER = '00000000-0000-0000-0000-000000000011'

beforeEach(() => {
  resetRateLimit()
})

describe('POST /chat -- direct text response path', () => {
  beforeEach(() => {
    buildSupabaseMock({ userId: DIRECT_TEXT_USER, tier: 'free' })
    mockCallLLM.mockResolvedValue({
      type: 'text',
      content: 'Here are some tips for your job search.',
      provider: 'anthropic',
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 with SSE stream', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...VALID_BODY, userId: DIRECT_TEXT_USER }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/event-stream')
  })

  it('emits a done event with the response message', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...VALID_BODY, userId: DIRECT_TEXT_USER }),
    })
    const text = await res.text()
    const events = parseSSEEvents(text)
    const doneEvent = events.find((e) => e['type'] === 'done')
    expect(doneEvent).toBeDefined()
    expect(doneEvent!['message']).toBe('Here are some tips for your job search.')
    expect(doneEvent!['sessionId']).toBeDefined()
  })

  it('emits progress events before done', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...VALID_BODY, userId: DIRECT_TEXT_USER }),
    })
    const text = await res.text()
    const events = parseSSEEvents(text)
    const progressEvents = events.filter((e) => e['type'] === 'progress')
    expect(progressEvents.length).toBeGreaterThan(0)
    const lastEvent = events.filter((e) => e['type'] === 'done' || e['type'] === 'error').pop()
    expect(lastEvent?.['type']).toBe('done')
  })
})
