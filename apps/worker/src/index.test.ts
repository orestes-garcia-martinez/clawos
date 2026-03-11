/**
 * index.test.ts — Unit tests for the ClawOS skill worker.
 *
 * All tests run offline — no network calls, no real CLI invocation.
 * The careerclaw CLI is mocked at the module level.
 *
 * Run: npm test (from apps/worker/) or turbo run test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

// ── Mock cli-adapter before importing the app ─────────────────────────────────
// This prevents any real CLI invocation during tests.
vi.mock('./cli-adapter.js', () => ({
  runCareerClawCli: vi.fn(),
  CareerClawCliError: class CareerClawCliError extends Error {
    exitCode: number | null
    durationMs: number
    constructor(message: string, exitCode: number | null, durationMs: number) {
      super(message)
      this.name = 'CareerClawCliError'
      this.exitCode = exitCode
      this.durationMs = durationMs
    }
  },
}))

// Set required env before importing the app
process.env.WORKER_SECRET = 'test-secret-abc123'
process.env.CAREERCLAW_WORKSPACE_DIR = '/tmp/test-workspace'

// Import after mocks are set up
const { app } = await import('./index.js')
const { runCareerClawCli, CareerClawCliError } = await import('./cli-adapter.js')

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_PAYLOAD = {
  userId: '00000000-0000-0000-0000-000000000001',
  profile: { workMode: 'remote', salaryMin: 100000 },
  topK: 3,
}

const VALID_BRIEFING = {
  run: { jobs_fetched: 50, sources: { remoteok: 30, hackernews: 20 } },
  matches: [
    { score: 0.85, job: { title: 'Senior Engineer', company: 'Acme', url: 'https://example.com' } },
  ],
  drafts: [],
  tracking: { created: 1, already_present: 0 },
  dry_run: false,
}

// ── Auth middleware ───────────────────────────────────────────────────────────

describe('Auth middleware — /run/careerclaw', () => {
  it('rejects requests with no x-worker-secret header', async () => {
    const res = await request(app).post('/run/careerclaw').send(VALID_PAYLOAD)
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Unauthorized')
  })

  it('rejects requests with wrong secret', async () => {
    const res = await request(app)
      .post('/run/careerclaw')
      .set('x-worker-secret', 'wrong-secret')
      .send(VALID_PAYLOAD)
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Unauthorized')
  })

  it('accepts requests with correct secret', async () => {
    vi.mocked(runCareerClawCli).mockResolvedValueOnce({
      briefing: VALID_BRIEFING,
      durationMs: 1200,
    })
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
    expect(res.body.service).toBe('clawos-worker')
  })
})

// ── Input validation ──────────────────────────────────────────────────────────

describe('Zod input validation', () => {
  beforeEach(() => {
    vi.mocked(runCareerClawCli).mockResolvedValue({ briefing: VALID_BRIEFING, durationMs: 500 })
  })

  it('rejects missing userId', async () => {
    const res = await request(app)
      .post('/run/careerclaw')
      .set('x-worker-secret', 'test-secret-abc123')
      .send({ profile: {}, topK: 3 })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Invalid input')
  })

  it('rejects invalid userId (not a UUID)', async () => {
    const res = await request(app)
      .post('/run/careerclaw')
      .set('x-worker-secret', 'test-secret-abc123')
      .send({ ...VALID_PAYLOAD, userId: 'not-a-uuid' })
    expect(res.status).toBe(400)
  })

  it('rejects topK > 10', async () => {
    const res = await request(app)
      .post('/run/careerclaw')
      .set('x-worker-secret', 'test-secret-abc123')
      .send({ ...VALID_PAYLOAD, topK: 11 })
    expect(res.status).toBe(400)
  })

  it('rejects topK < 1', async () => {
    const res = await request(app)
      .post('/run/careerclaw')
      .set('x-worker-secret', 'test-secret-abc123')
      .send({ ...VALID_PAYLOAD, topK: 0 })
    expect(res.status).toBe(400)
  })

  it('rejects resumeText exceeding 50k chars', async () => {
    const res = await request(app)
      .post('/run/careerclaw')
      .set('x-worker-secret', 'test-secret-abc123')
      .send({ ...VALID_PAYLOAD, resumeText: 'x'.repeat(50_001) })
    expect(res.status).toBe(400)
  })

  it('rejects salaryMin > salaryMax', async () => {
    const res = await request(app)
      .post('/run/careerclaw')
      .set('x-worker-secret', 'test-secret-abc123')
      .send({ ...VALID_PAYLOAD, profile: { salaryMin: 200000, salaryMax: 100000 } })
    expect(res.status).toBe(400)
  })

  it('accepts valid payload with optional fields omitted', async () => {
    const res = await request(app)
      .post('/run/careerclaw')
      .set('x-worker-secret', 'test-secret-abc123')
      .send({ userId: VALID_PAYLOAD.userId, profile: {} })
    expect(res.status).toBe(200)
  })

  it('accepts locationPref in profile', async () => {
    const res = await request(app)
      .post('/run/careerclaw')
      .set('x-worker-secret', 'test-secret-abc123')
      .send({
        ...VALID_PAYLOAD,
        profile: { ...VALID_PAYLOAD.profile, locationPref: 'Florida, USA' },
      })
    expect(res.status).toBe(200)
  })
})

// ── Successful run ────────────────────────────────────────────────────────────

describe('POST /run/careerclaw — success path', () => {
  beforeEach(() => {
    vi.mocked(runCareerClawCli).mockResolvedValue({ briefing: VALID_BRIEFING, durationMs: 1800 })
  })

  it('returns briefing and durationMs on success', async () => {
    const res = await request(app)
      .post('/run/careerclaw')
      .set('x-worker-secret', 'test-secret-abc123')
      .send(VALID_PAYLOAD)
    expect(res.status).toBe(200)
    expect(res.body.briefing).toEqual(VALID_BRIEFING)
    expect(typeof res.body.durationMs).toBe('number')
  })

  it('passes topK and profile to the CLI adapter', async () => {
    await request(app)
      .post('/run/careerclaw')
      .set('x-worker-secret', 'test-secret-abc123')
      .send({ ...VALID_PAYLOAD, topK: 5 })
    expect(vi.mocked(runCareerClawCli)).toHaveBeenCalledWith(expect.objectContaining({ topK: 5 }))
  })

  it('passes resumeText to the CLI adapter when provided', async () => {
    await request(app)
      .post('/run/careerclaw')
      .set('x-worker-secret', 'test-secret-abc123')
      .send({ ...VALID_PAYLOAD, resumeText: 'Senior engineer...' })
    expect(vi.mocked(runCareerClawCli)).toHaveBeenCalledWith(
      expect.objectContaining({ resumeText: 'Senior engineer...' }),
    )
  })
})

// ── Error paths ───────────────────────────────────────────────────────────────

describe('POST /run/careerclaw — error paths', () => {
  it('returns 504 on CLI timeout', async () => {
    vi.mocked(runCareerClawCli).mockRejectedValueOnce(
      new (await import('./cli-adapter.js')).CareerClawCliError(
        'timed out after 30000ms',
        null,
        30000,
      ),
    )
    const res = await request(app)
      .post('/run/careerclaw')
      .set('x-worker-secret', 'test-secret-abc123')
      .send(VALID_PAYLOAD)
    expect(res.status).toBe(504)
    expect(res.body.error).toBe('Skill invocation timed out')
  })

  it('returns 500 on CLI non-zero exit', async () => {
    vi.mocked(runCareerClawCli).mockRejectedValueOnce(
      new (await import('./cli-adapter.js')).CareerClawCliError('exited with code 1', 1, 500),
    )
    const res = await request(app)
      .post('/run/careerclaw')
      .set('x-worker-secret', 'test-secret-abc123')
      .send(VALID_PAYLOAD)
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Skill invocation failed')
  })

  it('does not leak CLI error detail or file paths in error response', async () => {
    vi.mocked(runCareerClawCli).mockRejectedValueOnce(
      new (await import('./cli-adapter.js')).CareerClawCliError(
        'Profile not found: /home/clawos-admin/careerclaw-workspace/run-abc123/profile.json',
        1,
        200,
      ),
    )
    const res = await request(app)
      .post('/run/careerclaw')
      .set('x-worker-secret', 'test-secret-abc123')
      .send(VALID_PAYLOAD)
    expect(res.status).toBe(500)
    // Error body must not contain paths or internal details
    expect(JSON.stringify(res.body)).not.toContain('/home/clawos-admin')
    expect(JSON.stringify(res.body)).not.toContain('profile.json')
  })
})

// ── Audit log shape ───────────────────────────────────────────────────────────

describe('Audit log output', () => {
  it('logs a structured JSON entry on success — no resume text', async () => {
    vi.mocked(runCareerClawCli).mockResolvedValueOnce({
      briefing: VALID_BRIEFING,
      durationMs: 1200,
    })

    const logs: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((line: string) => {
      logs.push(line)
    })

    await request(app)
      .post('/run/careerclaw')
      .set('x-worker-secret', 'test-secret-abc123')
      .send({ ...VALID_PAYLOAD, resumeText: 'This is my resume text' })

    spy.mockRestore()

    const auditLine = logs.find((l) => {
      try {
        const p = JSON.parse(l)
        return p.skill === 'careerclaw'
      } catch {
        return false
      }
    })
    expect(auditLine).toBeDefined()

    const entry = JSON.parse(auditLine!)
    expect(entry.userId).toBe(VALID_PAYLOAD.userId)
    expect(entry.skill).toBe('careerclaw')
    expect(entry.status).toBe('success')
    expect(entry.statusCode).toBe(200)
    expect(typeof entry.durationMs).toBe('number')
    expect(typeof entry.timestamp).toBe('string')

    // Resume text must never appear in the audit log
    expect(auditLine).not.toContain('resume text')
    expect(auditLine).not.toContain('This is my resume')
  })
})
