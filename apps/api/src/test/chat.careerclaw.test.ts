import { describe, it, expect, beforeEach } from 'vitest'
import {
  app,
  buildSupabaseMock,
  mockCallLLM,
  mockCallLLMWithToolResult,
  mockIssueSkillAssertion,
  mockRunWorkerCareerclaw,
  parseSSEEvents,
  resetRateLimit,
  VALID_BODY,
  MOCK_BRIEFING,
} from './_setup.js'

const FREE_USER = '00000000-0000-0000-0000-000000000012'
const PRO_USER = '00000000-0000-0000-0000-000000000013'

describe('POST /chat — CareerClaw tool use path', () => {
  beforeEach(() => {
    resetRateLimit()
    mockIssueSkillAssertion.mockReset()
    mockRunWorkerCareerclaw.mockReset()
    mockCallLLM.mockReset()
    mockCallLLMWithToolResult.mockReset()

    mockIssueSkillAssertion.mockReturnValue('test-signed-assertion')
    mockRunWorkerCareerclaw.mockResolvedValue({
      result: MOCK_BRIEFING,
      durationMs: 1500,
    })
    mockCallLLMWithToolResult.mockResolvedValue({
      type: 'text',
      content: 'Here are your top matches.',
      provider: 'anthropic',
    })
  })

  it('issues a signed assertion and sends the worker envelope for free users', async () => {
    buildSupabaseMock({ userId: FREE_USER, tier: 'free' })
    mockCallLLM.mockResolvedValue({
      type: 'tool_use',
      toolName: 'run_careerclaw',
      toolUseId: 'tool_free123',
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
      body: JSON.stringify({ ...VALID_BODY, userId: FREE_USER }),
    })

    const body = await res.text()
    const events = parseSSEEvents(body)

    expect(res.status).toBe(200)
    expect(mockIssueSkillAssertion).toHaveBeenCalledWith({
      userId: FREE_USER,
      skill: 'careerclaw',
      tier: 'free',
      features: [],
    })
    expect(mockRunWorkerCareerclaw).toHaveBeenCalledWith({
      assertion: 'test-signed-assertion',
      input: expect.objectContaining({
        topK: 3,
        resumeText: undefined,
        profile: expect.objectContaining({
          skills: ['TypeScript', 'React', 'Node.js'],
        }),
      }),
    })
    expect(events.some((e) => e['type'] === 'done')).toBe(true)
  })

  it('uses skill entitlements rather than raw userTier for pro activation', async () => {
    buildSupabaseMock({
      userId: PRO_USER,
      tier: 'free',
      entitlementTier: 'pro',
      entitlementStatus: 'active',
      resumeText: 'Senior fullstack engineer...',
    })
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
      body: JSON.stringify({ ...VALID_BODY, userId: PRO_USER }),
    })

    await res.text()

    expect(mockIssueSkillAssertion).toHaveBeenCalledWith({
      userId: PRO_USER,
      skill: 'careerclaw',
      tier: 'pro',
      features: [
        'careerclaw.llm_outreach_draft',
        'careerclaw.llm_gap_analysis',
        'careerclaw.tailored_cover_letter',
        'careerclaw.resume_gap_analysis',
        'careerclaw.topk_extended',
      ],
    })

    expect(mockRunWorkerCareerclaw).toHaveBeenCalledWith({
      assertion: 'test-signed-assertion',
      input: expect.objectContaining({
        topK: 10,
        resumeText: 'Senior fullstack engineer...',
      }),
    })

    expect(mockCallLLMWithToolResult).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      'tool_pro123',
      'run_careerclaw',
      expect.objectContaining({ topK: 10 }),
      expect.objectContaining({
        _meta: expect.objectContaining({
          tier: 'pro',
          topK: 10,
          includeOutreach: false,
          includeCoverLetter: true,
          includeGapAnalysis: true,
        }),
      }),
      expect.any(String),
      expect.any(String),
    )
  })

  it('keeps free meta flags false even when the model requests pro-only outputs', async () => {
    buildSupabaseMock({ userId: FREE_USER, tier: 'free' })
    mockCallLLM.mockResolvedValue({
      type: 'tool_use',
      toolName: 'run_careerclaw',
      toolUseId: 'tool_meta123',
      toolInput: {
        topK: 5,
        includeOutreach: true,
        includeCoverLetter: true,
        includeGapAnalysis: true,
      },
      provider: 'anthropic',
    })

    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...VALID_BODY, userId: FREE_USER }),
    })

    await res.text()

    expect(mockCallLLMWithToolResult).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      'tool_meta123',
      'run_careerclaw',
      expect.objectContaining({ topK: 5 }),
      expect.objectContaining({
        _meta: expect.objectContaining({
          tier: 'free',
          includeOutreach: true,
          includeCoverLetter: false,
          includeGapAnalysis: false,
        }),
      }),
      expect.any(String),
      expect.any(String),
    )
  })
})
