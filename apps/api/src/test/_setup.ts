/**
 * _setup.ts — Shared mock wiring, helpers, and constants for all API unit tests.
 */

import { vi } from 'vitest'

export const mockGetUser = vi.fn()
export const mockFrom = vi.fn()

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

export const mockCallLLM = vi.fn()
export const mockCallLLMWithToolResult = vi.fn()
export const mockCallLLMWithToolResultStream = vi.fn()
vi.mock('../llm.js', () => ({
  callLLM: mockCallLLM,
  callLLMWithToolResult: mockCallLLMWithToolResult,
  callLLMWithToolResultStream: mockCallLLMWithToolResultStream,
}))

export const mockRunWorkerCareerclaw = vi.fn()
export const mockRunWorkerGapAnalysis = vi.fn()
export const mockRunWorkerCoverLetter = vi.fn()
vi.mock('../worker-client.js', () => ({
  runWorkerCareerclaw: mockRunWorkerCareerclaw,
  runWorkerGapAnalysis: mockRunWorkerGapAnalysis,
  runWorkerCoverLetter: mockRunWorkerCoverLetter,
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

export const mockIssueSkillAssertion = vi.fn()
vi.mock('../skill-assertions.js', () => ({
  issueSkillAssertion: mockIssueSkillAssertion,
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
    SKILL_ASSERTION_PRIVATE_KEY: 'test-private-key',
    SKILL_ASSERTION_KEY_ID: 'skill-assertion-current',
    ALLOWED_ORIGIN: 'http://localhost:5173',
  },
}))

const { app } = await import('../index.js')
const { _resetRateLimitStore } = await import('../rate-limit.js')

export { app }
export const resetRateLimit = _resetRateLimitStore

export const TEST_SESSION_ID = '00000000-0000-0000-0000-000000000099'

export const VALID_BODY = {
  userId: '00000000-0000-0000-0000-000000000001',
  channel: 'web' as const,
  message: 'Find me remote engineering jobs',
}

export const MOCK_BRIEFING = {
  run: { jobs_fetched: 50 },
  matches: [
    {
      score: 0.92,
      job: {
        job_id: 'job-acme-001',
        title: 'Senior Engineer',
        company: 'Acme',
        url: 'https://acme.com',
      },
      breakdown: { skills: 0.9, experience: 0.8 },
      matched_keywords: ['TypeScript', 'React'],
      gap_keywords: ['Go'],
    },
    {
      score: 0.85,
      job: {
        job_id: 'job-beta-002',
        title: 'Staff Engineer',
        company: 'Beta',
        url: 'https://beta.com',
      },
      breakdown: { skills: 0.85, experience: 0.7 },
      matched_keywords: ['Node.js'],
      gap_keywords: ['Kubernetes'],
    },
  ],
  drafts: [],
  resume_intel: {
    extracted_keywords: ['TypeScript', 'React', 'Node.js'],
    extracted_phrases: ['senior engineer', 'full stack'],
    keyword_stream: ['TypeScript', 'React', 'Node.js'],
    phrase_stream: ['senior engineer', 'full stack'],
    impact_signals: ['TypeScript', 'React'],
    keyword_weights: { TypeScript: 1, React: 0.95, 'Node.js': 0.9 },
    phrase_weights: { 'senior engineer': 0.8, 'full stack': 0.7 },
    source: 'resume_text',
  },
}

/** Pre-built session state matching MOCK_BRIEFING — use in tests that need cached briefing data. */
export const MOCK_SESSION_STATE = {
  briefing: {
    matches: [
      {
        job_id: 'job-acme-001',
        title: 'Senior Engineer',
        company: 'Acme',
        score: 0.92,
        url: 'https://acme.com',
      },
      {
        job_id: 'job-beta-002',
        title: 'Staff Engineer',
        company: 'Beta',
        score: 0.85,
        url: 'https://beta.com',
      },
    ],
    matchData: [
      {
        matched_keywords: ['TypeScript', 'React'],
        gap_keywords: ['Go'],
      },
      {
        matched_keywords: ['Node.js'],
        gap_keywords: ['Kubernetes'],
      },
    ],
    resumeIntel: {
      extracted_keywords: ['TypeScript', 'React'],
      source: 'resume_text',
    },
    profile: { skills: ['TypeScript', 'React'], targetRoles: ['Senior Engineer'] },
    resumeText: 'Experienced fullstack engineer.',
    cachedAt: '2026-03-30T00:00:00.000Z',
  },
  gapResults: {
    'job-acme-001': {
      fit_score: 0.92,
      fit_score_unweighted: 0.88,
      signals: { keywords: ['TypeScript', 'React'], phrases: [] },
      gaps: { keywords: ['Go'], phrases: [] },
      summary: {
        top_signals: { keywords: ['TypeScript', 'React'], phrases: [] },
        top_gaps: { keywords: ['Go'], phrases: [] },
      },
    },
  },
  coverLetterResults: {
    'job-beta-002': {
      company: 'Beta',
      title: 'Staff Engineer',
      content: 'Dear Hiring Team...',
    },
  },
}

export function buildSupabaseMock(opts: {
  userId: string
  tier: 'free' | 'pro'
  entitlementTier?: 'free' | 'pro' | null
  entitlementStatus?: 'active' | 'inactive' | null
  resumeText?: string
  sessionRow?: object | null
  sessionState?: object
}) {
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
    if (table === 'user_skill_entitlements') {
      if (!opts.entitlementTier || !opts.entitlementStatus) {
        return makeChain({ data: null, error: null })
      }
      return makeChain({
        data: { tier: opts.entitlementTier, status: opts.entitlementStatus },
        error: null,
      })
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
              state: opts.sessionState ?? {},
              last_active: new Date().toISOString(),
              created_at: new Date().toISOString(),
              deleted_at: null,
            }
      return makeChain({
        data: sessionData,
        error: sessionData ? null : { message: 'not found' },
      })
    }
    if (table === 'careerclaw_profiles') {
      return makeChain({
        data: {
          resume_text: opts.resumeText ?? null,
          work_mode: 'remote',
          salary_min: 120000,
          location_pref: null,
          skills: ['TypeScript', 'React', 'Node.js'],
          target_roles: ['Senior Engineer', 'Staff Engineer'],
          experience_years: 8,
          resume_summary: 'Experienced fullstack engineer.',
        },
        error: null,
      })
    }
    if (table === 'careerclaw_runs') {
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

export function parseSSEEvents(text: string): Array<Record<string, unknown>> {
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
