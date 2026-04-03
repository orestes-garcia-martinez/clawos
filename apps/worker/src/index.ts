/**
 * index.ts — ClawOS Lightsail Skill Worker
 *
 * Thin Express wrapper around verified skill adapter invocations.
 * The worker verifies signed API->worker entitlement assertions before
 * dispatching any skill execution.
 */

import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import { timingSafeEqual } from 'node:crypto'
import {
  CareerClawRunRequestSchema,
  CareerClawGapAnalysisRequestSchema,
  CareerClawCoverLetterRequestSchema,
  buildAuditEntry,
} from '@clawos/security'
import type { SkillSlug } from '@clawos/shared'
import { verifyAndConsumeSkillAssertion } from './assertion-verifier.js'
import { skillRegistry } from './registry.js'
import {
  careerClawGapAnalysisAdapter,
  careerClawCoverLetterAdapter,
} from './skills/careerclaw/adapter.js'

const WORKER_SECRET = process.env.WORKER_SECRET
if (!WORKER_SECRET) {
  console.error('[worker] Fatal: WORKER_SECRET env var is required. Refusing to start.')
  process.exit(1)
}

const WORKER_SECRET_BUF = Buffer.from(WORKER_SECRET)
const SKILL_EXECUTION_TIMEOUT_MS = Number(process.env.SKILL_EXECUTION_TIMEOUT_MS ?? 30_000)

class SkillExecutionTimeoutError extends Error {
  constructor(
    message: string,
    public readonly timeoutMs: number,
  ) {
    super(message)
    this.name = 'SkillExecutionTimeoutError'
  }
}

function withExecutionTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  skill: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new SkillExecutionTimeoutError(`${skill} timed out after ${timeoutMs}ms`, timeoutMs))
    }, timeoutMs)

    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

// ── Shared route helper ──────────────────────────────────────────────────────

type VerifiedSkillExecutionContext = Awaited<ReturnType<typeof verifyAndConsumeSkillAssertion>>

/**
 * Handles the common assertion verification + audit logging + error handling
 * pattern shared by all skill route handlers. Callers pass `fn` which receives
 * the verified context and returns the result payload.
 *
 * @param timeout - When true, wraps fn in withExecutionTimeout (for async skills).
 */
async function runWorkerAction(
  res: Response,
  opts: {
    skill: SkillSlug
    startMs: number
    assertion: string
    timeout?: boolean
  },
  fn: (ctx: VerifiedSkillExecutionContext) => Promise<Record<string, unknown>>,
): Promise<void> {
  let ctx: VerifiedSkillExecutionContext
  try {
    ctx = await verifyAndConsumeSkillAssertion({ token: opts.assertion, expectedSkill: opts.skill })
  } catch {
    console.log(
      JSON.stringify(
        buildAuditEntry({
          userId: 'unknown',
          skill: opts.skill,
          channel: 'worker',
          status: 'error',
          statusCode: 403,
          durationMs: Date.now() - opts.startMs,
        }),
      ),
    )
    res.status(403).json({ error: 'Invalid skill assertion' })
    return
  }

  try {
    const execute = fn(ctx)
    const result = opts.timeout
      ? await withExecutionTimeout(execute, SKILL_EXECUTION_TIMEOUT_MS, opts.skill)
      : await execute
    const durationMs = Date.now() - opts.startMs
    console.log(
      JSON.stringify(
        buildAuditEntry({
          userId: ctx.userId,
          skill: opts.skill,
          channel: 'worker',
          status: 'success',
          statusCode: 200,
          durationMs,
        }),
      ),
    )
    res.status(200).json({ result, durationMs })
  } catch (err) {
    const durationMs = Date.now() - opts.startMs
    const isTimeout = err instanceof SkillExecutionTimeoutError
    console.log(
      JSON.stringify(
        buildAuditEntry({
          userId: ctx.userId,
          skill: opts.skill,
          channel: 'worker',
          status: 'error',
          statusCode: isTimeout ? 504 : 500,
          durationMs,
        }),
      ),
    )
    if (isTimeout) {
      res.status(504).json({ error: 'Skill invocation timed out' })
      return
    }
    console.error(
      `[worker] Unexpected error in /run/${opts.skill}:`,
      err instanceof Error ? err.message : String(err),
    )
    res.status(500).json({ error: 'Internal worker error' })
  }
}

const app = express()
app.use(express.json({ limit: '1mb' }))

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'clawos-worker', version: '0.2.0' })
})

function requireWorkerSecret(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers['x-worker-secret']
  if (typeof header !== 'string') {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const headerBuf = Buffer.from(header)
  if (
    headerBuf.length !== WORKER_SECRET_BUF.length ||
    !timingSafeEqual(headerBuf, WORKER_SECRET_BUF)
  ) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  next()
}

function isSkillSlug(value: string): value is SkillSlug {
  return value === 'careerclaw'
}

app.post('/run/:skill', requireWorkerSecret, async (req: Request, res: Response): Promise<void> => {
  const skillParam = req.params['skill']
  if (typeof skillParam !== 'string' || !isSkillSlug(skillParam)) {
    res.status(404).json({ error: 'Unknown skill' })
    return
  }

  const parseResult =
    skillParam === 'careerclaw' ? CareerClawRunRequestSchema.safeParse(req.body) : null

  if (!parseResult || !parseResult.success) {
    res.status(400).json({
      error: 'Invalid input',
      details: parseResult?.success === false ? parseResult.error.flatten() : undefined,
    })
    return
  }

  const startMs = Date.now()
  const adapter = skillRegistry[skillParam]
  const input = adapter.validateInput(parseResult.data.input)

  await runWorkerAction(
    res,
    { skill: skillParam, startMs, assertion: parseResult.data.assertion, timeout: true },
    (ctx) => adapter.execute(input, ctx),
  )
})

// ── Post-briefing action routes ──────────────────────────────────────────────

app.post(
  '/run/careerclaw/gap-analysis',
  requireWorkerSecret,
  async (req: Request, res: Response): Promise<void> => {
    const startMs = Date.now()

    const parseResult = CareerClawGapAnalysisRequestSchema.safeParse(req.body)
    if (!parseResult.success) {
      res.status(400).json({
        error: 'Invalid input',
        details: parseResult.error.flatten(),
      })
      return
    }

    const input = careerClawGapAnalysisAdapter.validateInput(parseResult.data.input)
    // Gap analysis is synchronous — no timeout wrapper needed.
    await runWorkerAction(
      res,
      { skill: 'careerclaw', startMs, assertion: parseResult.data.assertion },
      (ctx) => Promise.resolve(careerClawGapAnalysisAdapter.execute(input, ctx)),
    )
  },
)

app.post(
  '/run/careerclaw/cover-letter',
  requireWorkerSecret,
  async (req: Request, res: Response): Promise<void> => {
    const startMs = Date.now()

    const parseResult = CareerClawCoverLetterRequestSchema.safeParse(req.body)
    if (!parseResult.success) {
      res.status(400).json({
        error: 'Invalid input',
        details: parseResult.error.flatten(),
      })
      return
    }

    const input = careerClawCoverLetterAdapter.validateInput(parseResult.data.input)
    await runWorkerAction(
      res,
      {
        skill: 'careerclaw',
        startMs,
        assertion: parseResult.data.assertion,
        timeout: true,
      },
      (ctx) => careerClawCoverLetterAdapter.execute(input, ctx),
    )
  },
)

const port = Number(process.env.PORT ?? 3002)
app.listen(port, () => {
  console.log(`[worker] ClawOS skill worker running on http://localhost:${port}`)
})

export { app }
