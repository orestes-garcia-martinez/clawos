import { describe, expect, it } from 'vitest'
import { CareerClawCoverLetterInputSchema, CareerClawGapAnalysisInputSchema, ScrapeClawResearchWorkerInputSchema } from './worker-run.js'

const MATCH = {
  job: {
    job_id: 'job-1',
    title: 'Engineer',
    company: 'Acme',
    location: 'Remote',
    description: 'Build systems',
    url: 'https://example.com/job-1',
    source: 'remoteok',
    salary_min: null,
    salary_max: null,
    work_mode: 'remote',
    experience_years: 5,
    posted_at: null,
    fetched_at: '2026-04-04T00:00:00.000Z',
  },
  score: 0.9,
  breakdown: { keyword: 0.9, experience: 1, salary: 1, work_mode: 1 },
  matched_keywords: ['TypeScript'],
  gap_keywords: ['Go'],
}

const PROFILE = {
  skills: ['TypeScript'],
  targetRoles: ['Engineer'],
}

const RESUME_INTEL = {
  extracted_keywords: ['TypeScript'],
  extracted_phrases: [],
  keyword_stream: ['TypeScript'],
  phrase_stream: [],
  impact_signals: ['TypeScript'],
  keyword_weights: { TypeScript: 1 },
  phrase_weights: {},
  source: 'resume_text',
}

const GAP_ANALYSIS_RESULT = {
  fit_score: 0.7,
  fit_score_unweighted: 0.5,
  signals: { keywords: ['TypeScript'], phrases: [] },
  gaps: { keywords: ['Go'], phrases: [] },
  summary: {
    top_signals: { keywords: ['TypeScript'], phrases: [] },
    top_gaps: { keywords: ['Go'], phrases: [] },
  },
}

describe('CareerClaw cover-letter worker input schema', () => {
  it('accepts precomputedGap shaped like GapAnalysisResult', () => {
    expect(() =>
      CareerClawCoverLetterInputSchema.parse({
        match: MATCH,
        profile: PROFILE,
        resumeIntel: RESUME_INTEL,
        precomputedGap: GAP_ANALYSIS_RESULT,
      }),
    ).not.toThrow()
  })

  it('rejects a wrapped GapAnalysisReport passed as precomputedGap', () => {
    expect(() =>
      CareerClawCoverLetterInputSchema.parse({
        match: MATCH,
        profile: PROFILE,
        resumeIntel: RESUME_INTEL,
        precomputedGap: {
          job_id: 'job-1',
          title: 'Engineer',
          company: 'Acme',
          analysis: GAP_ANALYSIS_RESULT,
        },
      }),
    ).toThrow()
  })
})

describe('CareerClaw gap-analysis worker input schema', () => {
  it('still accepts the existing gap-analysis request shape', () => {
    expect(() =>
      CareerClawGapAnalysisInputSchema.parse({
        match: MATCH,
        resumeIntel: RESUME_INTEL,
      }),
    ).not.toThrow()
  })
})

describe('ScrapeClaw research worker input schema', () => {
  it('accepts bounded candidate research input', () => {
    expect(() =>
      ScrapeClawResearchWorkerInputSchema.parse({
        wedgeSlug: 'residential_property_management',
        marketCity: 'Green Cove Springs',
        marketRegion: 'Clay County',
        candidates: [
          {
            name: 'Example Property Management',
            canonicalWebsiteUrl: 'https://examplepm.com',
            city: 'Green Cove Springs',
            state: 'FL',
          },
        ],
        maxCandidates: 5,
        maxPagesPerBusiness: 4,
      }),
    ).not.toThrow()
  })

  it('rejects non-HTTPS candidate URLs', () => {
    expect(() =>
      ScrapeClawResearchWorkerInputSchema.parse({
        wedgeSlug: 'residential_property_management',
        marketCity: 'Green Cove Springs',
        marketRegion: 'Clay County',
        candidates: [{ name: 'Example PM', canonicalWebsiteUrl: 'http://examplepm.com' }],
      }),
    ).toThrow()
  })
})
