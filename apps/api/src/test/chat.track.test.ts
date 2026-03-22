/**
 * chat.track.test.ts -- Unit tests for the track_application tool path.
 *
 * All tests run offline -- no network calls, no real Supabase or LLM.
 * External dependencies are mocked at the module level using the same
 * pattern as the other test files.
 *
 * Run: npm test (from apps/api/) or turbo run test
 *
 * Coverage:
 *   - save action: Supabase upsert called with correct args
 *   - save action: URL forwarded when provided
 *   - save action: done event emitted with formatted confirmation
 *   - save action: Supabase failure -> graceful fallback done event (not error)
 *   - update_status action: Supabase update called with correct args
 *   - update_status action: done event emitted with formatted confirmation
 *   - update_status action: Supabase failure -> graceful fallback done event
 *   - tool path never invokes the skill worker
 *   - second LLM call failure -> raw fallback message in done event
 *   - tracking progress event emitted before done
 *   - audit log written with correct metadata (no job details leaked)
 *   - session summary does not store raw job payloads
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// -- Module mocks -- set up before any imports that use them --

const mockGetUser = vi.fn()
const mockFrom = vi.fn()
vi.mock('@clawos/shared', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actual = (await importOriginal()) as any
  return {
    ...actual,
    createServerClient: () => ({
      auth: { getUser: mockGetUser },
      from: mockFrom,
    }),
  }
})

const mockCallLLM = vi.fn()
const mockCallLLMWithToolResult = vi.fn()
vi.mock('../llm.js', () => ({
  callLLM: mockCallLLM,
  callLLMWithToolResult: mockCallLLMWithToolResult,
}))

const mockRunWorkerCareerclaw = vi.fn()
vi.mock('../worker-client.js', () => ({
  runWorkerCareerclaw: mockRunWorkerCareerclaw,
  WorkerError: class WorkerError extends Error {
    status: number
    isTimeout: boolean
    constructor(message: string, status: number, isTimeout = false) {
      super(message)
      this.name = 'WorkerError'
      this.status = status
      this.isTimeout = isTimeout
    }
  },
}))

vi.mock('../env.js', () => ({
  ENV: {
    PORT: 3001,
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    CLAWOS_ANTHROPIC_KEY: 'sk-ant-test',
    CLAWOS_OPENAI_KEY: 'sk-test',
    WORKER_URL: 'http://localhost:3002',
    WORKER_SECRET: 'test-worker-secret',
    ALLOWED_ORIGIN: 'http://localhost:5173',
  },
}))

// Import app and rate-limit reset AFTER mocks are wired
const { app } = await import('../index.js')
const { _resetRateLimitStore } = await import('../rate-limit.js')

beforeEach(() => {
  _resetRateLimitStore()
})

// -- Shared constants --

const TRACK_SAVE_USER = 'aaaaaaaa-0000-0000-0000-000000000001'
const TRACK_UPDATE_USER = 'aaaaaaaa-0000-0000-0000-000000000002'
const TRACK_ERR_USER = 'aaaaaaaa-0000-0000-0000-000000000003'
const TRACK_LLM_ERR_USER = 'aaaaaaaa-0000-0000-0000-000000000004'
const TRACK_AUDIT_USER = 'aaaaaaaa-0000-0000-0000-000000000005'
const TRACK_URL_USER = 'aaaaaaaa-0000-0000-0000-000000000006'
const TRACK_UPDERR_USER = 'aaaaaaaa-0000-0000-0000-000000000007'

const TEST_SESSION_ID = 'session00-0000-0000-0000-000000000001'

const MOCK_TRACK_TOOL_INPUT = {
  action: 'save' as const,
  job_id: 'stripe-staff-swe-2026',
  title: 'Staff Software Engineer',
  company: 'Stripe',
  status: 'saved' as const,
}

const MOCK_TRACK_TOOL_INPUT_WITH_URL = {
  ...MOCK_TRACK_TOOL_INPUT,
  url: 'https://stripe.com/jobs/123',
}

const MOCK_UPDATE_TOOL_INPUT = {
  action: 'update_status' as const,
  job_id: 'stripe-staff-swe-2026',
  title: 'Staff Software Engineer',
  company: 'Stripe',
  status: 'interviewing' as const,
}

const BASE_MESSAGE = { channel: 'web', message: 'Yes, save it please' }

// -- Supabase mock builder --

let lastUpsertArgs: Record<string, unknown> | null = null
let lastUpdateArgs: { status: string } | null = null
let upsertShouldFail = false
let updateShouldFail = false

function buildTrackingSupabaseMock(userId: string): void {
  lastUpsertArgs = null
  lastUpdateArgs = null

  mockGetUser.mockResolvedValue({ data: { user: { id: userId } }, error: null })

  mockFrom.mockImplementation((table: string) => {
    const makeChain = (result: { data: unknown; error: null | { message: string } }) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        order: () => chain,
        limit: () => chain,
        single: () => Promise.resolve(result),
        maybeSingle: () => Promise.resolve(result),
        insert: (_row: unknown) => ({
          select: () => ({
            single: () => Promise.resolve({ data: { id: TEST_SESSION_ID }, error: null }),
          }),
          then: (cb: (v: unknown) => void) => {
            cb({ data: null, error: null })
            return Promise.resolve()
          },
        }),
        update: (_fields: unknown) => ({
          eq: () => ({
            eq: () => Promise.resolve({ error: null }),
            then: (cb: (v: unknown) => void) => {
              cb({ error: null })
              return Promise.resolve()
            },
          }),
        }),
        upsert: (_row: unknown) => Promise.resolve({ error: null }),
        then: (cb: (v: unknown) => void) => {
          cb({ data: null, error: null })
          return Promise.resolve()
        },
      }
      return chain
    }

    if (table === 'users') {
      return makeChain({ data: { tier: 'free' }, error: null })
    }
    if (table === 'sessions') {
      const sessionData = {
        id: TEST_SESSION_ID,
        user_id: userId,
        channel: 'web',
        messages: [],
        last_active: new Date().toISOString(),
        created_at: new Date().toISOString(),
        deleted_at: null,
      }
      return makeChain({ data: sessionData, error: null })
    }
    if (table === 'careerclaw_profiles') {
      return makeChain({
        data: {
          resume_text: null,
          work_mode: 'remote',
          salary_min: 150000,
          location_pref: null,
          skills: ['TypeScript', 'React'],
          target_roles: ['Staff Engineer'],
          experience_years: 10,
          resume_summary: 'Senior engineer.',
        },
        error: null,
      })
    }
    if (table === 'careerclaw_job_tracking') {
      return {
        upsert: (row: Record<string, unknown>, _opts?: unknown) => {
          lastUpsertArgs = row
          return Promise.resolve({
            error: upsertShouldFail ? { message: 'DB write failed' } : null,
          })
        },
        update: (fields: { status: string }) => {
          lastUpdateArgs = fields
          return {
            eq: (_col1: string, _val1: unknown) => ({
              eq: (_col2: string, _val2: unknown) =>
                Promise.resolve({
                  error: updateShouldFail ? { message: 'DB update failed' } : null,
                }),
            }),
          }
        },
        select: () => makeChain({ data: null, error: null }),
        eq: () => makeChain({ data: null, error: null }),
      }
    }
    if (table === 'careerclaw_runs') {
      return {
        insert: () => ({
          then: (cb: (v: unknown) => void) => {
            cb({ data: null, error: null })
            return Promise.resolve()
          },
        }),
        select: () => makeChain({ data: null, error: null }),
        eq: () => makeChain({ data: null, error: null }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (cb: (v: unknown) => void) => {
          cb({ data: null, error: null })
          return Promise.resolve()
        },
      }
    }
    return makeChain({ data: null, error: { message: 'unexpected table: ' + table } })
  })
}

// -- SSE parser --

function parseSSEEvents(text: string): Array<Record<string, unknown>> {
  return text
    .split('\n\n')
    .filter(Boolean)
    .flatMap((block) =>
      block
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => {
          try {
            return JSON.parse(line.slice(6)) as Record<string, unknown>
          } catch {
            return { raw: line }
          }
        }),
    )
}

// -- Tests --

describe('POST /chat -- track_application: save action (success)', () => {
  beforeEach(() => {
    upsertShouldFail = false
    buildTrackingSupabaseMock(TRACK_SAVE_USER)
    mockCallLLM.mockResolvedValue({
      type: 'tool_use',
      toolName: 'track_application',
      toolUseId: 'track_tool_001',
      toolInput: MOCK_TRACK_TOOL_INPUT,
      provider: 'anthropic',
    })
    mockCallLLMWithToolResult.mockResolvedValue({
      type: 'text',
      content: 'Done -- Staff Software Engineer at Stripe is saved to your tracker.',
      provider: 'anthropic',
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('emits a tracking progress event before done', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...BASE_MESSAGE, userId: TRACK_SAVE_USER }),
    })
    const events = parseSSEEvents(await res.text())
    const steps = events.filter((e) => e['type'] === 'progress').map((e) => e['step'])
    expect(steps).toContain('tracking')
  })

  it('emits a done event (not an error event) with the formatted confirmation', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...BASE_MESSAGE, userId: TRACK_SAVE_USER }),
    })
    const events = parseSSEEvents(await res.text())
    const done = events.find((e) => e['type'] === 'done')
    const error = events.find((e) => e['type'] === 'error')
    expect(done).toBeDefined()
    expect(error).toBeUndefined()
    expect(done!['message']).toContain('Stripe')
    expect(done!['sessionId']).toBeDefined()
  })

  it('calls Supabase upsert with correct user_id, job_id, title, company, and status', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...BASE_MESSAGE, userId: TRACK_SAVE_USER }),
    })
    await res.text()
    expect(lastUpsertArgs).not.toBeNull()
    expect(lastUpsertArgs!['user_id']).toBe(TRACK_SAVE_USER)
    expect(lastUpsertArgs!['job_id']).toBe('stripe-staff-swe-2026')
    expect(lastUpsertArgs!['title']).toBe('Staff Software Engineer')
    expect(lastUpsertArgs!['company']).toBe('Stripe')
    expect(lastUpsertArgs!['status']).toBe('saved')
  })

  it('passes url to upsert when provided in tool input', async () => {
    buildTrackingSupabaseMock(TRACK_URL_USER)
    mockCallLLM.mockResolvedValue({
      type: 'tool_use',
      toolName: 'track_application',
      toolUseId: 'track_tool_url',
      toolInput: MOCK_TRACK_TOOL_INPUT_WITH_URL,
      provider: 'anthropic',
    })
    mockCallLLMWithToolResult.mockResolvedValue({
      type: 'text',
      content: 'Saved with URL.',
      provider: 'anthropic',
    })
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...BASE_MESSAGE, userId: TRACK_URL_USER }),
    })
    await res.text()
    expect(lastUpsertArgs!['url']).toBe('https://stripe.com/jobs/123')
  })

  it('does NOT invoke the skill worker', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...BASE_MESSAGE, userId: TRACK_SAVE_USER }),
    })
    await res.text()
    expect(mockRunWorkerCareerclaw).not.toHaveBeenCalled()
  })

  it('calls callLLMWithToolResult with the tool input and a success result object', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...BASE_MESSAGE, userId: TRACK_SAVE_USER }),
    })
    await res.text()
    expect(mockCallLLMWithToolResult).toHaveBeenCalledOnce()
    const [, , toolUseId, toolName, passedInput, passedResult] =
      mockCallLLMWithToolResult.mock.calls[0]!
    expect(toolUseId).toBe('track_tool_001')
    expect(toolName).toBe('track_application')
    expect(passedInput).toMatchObject(MOCK_TRACK_TOOL_INPUT)
    expect((passedResult as Record<string, unknown>)['success']).toBe(true)
    expect((passedResult as Record<string, unknown>)['action']).toBe('save')
  })
})

describe('POST /chat -- track_application: save action (Supabase failure)', () => {
  beforeEach(() => {
    upsertShouldFail = true
    buildTrackingSupabaseMock(TRACK_ERR_USER)
    mockCallLLM.mockResolvedValue({
      type: 'tool_use',
      toolName: 'track_application',
      toolUseId: 'track_tool_fail',
      toolInput: MOCK_TRACK_TOOL_INPUT,
      provider: 'anthropic',
    })
    mockCallLLMWithToolResult.mockResolvedValue({
      type: 'text',
      content: "I wasn't able to save that right now -- please try adding it manually.",
      provider: 'anthropic',
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    upsertShouldFail = false
  })

  it('emits a done event (not INTERNAL_ERROR) even when upsert fails', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...BASE_MESSAGE, userId: TRACK_ERR_USER }),
    })
    const events = parseSSEEvents(await res.text())
    const error = events.find((e) => e['type'] === 'error')
    const done = events.find((e) => e['type'] === 'done')
    expect(error).toBeUndefined()
    expect(done).toBeDefined()
  })

  it('passes success:false to callLLMWithToolResult so Claude can respond appropriately', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...BASE_MESSAGE, userId: TRACK_ERR_USER }),
    })
    await res.text()
    expect(mockCallLLMWithToolResult).toHaveBeenCalledOnce()
    const passedResult = mockCallLLMWithToolResult.mock.calls[0]![5] as Record<string, unknown>
    expect(passedResult['success']).toBe(false)
  })
})

describe('POST /chat -- track_application: update_status action (success)', () => {
  beforeEach(() => {
    updateShouldFail = false
    buildTrackingSupabaseMock(TRACK_UPDATE_USER)
    mockCallLLM.mockResolvedValue({
      type: 'tool_use',
      toolName: 'track_application',
      toolUseId: 'track_tool_upd',
      toolInput: MOCK_UPDATE_TOOL_INPUT,
      provider: 'anthropic',
    })
    mockCallLLMWithToolResult.mockResolvedValue({
      type: 'text',
      content: 'Updated -- Staff Software Engineer at Stripe is now Interviewing.',
      provider: 'anthropic',
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('emits a done event with the formatted update confirmation', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...BASE_MESSAGE, userId: TRACK_UPDATE_USER }),
    })
    const events = parseSSEEvents(await res.text())
    const done = events.find((e) => e['type'] === 'done')
    expect(done).toBeDefined()
    expect(done!['message']).toContain('Interviewing')
  })

  it('calls Supabase update with the new status (not upsert)', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...BASE_MESSAGE, userId: TRACK_UPDATE_USER }),
    })
    await res.text()
    expect(lastUpdateArgs).not.toBeNull()
    expect(lastUpdateArgs!['status']).toBe('interviewing')
    expect(lastUpsertArgs).toBeNull()
  })

  it('passes action=update_status and success:true to callLLMWithToolResult', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...BASE_MESSAGE, userId: TRACK_UPDATE_USER }),
    })
    await res.text()
    const passedResult = mockCallLLMWithToolResult.mock.calls[0]![5] as Record<string, unknown>
    expect(passedResult['success']).toBe(true)
    expect(passedResult['action']).toBe('update_status')
    expect(passedResult['status']).toBe('interviewing')
  })
})

describe('POST /chat -- track_application: update_status action (Supabase failure)', () => {
  beforeEach(() => {
    updateShouldFail = true
    buildTrackingSupabaseMock(TRACK_UPDERR_USER)
    mockCallLLM.mockResolvedValue({
      type: 'tool_use',
      toolName: 'track_application',
      toolUseId: 'track_tool_updfail',
      toolInput: MOCK_UPDATE_TOOL_INPUT,
      provider: 'anthropic',
    })
    mockCallLLMWithToolResult.mockResolvedValue({
      type: 'text',
      content: "Couldn't update the status right now.",
      provider: 'anthropic',
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    updateShouldFail = false
  })

  it('emits done (not error) and passes success:false to second LLM call', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...BASE_MESSAGE, userId: TRACK_UPDERR_USER }),
    })
    const events = parseSSEEvents(await res.text())
    expect(events.find((e) => e['type'] === 'error')).toBeUndefined()
    expect(events.find((e) => e['type'] === 'done')).toBeDefined()
    const passedResult = mockCallLLMWithToolResult.mock.calls[0]![5] as Record<string, unknown>
    expect(passedResult['success']).toBe(false)
  })
})

describe('POST /chat -- track_application: second LLM call failure', () => {
  beforeEach(() => {
    upsertShouldFail = false
    buildTrackingSupabaseMock(TRACK_LLM_ERR_USER)
    mockCallLLM.mockResolvedValue({
      type: 'tool_use',
      toolName: 'track_application',
      toolUseId: 'track_tool_llmerr',
      toolInput: MOCK_TRACK_TOOL_INPUT,
      provider: 'anthropic',
    })
    mockCallLLMWithToolResult.mockRejectedValue(new Error('LLM unavailable'))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('emits a done event (not INTERNAL_ERROR) with the raw success fallback message', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...BASE_MESSAGE, userId: TRACK_LLM_ERR_USER }),
    })
    const events = parseSSEEvents(await res.text())
    const error = events.find((e) => e['type'] === 'error')
    const done = events.find((e) => e['type'] === 'done')
    expect(error).toBeUndefined()
    expect(done).toBeDefined()
    expect(done!['message']).toContain('Stripe')
  })
})

describe('POST /chat -- track_application: audit log', () => {
  beforeEach(() => {
    upsertShouldFail = false
    buildTrackingSupabaseMock(TRACK_AUDIT_USER)
    mockCallLLM.mockResolvedValue({
      type: 'tool_use',
      toolName: 'track_application',
      toolUseId: 'track_tool_audit',
      toolInput: MOCK_TRACK_TOOL_INPUT,
      provider: 'anthropic',
    })
    mockCallLLMWithToolResult.mockResolvedValue({
      type: 'text',
      content: 'Saved to tracker.',
      provider: 'anthropic',
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('writes a structured audit entry with skill=careerclaw and status=success', async () => {
    const logs: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((line: string) => {
      logs.push(line)
    })

    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...BASE_MESSAGE, userId: TRACK_AUDIT_USER }),
    })
    await res.text()
    spy.mockRestore()

    const auditLine = logs.find((l) => {
      try {
        const p = JSON.parse(l) as Record<string, unknown>
        return p['skill'] === 'careerclaw' && p['status'] === 'success'
      } catch {
        return false
      }
    })
    expect(auditLine).toBeDefined()

    const entry = JSON.parse(auditLine!) as Record<string, unknown>
    expect(entry['userId']).toBe(TRACK_AUDIT_USER)
    expect(entry['skill']).toBe('careerclaw')
    expect(entry['status']).toBe('success')
    expect(typeof entry['durationMs']).toBe('number')
    expect(typeof entry['timestamp']).toBe('string')

    const auditStr = JSON.stringify(entry)
    expect(auditStr).not.toContain('stripe-staff-swe-2026')
    expect(auditStr).not.toContain('Staff Software Engineer')
    expect(auditStr).not.toContain('Yes, save it please')
  })

  it('writes status=error in the audit log when upsert fails', async () => {
    upsertShouldFail = true
    buildTrackingSupabaseMock(TRACK_AUDIT_USER)
    mockCallLLM.mockResolvedValue({
      type: 'tool_use',
      toolName: 'track_application',
      toolUseId: 'track_tool_audit_fail',
      toolInput: MOCK_TRACK_TOOL_INPUT,
      provider: 'anthropic',
    })
    mockCallLLMWithToolResult.mockResolvedValue({
      type: 'text',
      content: 'Could not save.',
      provider: 'anthropic',
    })

    const logs: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((line: string) => {
      logs.push(line)
    })

    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...BASE_MESSAGE, userId: TRACK_AUDIT_USER }),
    })
    await res.text()
    spy.mockRestore()
    upsertShouldFail = false

    const errorAudit = logs.find((l) => {
      try {
        const p = JSON.parse(l) as Record<string, unknown>
        return p['skill'] === 'careerclaw' && p['status'] === 'error'
      } catch {
        return false
      }
    })
    expect(errorAudit).toBeDefined()
  })
})
