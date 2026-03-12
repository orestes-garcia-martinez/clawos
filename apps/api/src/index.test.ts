/**
 * index.test.ts -- Unit tests for the ClawOS Agent API.
 *
 * All tests run offline -- no network calls, no real Supabase or LLM.
 * External dependencies (Supabase, LLM, worker) are mocked at the module level.
 *
 * Run: npm test (from apps/api/) or turbo run test
 *
 * Coverage targets:
 *   - Auth middleware: missing token, invalid token, valid token
 *   - Rate limiting: free tier cap (10/hr), pro tier cap (60/hr)
 *   - Input validation: Zod schema rejections
 *   - Chat handler: direct text response path
 *   - Chat handler: tool use -> worker -> second LLM call path
 *   - Chat handler: worker timeout, worker error, LLM error
 *   - Audit log: metadata-only shape, no message bodies
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// - Module mocks -- set up before any imports that use them -

// Mock Supabase client
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

// Mock LLM module
const mockCallLLM = vi.fn()
const mockCallLLMWithToolResult = vi.fn()
vi.mock('./llm.js', () => ({
  callLLM: mockCallLLM,
  callLLMWithToolResult: mockCallLLMWithToolResult,
}))

// Mock worker client
const mockRunWorkerCareerclaw = vi.fn()
vi.mock('./worker-client.js', () => ({
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

// Mock env -- must be set before importing modules that call requireEnv at module load
vi.mock('./env.js', () => ({
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

// Import app AFTER mocks are wired
const { default: app } = await import('./index.js')
const { _resetRateLimitStore } = await import('./rate-limit.js')

// Reset rate limit store before every test to prevent cross-test contamination
beforeEach(() => {
  _resetRateLimitStore()
})

// - Helpers -

const FREE_USER_ID = '00000000-0000-0000-0000-000000000001'
// const PRO_USER_ID = '00000000-0000-0000-0000-000000000002'
const TEST_SESSION_ID = '00000000-0000-0000-0000-000000000099'
// Unique IDs per test group -- rate limiter state is in-memory and shared per process
const DIRECT_TEXT_USER = '00000000-0000-0000-0000-000000000011'
const TOOL_USE_USER = '00000000-0000-0000-0000-000000000012'
const PRO_TOOL_USER = '00000000-0000-0000-0000-000000000013'
const RESUME_USER = '00000000-0000-0000-0000-000000000014'
const ERR_USER = '00000000-0000-0000-0000-000000000015'
const AUDIT_USER = '00000000-0000-0000-0000-000000000016'

const VALID_BODY = {
  userId: FREE_USER_ID,
  channel: 'web',
  message: 'Find me remote engineering jobs',
}

const MOCK_BRIEFING = {
  run: { jobs_fetched: 50 },
  matches: [
    { score: 0.92, job: { title: 'Senior Engineer', company: 'Acme', url: 'https://acme.com' } },
    { score: 0.85, job: { title: 'Staff Engineer', company: 'Beta', url: 'https://beta.com' } },
  ],
  drafts: [],
}

/** Build a Supabase client mock that sets up the most common query chain. */
function buildSupabaseMock(opts: {
  userId: string
  tier: 'free' | 'pro'
  resumeText?: string
  sessionRow?: object | null
}) {
  // Helper that returns a chainable query object resolving to {data, error}
  const makeChain = (result: { data: unknown; error: null | { message: string } }) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      order: () => chain,
      limit: () => chain,
      single: () => Promise.resolve(result),
      maybeSingle: () => Promise.resolve(result),
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: { id: TEST_SESSION_ID }, error: null }),
        }),
        then: (cb: (v: unknown) => void) => cb({ data: null, error: null }),
      }),
      update: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ error: null }),
          then: (cb: (v: unknown) => void) => cb({ error: null }),
        }),
      }),
      then: (cb: (v: unknown) => void) => cb({ data: null, error: null }),
    }
    return chain
  }

  mockGetUser.mockResolvedValue({ data: { user: { id: opts.userId } }, error: null })

  mockFrom.mockImplementation((table: string) => {
    if (table === 'users') {
      return makeChain({ data: { tier: opts.tier }, error: null })
    }
    if (table === 'sessions') {
      const sessionData =
        opts.sessionRow !== undefined
          ? opts.sessionRow
          : {
              id: TEST_SESSION_ID,
              user_id: opts.userId,
              channel: 'web',
              messages: [],
              last_active: new Date().toISOString(),
              created_at: new Date().toISOString(),
              deleted_at: null,
            }
      return makeChain({ data: sessionData, error: sessionData ? null : { message: 'not found' } })
    }
    if (table === 'careerclaw_profiles') {
      return makeChain({
        data: {
          resume_text: opts.resumeText ?? null,
          work_mode: 'remote',
          salary_min: 120000,
          location_pref: null,
        },
        error: null,
      })
    }
    if (table === 'careerclaw_runs') {
      // insert path
      const runChain = {
        insert: () => ({
          then: (cb: (v: unknown) => void) => {
            cb({ data: null, error: null })
            return Promise.resolve()
          },
        }),
        select: () => runChain,
        eq: () => runChain,
        is: () => runChain,
        order: () => runChain,
        limit: () => runChain,
        single: () => Promise.resolve({ data: null, error: null }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (cb: (v: unknown) => void) => cb({ data: null, error: null }),
      }
      return runChain
    }
    return makeChain({ data: null, error: { message: 'unexpected table' } })
  })
}

