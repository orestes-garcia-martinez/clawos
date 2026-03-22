/**
 * chat.careerclaw.test.ts — POST /chat run_careerclaw tool use path tests.
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

const TOOL_USE_USER = '00000000-0000-0000-0000-000000000012'
const PRO_TOOL_USER = '00000000-0000-0000-0000-000000000013'
const RESUME_USER = '00000000-0000-0000-0000-000000000014'

beforeEach(() => {
  resetRateLimit()
})

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
    await res.text()
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

  it('passes skills, targetRoles, experienceYears, resumeSummary to the worker', async () => {
    buildSupabaseMock({
      userId: RESUME_USER,
      tier: 'free',
      resumeText: 'Senior fullstack engineer...',
    })
    mockCallLLM.mockResolvedValue({
      type: 'tool_use',
      toolName: 'run_careerclaw',
      toolUseId: 'tool_profile_fields',
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
    const workerCall = mockRunWorkerCareerclaw.mock.calls[0]?.[0] as {
      profile: {
        skills?: string[]
        targetRoles?: string[]
        experienceYears?: number
        resumeSummary?: string
      }
    }
    expect(workerCall).toBeDefined()
    expect(workerCall.profile.skills).toEqual(['TypeScript', 'React', 'Node.js'])
    expect(workerCall.profile.targetRoles).toEqual(['Senior Engineer', 'Staff Engineer'])
    expect(workerCall.profile.experienceYears).toBe(8)
    expect(workerCall.profile.resumeSummary).toBe('Experienced fullstack engineer.')
  })
})
