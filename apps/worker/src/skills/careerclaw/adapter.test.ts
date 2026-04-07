import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VerifiedSkillExecutionContext } from '@clawos/shared'

const mockRunCareerClawWithContext = vi.fn()
const mockGenerateGapAnalysisForMatch = vi.fn()
const mockGenerateCoverLetterForMatch = vi.fn()
const mockCreateClawOsExecutionContext = vi.fn((params) => ({
  source: 'clawos',
  verified: true,
  ...params,
}))

vi.mock('careerclaw-js', () => ({
  CAREERCLAW_FEATURES: {
    TOPK_EXTENDED: 'careerclaw.topk_extended',
  },
  createClawOsExecutionContext: mockCreateClawOsExecutionContext,
  runCareerClawWithContext: mockRunCareerClawWithContext,
  generateGapAnalysisForMatch: mockGenerateGapAnalysisForMatch,
  generateCoverLetterForMatch: mockGenerateCoverLetterForMatch,
}))

const {
  buildCareerClawExecutionContext,
  buildCareerClawProfile,
  careerClawAdapter,
  careerClawGapAnalysisAdapter,
  careerClawCoverLetterAdapter,
  clampTopK,
} = await import('./adapter.js')

const FREE_CTX: VerifiedSkillExecutionContext = {
  source: 'clawos',
  verified: true,
  userId: '00000000-0000-0000-0000-000000000001',
  skill: 'careerclaw',
  tier: 'free',
  features: [],
  requestId: 'req-free',
  issuedAt: 1700000000,
  expiresAt: 1700000060,
}

const PRO_CTX: VerifiedSkillExecutionContext = {
  ...FREE_CTX,
  userId: '00000000-0000-0000-0000-000000000002',
  tier: 'pro',
  features: ['careerclaw.topk_extended', 'careerclaw.llm_gap_analysis'],
  requestId: 'req-pro',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRunCareerClawWithContext.mockResolvedValue({ matches: [], drafts: [] })
  mockGenerateGapAnalysisForMatch.mockResolvedValue({
    job_id: 'job-1',
    title: 'Engineer',
    company: 'Acme',
    analysis: {
      fit_score: 0.7,
      fit_score_unweighted: 0.5,
      signals: { keywords: ['TypeScript'], phrases: [] },
      gaps: { keywords: ['Go'], phrases: [] },
      summary: {
        top_signals: { keywords: ['TypeScript'], phrases: [] },
        top_gaps: { keywords: ['Go'], phrases: [] },
      },
    },
  })
  mockGenerateCoverLetterForMatch.mockResolvedValue({
    job_id: 'job-1',
    body: 'Dear Acme hiring team...',
    tone: 'professional',
    is_template: false,
    match_score: 0.7,
    keyword_coverage: { top_signals: ['TypeScript'], top_gaps: ['Go'] },
  })
})

describe('clampTopK', () => {
  it('limits free users to 3', () => {
    expect(clampTopK(FREE_CTX, 10)).toBe(3)
  })

  it('allows pro users with the feature to request up to 10', () => {
    expect(clampTopK(PRO_CTX, 10)).toBe(10)
  })
})

describe('CareerClaw mapping helpers', () => {
  it('maps the worker profile into the CareerClaw user profile shape', () => {
    expect(
      buildCareerClawProfile({
        skills: ['React', 'TypeScript'],
        targetRoles: ['Senior Frontend Engineer'],
        experienceYears: 8,
        workMode: 'remote',
        resumeSummary: 'Frontend engineer with React and TypeScript experience.',
        locationPref: 'Florida',
        salaryMin: 150000,
      }),
    ).toEqual({
      skills: ['React', 'TypeScript'],
      target_roles: ['Senior Frontend Engineer'],
      experience_years: 8,
      work_mode: 'remote',
      resume_summary: 'Frontend engineer with React and TypeScript experience.',
      location: 'Florida',
      location_radius_km: null,
      salary_min: 150000,
    })
  })

  it('converts locationRadiusMi to km rounded to the nearest integer', () => {
    const profile = buildCareerClawProfile({
      workMode: 'onsite',
      locationPref: 'Miami, FL',
      locationRadiusMi: 25,
    })
    // 25 mi × 1.60934 = 40.2335 → rounds to 40
    expect(profile.location_radius_km).toBe(40)
  })

  it('converts 50 miles correctly', () => {
    const profile = buildCareerClawProfile({
      workMode: 'onsite',
      locationPref: 'Austin, TX',
      locationRadiusMi: 50,
    })
    // 50 mi × 1.60934 = 80.467 → rounds to 80
    expect(profile.location_radius_km).toBe(80)
  })

  it('sets location_radius_km to null when locationRadiusMi is not provided', () => {
    const profile = buildCareerClawProfile({
      workMode: 'onsite',
      locationPref: 'Chicago, IL',
    })
    expect(profile.location_radius_km).toBeNull()
  })

  it('builds a trusted CareerClaw context from the verified worker context', () => {
    expect(buildCareerClawExecutionContext(PRO_CTX)).toEqual({
      source: 'clawos',
      verified: true,
      tier: 'pro',
      features: ['careerclaw.topk_extended', 'careerclaw.llm_gap_analysis'],
    })
    expect(mockCreateClawOsExecutionContext).toHaveBeenCalledWith({
      tier: 'pro',
      features: ['careerclaw.topk_extended', 'careerclaw.llm_gap_analysis'],
    })
  })
})

