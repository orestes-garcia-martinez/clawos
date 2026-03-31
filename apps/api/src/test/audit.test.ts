/**
 * audit.test.ts — Audit log tests (metadata-only shape, no message bodies).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  app,
  buildSupabaseMock,
  mockCallLLM,
  mockCallLLMWithToolResult,
  mockRunWorkerCareerclaw,
  resetRateLimit,
  VALID_BODY,
  MOCK_BRIEFING,
} from './_setup.js'

const AUDIT_USER = '00000000-0000-0000-0000-000000000016'

beforeEach(() => {
  resetRateLimit()
})

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
    mockRunWorkerCareerclaw.mockResolvedValue({ result: MOCK_BRIEFING, durationMs: 1800 })
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

    const auditStr = JSON.stringify(entry)
    expect(auditStr).not.toContain('My resume text')
    expect(auditStr).not.toContain('Find remote jobs')
  })
})