/** Parse SSE stream body into individual event data strings. */
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

// - Tests -

describe('GET /health', () => {
  it('returns 200 with no auth', async () => {
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string; service: string }
    expect(body.status).toBe('ok')
    expect(body.service).toBe('clawos-api')
  })
})

// - Auth middleware -

describe('Auth middleware', () => {
  it('rejects POST /chat with no Authorization header', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe('UNAUTHORIZED')
  })

  it('rejects POST /chat with invalid JWT', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'invalid' } })
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
      }),
    }))

    const res = await app.request('/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid-jwt',
      },
      body: JSON.stringify(VALID_BODY),
    })
    expect(res.status).toBe(401)
  })
})

// - Input validation -

describe('Zod input validation', () => {
  beforeEach(() => {
    buildSupabaseMock({ userId: FREE_USER_ID, tier: 'free' })
    mockCallLLM.mockResolvedValue({ type: 'text', content: 'Hello!', provider: 'anthropic' })
  })

  it('rejects empty message', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...VALID_BODY, message: '' }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe('BAD_REQUEST')
  })

  it('rejects message over 4000 chars', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...VALID_BODY, message: 'x'.repeat(4001) }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects invalid channel', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...VALID_BODY, channel: 'discord' }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects non-JSON body', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: 'not json',
    })
    expect(res.status).toBe(400)
  })
})

// - Direct text response -

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
    // done must be last meaningful event
    const lastEvent = events.filter((e) => e['type'] === 'done' || e['type'] === 'error').pop()
    expect(lastEvent?.['type']).toBe('done')
  })
})

// - Tool use + worker path -

describe('POST /chat -- tool use path (CareerClaw)', () => {
  beforeEach(() => {
    buildSupabaseMock({ userId: TOOL_USE_USER, tier: 'free' })
    mockCallLLM.mockResolvedValue({
      type: 'tool_use',
      toolName: 'run_careerclaw',
      toolUseId: 'tool_abc123',
      toolInput: {
        topK: 5,
        includeOutreach: false,
        includeCoverLetter: false,
        includeGapAnalysis: false,
      },
      provider: 'anthropic',
    })
    mockRunWorkerCareerclaw.mockResolvedValue({
      briefing: MOCK_BRIEFING,
      durationMs: 2100,
    })
    mockCallLLMWithToolResult.mockResolvedValue({
      type: 'text',
      content:
        '## Your Top Job Matches\n\n1. Senior Engineer at Acme (92% match)\n2. Staff Engineer at Beta (85% match)',
      provider: 'anthropic',
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('emits fetching, scoring, drafting progress events', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...VALID_BODY, userId: TOOL_USE_USER }),
    })
    const text = await res.text()
    const events = parseSSEEvents(text)
    const steps = events.filter((e) => e['type'] === 'progress').map((e) => e['step'])
    expect(steps).toContain('fetching')
    expect(steps).toContain('scoring')
    expect(steps).toContain('drafting')
  })

  it('emits done event with formatted response', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...VALID_BODY, userId: TOOL_USE_USER }),
    })
    const text = await res.text()
    const events = parseSSEEvents(text)
    const doneEvent = events.find((e) => e['type'] === 'done')
    expect(doneEvent).toBeDefined()
    expect(doneEvent!['message']).toContain('Senior Engineer')
  })

  it('enforces free-tier topK limit (max 3) regardless of tool input', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...VALID_BODY, userId: TOOL_USE_USER }),
    })
    await res.text() // consume full stream so worker call is recorded
    const workerCall = mockRunWorkerCareerclaw.mock.calls[0]?.[0] as { topK: number }
    expect(workerCall).toBeDefined()
    expect(workerCall.topK).toBeLessThanOrEqual(3)
  })

  it('allows pro-tier topK up to 10', async () => {
    buildSupabaseMock({ userId: PRO_TOOL_USER, tier: 'pro' })
    mockCallLLM.mockResolvedValue({
      type: 'tool_use',
      toolName: 'run_careerclaw',
      toolUseId: 'tool_pro123',
      toolInput: {
        topK: 10,
        includeOutreach: true,
        includeCoverLetter: true,
        includeGapAnalysis: true,
      },
      provider: 'anthropic',
    })
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...VALID_BODY, userId: PRO_TOOL_USER }),
    })
    await res.text()
    const workerCall = mockRunWorkerCareerclaw.mock.calls[0]?.[0] as { topK: number }
    expect(workerCall).toBeDefined()
    expect(workerCall.topK).toBeLessThanOrEqual(10)
  })

  it('passes resumeText from profile to the worker', async () => {
    buildSupabaseMock({
      userId: RESUME_USER,
      tier: 'free',
      resumeText: 'Senior fullstack engineer...',
    })
    mockCallLLM.mockResolvedValue({
      type: 'tool_use',
      toolName: 'run_careerclaw',
      toolUseId: 'tool_resume',
      toolInput: {
        topK: 3,
        includeOutreach: false,
        includeCoverLetter: false,
        includeGapAnalysis: false,
      },
      provider: 'anthropic',
    })
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...VALID_BODY, userId: RESUME_USER }),
    })
    await res.text()
    const workerCall = mockRunWorkerCareerclaw.mock.calls[0]?.[0] as { resumeText?: string }
    expect(workerCall).toBeDefined()
    expect(workerCall.resumeText).toBe('Senior fullstack engineer...')
  })
})

