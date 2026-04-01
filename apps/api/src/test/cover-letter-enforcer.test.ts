/**
 * cover-letter-enforcer.test.ts — Unit tests for P1a cover letter bypass prevention.
 *
 * Coverage:
 *   - isCoverLetterRewriteRequest: positive/negative patterns
 *   - shouldForceWorkerCoverLetter: single cover letter, multiple, no state, no match
 *   - formatCoverLetterResponse: LLM result, template result, missing fields
 *
 * Run: npm test (from apps/api/) or turbo run test
 */

import { describe, it, expect } from 'vitest'
import {
  isCoverLetterRewriteRequest,
  shouldForceWorkerCoverLetter,
  formatCoverLetterResponse,
} from '../cover-letter-enforcer.js'
import type { SessionState } from '@clawos/shared'

// ── isCoverLetterRewriteRequest ──────────────────────────────────────────────

describe('isCoverLetterRewriteRequest', () => {
  const positives = [
    'Write a more personalized cover letter version',
    'Rewrite the cover letter',
    'Re-write my cover letter',
    'Can you personalize the letter more?',
    'Revise the cover letter to be stronger',
    'Generate a better version of the cover letter',
    'Adjust the cover letter tone',
    'Improve the cover letter',
    'Redo the cover letter',
    'Regenerate the cover letter for Breezy',
  ]

  for (const msg of positives) {
    it(`detects: "${msg}"`, () => {
      expect(isCoverLetterRewriteRequest(msg)).toBe(true)
    })
  }

  const negatives = [
    'Write me a cover letter for match #1', // first-time request
    'yes', // simple confirmation
    'Run a gap analysis for the Breezy job', // different tool
    'Find me jobs', // briefing request
    'Save the job to my tracker', // tracking request
    'How are you today?', // generic
    'Tell me more about the Breezy role', // follow-up question
    'What does the cover letter say?', // read-only question
  ]

  for (const msg of negatives) {
    it(`rejects: "${msg}"`, () => {
      expect(isCoverLetterRewriteRequest(msg)).toBe(false)
    })
  }
})

// ── shouldForceWorkerCoverLetter ─────────────────────────────────────────────

const MATCH_A = {
  job_id: 'breezy-ai-engineer',
  title: 'AI Product Engineer',
  company: 'Breezy',
  score: 0.27,
  url: 'https://example.com/breezy',
}

const MATCH_B = {
  job_id: 'level-frontend',
  title: 'Senior Frontend Engineer',
  company: 'Level',
  score: 0.21,
  url: null,
}

function makeState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    briefing: {
      cachedAt: new Date().toISOString(),
      matches: [MATCH_A, MATCH_B],
      // matchData is empty here — the enforcer tests only read
      // briefing.matches and coverLetterResults, never matchData.
      // If SessionState tightens matchData typing, update these stubs.
      matchData: [{}, {}],
      resumeIntel: {},
      profile: {},
      resumeText: null,
    },
    ...overrides,
  }
}

describe('shouldForceWorkerCoverLetter', () => {
  it('enforces when single cover letter exists and message is a rewrite', () => {
    const state = makeState({
      coverLetterResults: { 'breezy-ai-engineer': { body: '...' } },
    })
    const result = shouldForceWorkerCoverLetter('Rewrite the cover letter', state)
    expect(result.shouldEnforce).toBe(true)
    expect(result.jobId).toBe('breezy-ai-engineer')
    expect(result.company).toBe('Breezy')
  })

  it('does not enforce when message is not a rewrite request', () => {
    const state = makeState({
      coverLetterResults: { 'breezy-ai-engineer': { body: '...' } },
    })
    const result = shouldForceWorkerCoverLetter('Write me a cover letter for match #1', state)
    expect(result.shouldEnforce).toBe(false)
  })

  it('does not enforce when no cover letter results exist', () => {
    const state = makeState({ coverLetterResults: undefined })
    const result = shouldForceWorkerCoverLetter('Rewrite the cover letter', state)
    expect(result.shouldEnforce).toBe(false)
  })

  it('does not enforce when coverLetterResults is empty', () => {
    const state = makeState({ coverLetterResults: {} })
    const result = shouldForceWorkerCoverLetter('Rewrite the cover letter', state)
    expect(result.shouldEnforce).toBe(false)
  })

  it('resolves by company name when multiple cover letters exist', () => {
    const state = makeState({
      coverLetterResults: {
        'breezy-ai-engineer': { body: '...' },
        'level-frontend': { body: '...' },
      },
    })
    const result = shouldForceWorkerCoverLetter('Personalize the Level cover letter', state)
    expect(result.shouldEnforce).toBe(true)
    expect(result.jobId).toBe('level-frontend')
    expect(result.company).toBe('Level')
  })

  it('does not enforce when multiple exist and company is ambiguous', () => {
    const state = makeState({
      coverLetterResults: {
        'breezy-ai-engineer': { body: '...' },
        'level-frontend': { body: '...' },
      },
    })
    const result = shouldForceWorkerCoverLetter('Rewrite the cover letter', state)
    expect(result.shouldEnforce).toBe(false)
  })
})

// ── formatCoverLetterResponse ────────────────────────────────────────────────

describe('formatCoverLetterResponse', () => {
  it('formats an LLM-generated cover letter', () => {
    const result = formatCoverLetterResponse(
      {
        body: 'Dear Breezy team, I am a great fit...',
        is_template: false,
        keyword_coverage: {
          top_signals: ['React', 'TypeScript', 'Claude API'],
          top_gaps: ['HVAC'],
        },
      },
      'Breezy',
    )
    expect(result).toContain("Here's your tailored cover letter for Breezy:")
    expect(result).toContain('Dear Breezy team, I am a great fit...')
    expect(result).not.toContain('template version')
    expect(result).toContain('React ✓')
    expect(result).toContain('HVAC — addressed')
    expect(result).toContain('save this job to your tracker')
  })

  it('formats a template cover letter with template notice', () => {
    const result = formatCoverLetterResponse(
      {
        body: 'Dear Level team...',
        is_template: true,
        keyword_coverage: {
          top_signals: ['React'],
          top_gaps: [],
        },
      },
      'Level',
    )
    expect(result).toContain('template version')
    expect(result).toContain("Here's your tailored cover letter for Level:")
  })

  it('handles missing keyword_coverage gracefully', () => {
    const result = formatCoverLetterResponse(
      { body: 'Letter body here.', is_template: false },
      'Acme',
    )
    expect(result).toContain('Letter body here.')
    expect(result).not.toContain('Keyword coverage')
  })
})
