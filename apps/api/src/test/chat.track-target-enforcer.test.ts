import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  app,
  buildSupabaseMock,
  mockCallLLM,
  mockCallLLMWithToolResult,
  mockFrom,
  parseSSEEvents,
  resetRateLimit,
  VALID_BODY,
  MOCK_SESSION_STATE,
} from './_setup.js'

const TARGET_USER = '00000000-0000-0000-0000-000000000041'

let lastUpsertArgs: Record<string, unknown> | null = null
let lastUpdateArgs: Record<string, unknown> | null = null

function buildTrackingMockWithBriefing() {
  buildSupabaseMock({
    userId: TARGET_USER,
    tier: 'pro',
    entitlementTier: 'pro',
    entitlementStatus: 'active',
    sessionState: MOCK_SESSION_STATE,
  })

  const originalImpl = mockFrom.getMockImplementation()!
  mockFrom.mockImplementation((table: string) => {
    if (table === 'careerclaw_job_tracking') {
      return {
        upsert: (row: Record<string, unknown>) => {
          lastUpsertArgs = row
          return Promise.resolve({ error: null })
        },
        update: (fields: Record<string, unknown>) => {
          lastUpdateArgs = fields
          return {
            eq: (_col1: string, _val1: unknown) => ({
              eq: (_col2: string, _val2: unknown) => ({
                select: () => Promise.resolve({ data: [{ title: 'Staff Engineer' }], error: null }),
              }),
              ilike: (_col2: string, _val2: unknown) => ({
                select: () => Promise.resolve({ data: [{ title: 'Staff Engineer' }], error: null }),
              }),
            }),
          }
        },
        select: () => ({
          eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
        }),
      }
    }
    return originalImpl(table)
  })
}

describe('POST /chat — track_application target enforcement', () => {
  beforeEach(() => {
    resetRateLimit()
    vi.clearAllMocks()
    lastUpsertArgs = null
    lastUpdateArgs = null
    buildTrackingMockWithBriefing()
  })

  it('overrides a hallucinated save target using the referenced current briefing match', async () => {
    mockCallLLM.mockResolvedValueOnce({
      type: 'tool_use',
      toolName: 'track_application',
      toolUseId: 'tool-track-save-1',
      toolInput: {
        action: 'save',
        job_id: 'hallucinated-job-999',
        title: 'Fake Title',
        company: 'FakeCo',
        status: 'saved',
      },
      provider: 'anthropic',
    })
    mockCallLLMWithToolResult.mockResolvedValueOnce({
      type: 'text',
      content: 'Saved Beta to your tracker.',
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
        userId: TARGET_USER,
        message: 'Save the second one to my tracker',
      }),
    })

    const events = parseSSEEvents(await res.text())
    const doneEvent = events.find((event) => event['type'] === 'done')

    expect(doneEvent?.['message']).toBe('Saved Beta to your tracker.')
    expect(lastUpsertArgs).toMatchObject({
      user_id: TARGET_USER,
      job_id: 'job-beta-002',
      title: 'Staff Engineer',
      company: 'Beta',
      status: 'saved',
      url: 'https://beta.com',
    })
    expect(mockCallLLMWithToolResult.mock.calls[0]?.[4]).toEqual({
      action: 'save',
      job_id: 'job-beta-002',
      title: 'Staff Engineer',
      company: 'Beta',
      status: 'saved',
      url: 'https://beta.com',
    })
  })

  it('overrides a hallucinated update_status target using the referenced current briefing match', async () => {
    mockCallLLM.mockResolvedValueOnce({
      type: 'tool_use',
      toolName: 'track_application',
      toolUseId: 'tool-track-update-1',
      toolInput: {
        action: 'update_status',
        job_id: 'hallucinated-job-999',
        title: 'Fake Title',
        company: 'FakeCo',
        status: 'applied',
      },
      provider: 'anthropic',
    })
    mockCallLLMWithToolResult.mockResolvedValueOnce({
      type: 'text',
      content: 'Marked Beta as applied.',
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
        userId: TARGET_USER,
        message: 'Mark the second one as applied',
      }),
    })

    const events = parseSSEEvents(await res.text())
    const doneEvent = events.find((event) => event['type'] === 'done')

    expect(doneEvent?.['message']).toBe('Marked Beta as applied.')
    expect(lastUpdateArgs).toEqual({ status: 'applied' })
    expect(mockCallLLMWithToolResult.mock.calls[0]?.[4]).toEqual({
      action: 'update_status',
      job_id: 'job-beta-002',
      title: 'Staff Engineer',
      company: 'Beta',
      status: 'applied',
      url: 'https://beta.com',
    })
  })

  it('list action bypasses target enforcement and returns tracker contents unchanged', async () => {
    mockCallLLM.mockResolvedValueOnce({
      type: 'tool_use',
      toolName: 'track_application',
      toolUseId: 'tool-track-list-1',
      toolInput: { action: 'list' },
      provider: 'anthropic',
    })
    mockCallLLMWithToolResult.mockResolvedValueOnce({
      type: 'text',
      content: 'You have no tracked applications yet.',
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
        userId: TARGET_USER,
        message: 'Show me my tracked applications',
      }),
    })

    const events = parseSSEEvents(await res.text())
    const doneEvent = events.find((event) => event['type'] === 'done')

    expect(doneEvent?.['message']).toBe('You have no tracked applications yet.')
    expect(lastUpsertArgs).toBeNull()
    expect(lastUpdateArgs).toBeNull()
    // Second LLM call was made (list path always calls callLLMWithToolResult)
    expect(mockCallLLMWithToolResult).toHaveBeenCalledTimes(1)
    // effectiveTrackInput passed to the second LLM call is the bare list action
    expect(mockCallLLMWithToolResult.mock.calls[0]?.[4]).toEqual({ action: 'list' })
  })

  it('returns a clarification instead of writing when multiple briefing matches are referenced', async () => {
    mockCallLLM.mockResolvedValueOnce({
      type: 'tool_use',
      toolName: 'track_application',
      toolUseId: 'tool-track-save-2',
      toolInput: {
        action: 'save',
        job_id: 'hallucinated-job-999',
        title: 'Fake Title',
        company: 'FakeCo',
        status: 'saved',
      },
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
        userId: TARGET_USER,
        message: 'Save Acme and Beta to my tracker',
      }),
    })

    const events = parseSSEEvents(await res.text())
    const doneEvent = events.find((event) => event['type'] === 'done')

    expect(doneEvent?.['message']).toBe(
      'I can track one role at a time. Which role do you want first: Acme or Beta?',
    )
    expect(lastUpsertArgs).toBeNull()
    expect(lastUpdateArgs).toBeNull()
    expect(mockCallLLMWithToolResult).not.toHaveBeenCalled()
  })
})
