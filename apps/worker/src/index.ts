/**
 * index.ts — ClawOS Lightsail Skill Worker
 *
 * Thin Express wrapper around skill CLI invocations.
 * All business logic lives in the skill engines (careerclaw-js, etc.)
 * This server only handles: auth, validation, spawning, and audit logging.
 *
 * Security constraints:
 *   - WORKER_SECRET required to start (no secret = no start)
 *   - All /run/* routes require x-worker-secret header (constant-time compare)
 *   - /health is public
 *   - Input validated with Zod before any CLI invocation
 *   - Worker runs as non-root (clawos-admin) enforced by systemd service
 *   - CLI never receives raw resume text as an argument (written to temp file)
 *   - Audit logs record metadata only — no resume text, prompts, or message bodies
 */

import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import { CareerClawRunSchema, buildAuditEntry } from '@clawos/security'
import { runCareerClawCli, CareerClawCliError } from './cli-adapter.js'
import { timingSafeEqual } from 'node:crypto'

// ── Boot guard ────────────────────────────────────────────────────────────────

const WORKER_SECRET = process.env.WORKER_SECRET
if (!WORKER_SECRET) {
  console.error('[worker] Fatal: WORKER_SECRET env var is required. Refusing to start.')
  process.exit(1)
}

const WORKER_SECRET_BUF = Buffer.from(WORKER_SECRET)

// ── App ───────────────────────────────────────────────────────────────────────

const app = express()
app.use(express.json({ limit: '1mb' }))

// ── Health check — no auth ────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'clawos-worker', version: '0.1.0' })
})

// ── Auth middleware for all /run/* routes ─────────────────────────────────────
// Constant-time compare prevents timing attacks on the shared secret.
function requireWorkerSecret(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers['x-worker-secret']
  if (typeof header !== 'string') {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  const headerBuf = Buffer.from(header)
  // Buffers must be the same length for timingSafeEqual
  if (
    headerBuf.length !== WORKER_SECRET_BUF.length ||
    !timingSafeEqual(headerBuf, WORKER_SECRET_BUF)
  ) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
}

// ── POST /run/careerclaw ──────────────────────────────────────────────────────
// Accepts: { userId, profile, resumeText?, topK }
// Returns: { briefing, durationMs }
//
// The skill worker is intentionally stateless — it does not write to Supabase.
// The Agent API is responsible for persisting run metadata after receiving
// the worker response. This keeps the skill layer decoupled from the platform.
//
// The CLI is always invoked with --dry-run for the same reason: tracking.json
// and runs.jsonl are not used. Supabase tables (careerclaw_runs,
// careerclaw_job_tracking) are the persistence layer for ClawOS.
app.post(
  '/run/careerclaw',
  requireWorkerSecret,
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = CareerClawRunSchema.safeParse(req.body)
    if (!parseResult.success) {
      res.status(400).json({
        error: 'Invalid input',
        details: parseResult.error.flatten(),
      })
      return
    }

    const { userId, profile, resumeText, topK } = parseResult.data
    const startMs = Date.now()

    try {
      const result = await runCareerClawCli({
        profile: {
          name: profile.name,
          skills: profile.skills,
          targetRoles: profile.targetRoles,
          experienceYears: profile.experienceYears,
          resumeSummary: profile.resumeSummary,
          workMode: profile.workMode,
          salaryMin: profile.salaryMin,
          salaryMax: profile.salaryMax,
          locationPref: profile.locationPref,
        },
        resumeText,
        topK,
      })

      // Audit log — metadata only
      const entry = buildAuditEntry({
        userId,
        skill: 'careerclaw',
        channel: 'worker',
        status: 'success',
        statusCode: 200,
        durationMs: result.durationMs,
      })
      console.log(JSON.stringify(entry))

      res.status(200).json({
        briefing: result.briefing,
        durationMs: result.durationMs,
      })
    } catch (err) {
      const durationMs = Date.now() - startMs

      if (err instanceof CareerClawCliError) {
        const isTimeout = err.message.includes('timed out')

        // Audit log — metadata only, never the CLI error detail which may contain paths
        const entry = buildAuditEntry({
          userId,
          skill: 'careerclaw',
          channel: 'worker',
          status: 'error',
          statusCode: isTimeout ? 504 : 500,
          durationMs,
        })
        console.log(JSON.stringify(entry))

        if (isTimeout) {
          res.status(504).json({ error: 'Skill invocation timed out' })
        } else {
          // Do not leak CLI error message to the caller — it may contain file paths
          res.status(500).json({ error: 'Skill invocation failed' })
        }
        return
      }

      // Unexpected error — log and return generic 500
      const entry = buildAuditEntry({
        userId,
        skill: 'careerclaw',
        channel: 'worker',
        status: 'error',
        statusCode: 500,
        durationMs,
      })
      console.log(JSON.stringify(entry))
      console.error(
        '[worker] Unexpected error in /run/careerclaw:',
        err instanceof Error ? err.message : String(err),
      )

      res.status(500).json({ error: 'Internal worker error' })
    }
  },
)

// ── Server ────────────────────────────────────────────────────────────────────
const port = Number(process.env.PORT ?? 3002)
app.listen(port, () => {
  console.log(`[worker] ClawOS skill worker running on http://localhost:${port}`)
})

export { app }