describe('careerClawAdapter.execute', () => {
  it('calls CareerClaw via direct import with dryRun true and free-tier topK clamp', async () => {
    const result = await careerClawAdapter.execute(
      {
        profile: {
          skills: ['React', 'TypeScript'],
          targetRoles: ['Senior Frontend Engineer'],
          experienceYears: 8,
          workMode: 'remote',
          resumeSummary: 'Frontend engineer with React and TypeScript experience.',
          locationPref: 'Florida',
          salaryMin: 150000,
        },
        resumeText: 'Detailed resume text',
        topK: 10,
      },
      FREE_CTX,
    )

    expect(mockRunCareerClawWithContext).toHaveBeenCalledWith(
      {
        profile: {
          skills: ['React', 'TypeScript'],
          target_roles: ['Senior Frontend Engineer'],
          experience_years: 8,
          work_mode: 'remote',
          resume_summary: 'Frontend engineer with React and TypeScript experience.',
          location: 'Florida',
          location_radius_km: null,
          salary_min: 150000,
        },
        resumeText: 'Detailed resume text',
        topK: 3,
        dryRun: true,
      },
      {
        source: 'clawos',
        verified: true,
        tier: 'free',
        features: [],
      },
    )
    expect(result).toEqual({ matches: [], drafts: [] })
  })

  it('keeps topK at 10 for verified pro users with the extended topK feature', async () => {
    await careerClawAdapter.execute(
      {
        profile: {
          skills: [],
          targetRoles: [],
        },
        topK: 10,
      },
      PRO_CTX,
    )

    expect(mockRunCareerClawWithContext).toHaveBeenCalledWith(
      expect.objectContaining({ topK: 10, dryRun: true }),
      expect.objectContaining({
        tier: 'pro',
        features: ['careerclaw.topk_extended', 'careerclaw.llm_gap_analysis'],
      }),
    )
  })
})

describe('careerClawGapAnalysisAdapter.execute', () => {
  it('awaits the engine gap-analysis call and passes execution context through', async () => {
    const input = {
      match: {
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
      },
      resumeIntel: {
        extracted_keywords: ['TypeScript'],
        extracted_phrases: [],
        keyword_stream: ['TypeScript'],
        phrase_stream: [],
        impact_signals: ['TypeScript'],
        keyword_weights: { TypeScript: 1 },
        phrase_weights: {},
        source: 'resume_text',
      },
    }

    const result = await careerClawGapAnalysisAdapter.execute(input, PRO_CTX)

    expect(mockGenerateGapAnalysisForMatch).toHaveBeenCalledWith(input.match, input.resumeIntel, {
      executionContext: {
        source: 'clawos',
        verified: true,
        tier: 'pro',
        features: ['careerclaw.topk_extended', 'careerclaw.llm_gap_analysis'],
      },
    })
    expect(result).toEqual(
      expect.objectContaining({
        job_id: 'job-1',
        company: 'Acme',
      }),
    )
  })
})

describe('careerClawCoverLetterAdapter.execute', () => {
  it('passes the precomputed gap through to the engine cover-letter call', async () => {
    const precomputedGap = {
      fit_score: 0.7,
      fit_score_unweighted: 0.5,
      signals: { keywords: ['TypeScript'], phrases: [] },
      gaps: { keywords: ['Go'], phrases: [] },
      summary: {
        top_signals: { keywords: ['TypeScript'], phrases: [] },
        top_gaps: { keywords: ['Go'], phrases: [] },
      },
    }

    await careerClawCoverLetterAdapter.execute(
      {
        match: {
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
        },
        profile: {
          skills: ['TypeScript'],
          targetRoles: ['Engineer'],
        },
        resumeIntel: {
          extracted_keywords: ['TypeScript'],
          extracted_phrases: [],
          keyword_stream: ['TypeScript'],
          phrase_stream: [],
          impact_signals: ['TypeScript'],
          keyword_weights: { TypeScript: 1 },
          phrase_weights: {},
          source: 'resume_text',
        },
        precomputedGap,
      },
      PRO_CTX,
    )

    expect(mockGenerateCoverLetterForMatch).toHaveBeenCalledWith(
      expect.anything(),
      {
        skills: ['TypeScript'],
        target_roles: ['Engineer'],
        experience_years: null,
        work_mode: null,
        resume_summary: null,
        location: null,
        location_radius_km: null,
        salary_min: null,
      },
      expect.anything(),
      {
        precomputedGap,
        executionContext: {
          source: 'clawos',
          verified: true,
          tier: 'pro',
          features: ['careerclaw.topk_extended', 'careerclaw.llm_gap_analysis'],
        },
      },
    )
  })
})
