import { describe, expect, it } from 'vitest'
import { enforceSingleMatchToolTarget } from '../tool-target-enforcer.js'
import { MOCK_SESSION_STATE } from './_setup.js'

describe('tool-target-enforcer', () => {
  it('proceeds when the tool already provides a valid current-briefing job_id', () => {
    const result = enforceSingleMatchToolTarget({
      toolName: 'run_gap_analysis',
      message: 'Analyze the second one',
      state: MOCK_SESSION_STATE,
      toolInput: { job_id: 'job-acme-001' },
    })

    expect(result).toEqual({ kind: 'proceed', jobId: 'job-acme-001' })
  })

  it('overrides a missing job_id when the user references a single match by ordinal', () => {
    const result = enforceSingleMatchToolTarget({
      toolName: 'run_gap_analysis',
      message: 'Analyze the second one',
      state: MOCK_SESSION_STATE,
      toolInput: {},
    })

    expect(result).toEqual({ kind: 'proceed', jobId: 'job-beta-002' })
  })

  it('clarifies when the user references multiple matches for a single-match tool', () => {
    const result = enforceSingleMatchToolTarget({
      toolName: 'run_cover_letter',
      message: 'Write a cover letter for Acme and Beta',
      state: MOCK_SESSION_STATE,
      toolInput: {},
    })

    expect(result.kind).toBe('clarify')
    if (result.kind === 'clarify') {
      expect(result.message).toContain('one cover letter at a time')
      expect(result.message).toContain('Acme')
      expect(result.message).toContain('Beta')
    }
  })

  it('clarifies when nothing can be matched to the current briefing', () => {
    const result = enforceSingleMatchToolTarget({
      toolName: 'run_gap_analysis',
      message: 'Analyze the Stripe role',
      state: MOCK_SESSION_STATE,
      toolInput: { job_id: 'hallucinated-job-999' },
    })

    expect(result).toEqual({
      kind: 'clarify',
      message:
        "I couldn't match that to your current briefing. Tell me the company name or match number.",
    })
  })

  it('resolves a single referenced match for track_application', () => {
    expect(
      enforceSingleMatchToolTarget({
        toolName: 'track_application',
        message: 'Save the second one to my tracker',
        state: MOCK_SESSION_STATE,
        toolInput: { job_id: 'hallucinated-job' },
      }),
    ).toEqual({ kind: 'proceed', jobId: 'job-beta-002' })
  })

  it('returns a tracking-specific clarification for ambiguous references', () => {
    expect(
      enforceSingleMatchToolTarget({
        toolName: 'track_application',
        message: 'Save Acme and Beta to my tracker',
        state: MOCK_SESSION_STATE,
        toolInput: { job_id: 'hallucinated-job' },
      }),
    ).toEqual({
      kind: 'clarify',
      message: 'I can track one role at a time. Which role do you want first: Acme or Beta?',
    })
  })
})