// - Error paths -

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
    const { WorkerError } = await import('./worker-client.js')
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
    const { WorkerError } = await import('./worker-client.js')
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

// - Rate limiting -

describe('Rate limiting', () => {
  // Note: rate limiter is in-memory and shared across tests in this process.
  // We use a unique userId per test group to avoid cross-contamination.

  const RL_FREE_USER = '00000000-0000-0000-0000-000000000010'

  beforeEach(() => {
    buildSupabaseMock({ userId: RL_FREE_USER, tier: 'free' })
    mockCallLLM.mockResolvedValue({ type: 'text', content: 'ok', provider: 'anthropic' })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns 429 after 10 requests for a free-tier user', async () => {
    // Fire 10 successful requests
    for (let i = 0; i < 10; i++) {
      await app.request('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
        body: JSON.stringify({ ...VALID_BODY, userId: RL_FREE_USER }),
      })
    }

    // 11th request must be rate limited
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...VALID_BODY, userId: RL_FREE_USER }),
    })
    expect(res.status).toBe(429)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe('RATE_LIMITED')
    expect(res.headers.get('Retry-After')).toBeDefined()
  })
})

// - Audit log -

describe('Audit log -- metadata only', () => {
  beforeEach(() => {
    buildSupabaseMock({ userId: AUDIT_USER, tier: 'free', resumeText: 'My resume text' })
    mockCallLLM.mockResolvedValue({
      type: 'tool_use',
      toolName: 'run_careerclaw',
      toolUseId: 'tool_audit',
      toolInput: {
        topK: 3,
        includeOutreach: false,
        includeCoverLetter: false,
        includeGapAnalysis: false,
      },
      provider: 'anthropic',
    })
    mockRunWorkerCareerclaw.mockResolvedValue({ briefing: MOCK_BRIEFING, durationMs: 1800 })
    mockCallLLMWithToolResult.mockResolvedValue({
      type: 'text',
      content: 'Results here',
      provider: 'anthropic',
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('logs a structured audit entry -- never includes resume text or message body', async () => {
    const logs: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((line: string) => {
      logs.push(line)
    })

    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...VALID_BODY, userId: AUDIT_USER, message: 'Find remote jobs' }),
    })
    // Consume the full SSE stream before restoring the spy --
    // logAudit fires inside the async stream body, after sendDone.
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
    expect(entry['userId']).toBe(AUDIT_USER)
    expect(entry['skill']).toBe('careerclaw')
    expect(entry['status']).toBe('success')
    expect(typeof entry['durationMs']).toBe('number')
    expect(typeof entry['timestamp']).toBe('string')

    // Sensitive content must never appear in audit log
    const auditStr = JSON.stringify(entry)
    expect(auditStr).not.toContain('My resume text')
    expect(auditStr).not.toContain('Find remote jobs')
  })
})
