/**
 * app.ts — Express application factory
 *
 * Constructs and configures the Express app: middleware, shared helpers,
 * generic /run/:skill route, and per-skill sub-routers.
 *
 * Kept separate from index.ts so the app can be imported by tests and by the
 * Lightsail entry point without running server startup side-effects.
 */

import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import { timingSafeEqual } from 'node:crypto'
import {
  CareerClawRunRequestSchema,
  ScrapeClawRunRequestSchema,
  buildAuditEntry,
} from '@clawos/security'
import { SKILL_SLUGS } from '@clawos/shared'
import type { SkillSlug } from '@clawos/shared'
import { verifyAndConsumeSkillAssertion } from './assertion-verifier.js'
import { skillRegistry } from './registry.js'
import { createCareerClawRouter } from './skills/careerclaw/router.js'
import { createRequire } from 'node:module'

// ── Package version ───────────────────────────────────────────────────────────
const require = createRequire(import.meta.url)
const pkg = require('../package.json') as { version: string }

// ── Env ───────────────────────────────────────────────────────────────────────
const WORKER_SECRET = process.env.WORKER_SECRET
if (!WORKER_SECRET) {
  console.error('[worker] Fatal: WORKER_SECRET env var is required. Refusing to start.')
  process.exit(1)
}

const WORKER_SECRET_BUF = Buffer.from(WORKER_SECRET)

export function numberEnv(key: string, fallback: number): number {
  const raw = process.env[key]
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`[worker] Fatal: environment variable "${key}" must be a positive number.`)
    process.exit(1)
  }
  return value
}

const SKILL_EXECUTION_TIMEOUT_MS = numberEnv('SKILL_EXECUTION_TIMEOUT_MS', 60_000)

// ── Timeout helper ────────────────────────────────────────────────────────────

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

// ── Shared route helper ───────────────────────────────────────────────────────

type VerifiedSkillExecutionContext = Awaited<ReturnType<typeof verifyAndConsumeSkillAssertion>>

/**
 * Handles assertion verification, audit logging, and error handling shared by
 * all skill route handlers. Pass `fn` which receives the verified context and
 * returns the result payload.
 */
export async function runWorkerAction(
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

// ── Middleware ────────────────────────────────────────────────────────────────

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
  return (SKILL_SLUGS as readonly string[]).includes(value)
}

// ── App factory ───────────────────────────────────────────────────────────────

const runRequestSchemaBySkill: Partial<
  Record<SkillSlug, typeof CareerClawRunRequestSchema | typeof ScrapeClawRunRequestSchema>
> = {
  careerclaw: CareerClawRunRequestSchema,
  scrapeclaw: ScrapeClawRunRequestSchema,
}

export const app = express()
app.use(express.json({ limit: '1mb' }))

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'clawos-worker',
    version: pkg.version,
    timestamp: new Date().toISOString(),
  })
})

// Generic skill dispatch — handles all skills registered in skillRegistry
app.post('/run/:skill', requireWorkerSecret, async (req: Request, res: Response): Promise<void> => {
  const skillParam = req.params['skill']
  if (typeof skillParam !== 'string' || !isSkillSlug(skillParam)) {
    res.status(404).json({ error: 'Unknown skill' })
    return
  }

  const adapter = skillRegistry[skillParam]
  if (!adapter) {
    res.status(404).json({ error: 'Unknown skill' })
    return
  }

  const schema = runRequestSchemaBySkill[skillParam]
  if (!schema) {
    res.status(400).json({ error: 'Invalid input' })
    return
  }

  const parseResult = schema.safeParse(req.body)
  if (!parseResult.success) {
    res.status(400).json({ error: 'Invalid input', details: parseResult.error.flatten() })
    return
  }

  const startMs = Date.now()
  const input = adapter.validateInput(parseResult.data.input)
  await runWorkerAction(
    res,
    { skill: skillParam, startMs, assertion: parseResult.data.assertion, timeout: true },
    (ctx) => adapter.execute(input, ctx),
  )
})

// Per-skill sub-routers — each skill owns its own extended routes
app.use('/run/careerclaw', requireWorkerSecret, createCareerClawRouter(runWorkerAction))
