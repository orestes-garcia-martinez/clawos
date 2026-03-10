// ClawOS Lightsail Skill Worker
// Thin Express wrapper around the careerclaw-js CLI.
// Chat 3 builds the full implementation: CLI invocation, non-root execution, audit logging.
//
// Security constraints enforced here from day one:
//   - WORKER_SECRET required to start (no secret = no start)
//   - All /run/* routes require x-worker-secret header
//   - /health is public (used by monitoring)
//   - Input validated with Zod before touching business logic
//   - Worker never runs as root (enforced by systemd service in Chat 3)

import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import { CareerClawRunSchema } from '@clawos/security'

// ── Boot guard ────────────────────────────────────────────────────────────────

const WORKER_SECRET = process.env.WORKER_SECRET
if (!WORKER_SECRET) {
  console.error('[worker] Fatal: WORKER_SECRET env var is required. Refusing to start.')
  process.exit(1)
}

// ── App ───────────────────────────────────────────────────────────────────────

const app = express()
app.use(express.json({ limit: '1mb' }))

// ── Health check — no auth ────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'clawos-worker', version: '0.1.0' })
})

// ── Auth middleware for all /run/* routes ─────────────────────────────────────
function requireWorkerSecret(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers['x-worker-secret']
  if (header !== WORKER_SECRET) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
}

// ── POST /run/careerclaw ──────────────────────────────────────────────────────
// Accepts: { userId, profile, resumeText?, topK }
// Returns: { matches, runId, durationMs }
// Full implementation: Chat 3
app.post('/run/careerclaw', requireWorkerSecret, (req: Request, res: Response) => {
  const result = CareerClawRunSchema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({
      error: 'Invalid input',
      details: result.error.flatten(),
    })
    return
  }

  // TODO Chat 3: Spawn careerclaw-js CLI as non-root user
  // TODO Chat 3: Stream progress events back
  // TODO Chat 3: Write audit log entry (metadata only — no resume text)
  // TODO Chat 3: Return structured JSON result

  res.status(501).json({
    error: 'Not implemented',
    message: 'Full CLI invocation implemented in Chat 3',
  })
})

// ── Server ────────────────────────────────────────────────────────────────────
const port = Number(process.env.PORT ?? 3002)
app.listen(port, () => {
  console.log(`[worker] ClawOS skill worker running on http://localhost:${port}`)
})
