import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  app,
  buildSupabaseMock,
  mockCallLLM,
  parseSSEEvents,
  resetRateLimit,
  VALID_BODY,
  MOCK_SESSION_STATE,
} from './_setup.js'

const GROUND_USER = '00000000-0000-0000-0000-000000000021'

describe('POST /chat — grounded briefing follow-up context', () => {
  beforeEach(() => {
    resetRateLimit()
    vi.clearAllMocks()
    buildSupabaseMock({
      userId: GROUND_USER,
      tier: 'free',
      sessionState: MOCK_SESSION_STATE,
    })
  })

  it('injects active briefing ground-truth context when a briefing exists', async () => {
    mockCallLLM.mockResolvedValueOnce({
      type: 'text',
      content: 'Acme is the stronger match.',
      provider: 'anthropic',
    })

    const res = await app.request('/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid',
      },
      body: JSON.stringify({
        ...VALID_BODY,
        userId: GROUND_USER,
        message: 'What were my top matches?',
      }),
    })

    await res.text()

    const llmMessages = mockCallLLM.mock.calls[0]![1] as Array<{ role: string; content: string }>
    const groundingMessage = llmMessages.find((m) =>
      m.content.includes('[Active briefing ground truth'),
    )

    expect(groundingMessage).toBeDefined()
    expect(groundingMessage?.content).toContain('job_id=job-acme-001')
    expect(groundingMessage?.content).toContain('company=Acme')
    expect(groundingMessage?.content).toContain('score=92%')
    expect(groundingMessage?.content).toContain('job_id=job-beta-002')
    expect(groundingMessage?.content).toContain('cover_letter_cached=')
  })

  it('injects a multi-match hint when the user references more than one cached match', async () => {
    mockCallLLM.mockResolvedValueOnce({
      type: 'text',
      content: 'Acme is stronger overall, but Beta may be worth a deeper look.',
      provider: 'anthropic',
    })

    const res = await app.request('/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid',
      },
      body: JSON.stringify({
        ...VALID_BODY,
        userId: GROUND_USER,
        message: 'Compare Acme and Beta for me',
      }),
    })

    await res.text()

    const llmMessages = mockCallLLM.mock.calls[0]![1] as Array<{ role: string; content: string }>
    const hintMessage = llmMessages.find((m) =>
      m.content.includes('[The user referenced multiple current-briefing matches in this turn]'),
    )

    expect(hintMessage).toBeDefined()
    expect(hintMessage?.content).toContain('job_id=job-acme-001')
    expect(hintMessage?.content).toContain('job_id=job-beta-002')
    expect(hintMessage?.content).toContain('ask them to choose one match first')
  })

  it('injects a single-match hint when the user references exactly one cached match', async () => {
    mockCallLLM.mockResolvedValueOnce({
      type: 'text',
      content: 'Acme is your strongest current match.',
      provider: 'anthropic',
    })

    const res = await app.request('/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid',
      },
      body: JSON.stringify({
        ...VALID_BODY,
        userId: GROUND_USER,
        message: 'Tell me more about Acme',
      }),
    })

    await res.text()

    const llmMessages = mockCallLLM.mock.calls[0]![1] as Array<{ role: string; content: string }>
    const hintMessage = llmMessages.find((m) =>
      m.content.includes('[Referenced current-briefing match for this turn]'),
    )

    expect(hintMessage).toBeDefined()
    expect(hintMessage?.content).toContain('rank=1 | job_id=job-acme-001')
    expect(hintMessage?.content).toContain('use this exact job_id')
  })

  it('still returns a normal done event for a grounded follow-up question', async () => {
    mockCallLLM.mockResolvedValueOnce({
      type: 'text',
      content: 'Acme is your top match at 92%, followed by Beta at 85%.',
      provider: 'anthropic',
    })

    const res = await app.request('/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid',
      },
      body: JSON.stringify({
        ...VALID_BODY,
        userId: GROUND_USER,
        message: 'What were my top matches again?',
      }),
    })

    const text = await res.text()
    const events = parseSSEEvents(text)
    const doneEvent = events.find((e) => e['type'] === 'done')

    expect(doneEvent).toBeDefined()
    expect(doneEvent?.['message']).toBe('Acme is your top match at 92%, followed by Beta at 85%.')
  })

  it('injects a server-side resolved intent hint for a single-match analysis request', async () => {
    mockCallLLM.mockResolvedValueOnce({
      type: 'text',
      content: 'I can analyze Beta more deeply next.',
      provider: 'anthropic',
    })

    const res = await app.request('/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid',
      },
      body: JSON.stringify({
        ...VALID_BODY,
        userId: GROUND_USER,
        message: 'Analyze the second one',
      }),
    })

    await res.text()

    const llmMessages = mockCallLLM.mock.calls[0]![1] as Array<{ role: string; content: string }>
    const resolvedIntentMessage = llmMessages.find((m) =>
      m.content.includes('[Server-side resolved intent hint]'),
    )

    expect(resolvedIntentMessage).toBeDefined()
    expect(resolvedIntentMessage?.content).toContain('kind=single_match_analysis')
    expect(resolvedIntentMessage?.content).toContain('resolved_job_id=job-beta-002')
  })
})
