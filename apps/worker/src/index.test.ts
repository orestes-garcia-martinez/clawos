import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'

const mockVerifyAndConsumeSkillAssertion = vi.fn()
const mockCareerClawValidateInput = vi.fn((input) => input)
const mockCareerClawExecute = vi.fn()
const mockScrapeClawValidateInput = vi.fn((input) => input)
const mockScrapeClawExecute = vi.fn()

vi.mock('./assertion-verifier.js', () => ({
  verifyAndConsumeSkillAssertion: mockVerifyAndConsumeSkillAssertion,
  InvalidSkillAssertionError: class InvalidSkillAssertionError extends Error {
    constructor() {
      super('Invalid skill assertion')
      this.name = 'InvalidSkillAssertionError'
    }
  },
}))

vi.mock('./registry.js', () => ({
  skillRegistry: {
    careerclaw: {
      slug: 'careerclaw',
      validateInput: mockCareerClawValidateInput,
      execute: mockCareerClawExecute,
    },
    scrapeclaw: {
      slug: 'scrapeclaw',
      validateInput: mockScrapeClawValidateInput,
      execute: mockScrapeClawExecute,
    },
  },
}))

process.env.WORKER_SECRET = 'test-secret-abc123'
process.env.SKILL_EXECUTION_TIMEOUT_MS = '100' // Short timeout for testing
process.env.SKILL_ASSERTION_PUBLIC_KEYS_JSON = JSON.stringify({
  'skill-assertion-current': '-----BEGIN PUBLIC KEY-----\nTEST\n-----END PUBLIC KEY-----',
})

const { app } = await import('./index.js')
const { InvalidSkillAssertionError } = await import('./assertion-verifier.js')

const VALID_PAYLOAD = {
  assertion: 'test-assertion-token-that-is-at-least-32-chars-long',
  input: {
    profile: { workMode: 'remote', salaryMin: 100000 },
    topK: 3,
  },
}

const VERIFIED_CTX = {
  source: 'clawos' as const,
  verified: true as const,
  userId: '00000000-0000-0000-0000-000000000001',
  skill: 'careerclaw' as const,
  tier: 'pro' as const,
  features: ['careerclaw.topk_extended'],
  requestId: 'req-1',
  issuedAt: 1700000000,
  expiresAt: 1700000060,
}

describe('worker route auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifyAndConsumeSkillAssertion.mockResolvedValue(VERIFIED_CTX)
    mockCareerClawExecute.mockResolvedValue({ matches: [] })
    mockScrapeClawExecute.mockResolvedValue({ rankedProspects: [] })
  })

  it('rejects requests with no x-worker-secret header', async () => {
    const res = await request(app).post('/run/careerclaw').send(VALID_PAYLOAD)
    expect(res.status).toBe(401)
  })

  it('rejects requests with wrong secret', async () => {
    const res = await request(app)
      .post('/run/careerclaw')
      .set('x-worker-secret', 'wrong-secret')
      .send(VALID_PAYLOAD)
    expect(res.status).toBe(401)
  })

  it('accepts requests with correct secret', async () => {
    const res = await request(app)
      .post('/run/careerclaw')
      .set('x-worker-secret', 'test-secret-abc123')
      .send(VALID_PAYLOAD)
    expect(res.status).toBe(200)
  })
})

describe('/health', () => {
  it('returns 200 with no auth', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })
})

