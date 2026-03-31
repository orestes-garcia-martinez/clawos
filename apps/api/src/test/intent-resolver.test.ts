import { describe, expect, it } from 'vitest'
import { buildResolvedIntentMessage, resolveIntentHint } from '../intent-resolver.js'
import { MOCK_SESSION_STATE } from './_setup.js'

describe('intent-resolver', () => {
  it('resolves single-match analysis intent from ordinal reference', () => {
    const result = resolveIntentHint('Analyze the second one for me', MOCK_SESSION_STATE)

    expect(result.kind).toBe('single_match_analysis')
    expect(result.jobId).toBe('job-beta-002')
    expect(result.referencedJobIds).toEqual(['job-beta-002'])
  })

  it('resolves single-match cover-letter intent from company reference', () => {
    const result = resolveIntentHint('Write a cover letter for Acme', MOCK_SESSION_STATE)

    expect(result.kind).toBe('single_match_cover_letter')
    expect(result.jobId).toBe('job-acme-001')
  })

  it('resolves comparison intent when multiple matches are referenced', () => {
    const result = resolveIntentHint('Compare Acme and Beta for me', MOCK_SESSION_STATE)

    expect(result.kind).toBe('comparison')
    expect(result.referencedJobIds).toEqual(['job-acme-001', 'job-beta-002'])
  })

  it('returns ambiguous_multi_match for single-match action phrased against multiple matches', () => {
    const result = resolveIntentHint('Write a cover letter for Acme and Beta', MOCK_SESSION_STATE)

    expect(result.kind).toBe('ambiguous_multi_match')
    expect(result.referencedJobIds).toEqual(['job-acme-001', 'job-beta-002'])
  })

  it('builds a resolved intent message for a single-match action', () => {
    const message = buildResolvedIntentMessage('Analyze Acme', MOCK_SESSION_STATE)

    expect(message).toContain('[Server-side resolved intent hint]')
    expect(message).toContain('kind=single_match_analysis')
    expect(message).toContain('resolved_job_id=job-acme-001')
  })

  it('does not classify as comparison when only one match is referenced but "better" is present', () => {
    const result = resolveIntentHint('Write a better cover letter for Acme', MOCK_SESSION_STATE)

    expect(result.kind).toBe('single_match_cover_letter')
    expect(result.jobId).toBe('job-acme-001')
  })

  it('returns null when nothing is confidently resolved', () => {
    const message = buildResolvedIntentMessage(
      'Tell me something interesting about my search',
      MOCK_SESSION_STATE,
    )

    expect(message).toBeNull()
  })
})
