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
import { CareerClawRunRequestSchema, buildAuditEntry } from '@clawos/security'
import type { SkillSlug } from '@clawos/shared'
import { InvalidSkillAssertionError, verifyAndConsumeSkillAssertion } from './assertion-verifier.js'
import { skillRegistry } from './registry.js'

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

  let ctx
  try {
    ctx = await verifyAndConsumeSkillAssertion({
      token: parseResult.data.assertion,
      expectedSkill: skillParam,
    })
  } catch (err) {
    const entry = buildAuditEntry({
      userId: 'unknown',
      skill: skillParam,
      channel: 'worker',
      status: 'error',
      statusCode: 403,
      durationMs: Date.now() - startMs,
    })
    console.log(JSON.stringify(entry))

    if (err instanceof InvalidSkillAssertionError) {
      res.status(403).json({ error: 'Invalid skill assertion' })
      return
    }

    res.status(403).json({ error: 'Invalid skill assertion' })
    return
  }

  const adapter = skillRegistry[skillParam]

  try {
    const input = adapter.validateInput(parseResult.data.input)
    const result = await withExecutionTimeout(
      adapter.execute(input, ctx),
      SKILL_EXECUTION_TIMEOUT_MS,
      skillParam,
    )

    const durationMs = Date.now() - startMs
    const entry = buildAuditEntry({
      userId: ctx.userId,
      skill: skillParam,
      channel: 'worker',
      status: 'success',
      statusCode: 200,
      durationMs,
    })
    console.log(JSON.stringify(entry))

    res.status(200).json({ result, durationMs })
  } catch (err) {
    const durationMs = Date.now() - startMs

    if (err instanceof SkillExecutionTimeoutError) {
      const entry = buildAuditEntry({
        userId: ctx.userId,
        skill: skillParam,
        channel: 'worker',
        status: 'error',
        statusCode: 504,
        durationMs,
      })
      console.log(JSON.stringify(entry))
      res.status(504).json({ error: 'Skill invocation timed out' })
      return
    }

    const entry = buildAuditEntry({
      userId: ctx.userId,
      skill: skillParam,
      channel: 'worker',
      status: 'error',
      statusCode: 500,
      durationMs,
    })
    console.log(JSON.stringify(entry))
    console.error(
      `[worker] Unexpected error in /run/${skillParam}:`,
      err instanceof Error ? err.message : String(err),
    )

    res.status(500).json({ error: 'Internal worker error' })
  }
})

const port = Number(process.env.PORT ?? 3002)
app.listen(port, () => {
  console.log(`[worker] ClawOS skill worker running on http://localhost:${port}`)
})

export { app }