describe('assertion validation and dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifyAndConsumeSkillAssertion.mockResolvedValue(VERIFIED_CTX)
    mockCareerClawValidateInput.mockImplementation((input) => input)
    mockCareerClawExecute.mockResolvedValue({ matches: [] })
    mockScrapeClawValidateInput.mockImplementation((input) => input)
    mockScrapeClawExecute.mockResolvedValue({ rankedProspects: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects missing assertion', async () => {
    const res = await request(app)
      .post('/run/careerclaw')
      .set('x-worker-secret', 'test-secret-abc123')
      .send({ input: { profile: {}, topK: 3 } })
    expect(res.status).toBe(400)
  })

  it('rejects invalid assertions with 403', async () => {
    mockVerifyAndConsumeSkillAssertion.mockRejectedValueOnce(new InvalidSkillAssertionError())
    const res = await request(app)
      .post('/run/careerclaw')
      .set('x-worker-secret', 'test-secret-abc123')
      .send(VALID_PAYLOAD)
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('Invalid skill assertion')
  })

  it('dispatches through the skill registry on success', async () => {
    mockCareerClawExecute.mockResolvedValueOnce({ matches: [{ score: 0.9 }] })
    const res = await request(app)
      .post('/run/careerclaw')
      .set('x-worker-secret', 'test-secret-abc123')
      .send(VALID_PAYLOAD)

    expect(res.status).toBe(200)
    expect(mockVerifyAndConsumeSkillAssertion).toHaveBeenCalledWith({
      token: 'test-assertion-token-that-is-at-least-32-chars-long',
      expectedSkill: 'careerclaw',
    })
    expect(mockCareerClawValidateInput).toHaveBeenCalledWith({
      profile: {
        workMode: 'remote',
        salaryMin: 100000,
        skills: [],
        targetRoles: [],
      },
      topK: 3,
    })
    expect(mockCareerClawExecute).toHaveBeenCalledWith(
      expect.objectContaining({ topK: 3 }),
      VERIFIED_CTX,
    )
  })

  it('logs audit entries with the verified user id', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    await request(app)
      .post('/run/careerclaw')
      .set('x-worker-secret', 'test-secret-abc123')
      .send(VALID_PAYLOAD)

    const logged = consoleSpy.mock.calls.map((call) => String(call[0]))
    expect(logged.some((line) => line.includes(VERIFIED_CTX.userId))).toBe(true)
    consoleSpy.mockRestore()
  })

  it('returns 504 on adapter timeout', async () => {
    // Mock returns a promise that never resolves — real 100ms timeout will trigger
    mockCareerClawExecute.mockImplementationOnce(() => new Promise(() => {}))

    const res = await request(app)
      .post('/run/careerclaw')
      .set('x-worker-secret', 'test-secret-abc123')
      .send(VALID_PAYLOAD)

    expect(res.status).toBe(504)
    expect(res.body.error).toBe('Skill invocation timed out')
  })

  it('returns 500 on adapter failure', async () => {
    mockCareerClawExecute.mockRejectedValueOnce(new Error('runtime exploded'))
    const res = await request(app)
      .post('/run/careerclaw')
      .set('x-worker-secret', 'test-secret-abc123')
      .send(VALID_PAYLOAD)
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Internal worker error')
  })
})

const VALID_SCRAPECLAW_PAYLOAD = {
  assertion: 'test-assertion-token-that-is-at-least-32-chars-long',
  input: {
    wedgeSlug: 'residential_property_management',
    marketCity: 'Green Cove Springs',
    marketRegion: 'Clay County',
    candidates: [{ name: 'Example PM', canonicalWebsiteUrl: 'https://examplepm.com' }],
  },
}

describe('scrapeclaw dispatch', () => {
  it('accepts a valid scrapeclaw request through the generic route', async () => {
    mockVerifyAndConsumeSkillAssertion.mockResolvedValueOnce({
      ...VERIFIED_CTX,
      skill: 'scrapeclaw',
    })
    mockScrapeClawExecute.mockResolvedValueOnce({
      rankedProspects: [{ business: { name: 'Example PM' } }],
    })
    const res = await request(app)
      .post('/run/scrapeclaw')
      .set('x-worker-secret', 'test-secret-abc123')
      .send(VALID_SCRAPECLAW_PAYLOAD)
    expect(res.status).toBe(200)
    expect(mockScrapeClawValidateInput).toHaveBeenCalledWith(VALID_SCRAPECLAW_PAYLOAD.input)
    expect(mockScrapeClawExecute).toHaveBeenCalled()
  })
})
