import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VerifiedSkillExecutionContext } from '@clawos/shared'

const mockRunCareerClawWithContext = vi.fn()
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
}))

const { buildCareerClawExecutionContext, buildCareerClawProfile, careerClawAdapter, clampTopK } =
  await import('./adapter.js')

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
  features: ['careerclaw.topk_extended'],
  requestId: 'req-pro',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRunCareerClawWithContext.mockResolvedValue({ matches: [], drafts: [] })
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
      salary_min: 150000,
    })
  })

  it('builds a trusted CareerClaw context from the verified worker context', () => {
    expect(buildCareerClawExecutionContext(PRO_CTX)).toEqual({
      source: 'clawos',
      verified: true,
      tier: 'pro',
      features: ['careerclaw.topk_extended'],
    })
    expect(mockCreateClawOsExecutionContext).toHaveBeenCalledWith({
      tier: 'pro',
      features: ['careerclaw.topk_extended'],
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
      expect.objectContaining({ tier: 'pro', features: ['careerclaw.topk_extended'] }),
    )
  })
})
