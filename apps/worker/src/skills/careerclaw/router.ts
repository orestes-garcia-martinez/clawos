import express from 'express'
import type { Request, Response } from 'express'
import {
  CareerClawGapAnalysisRequestSchema,
  CareerClawCoverLetterRequestSchema,
} from '@clawos/security'
import type { VerifiedSkillExecutionContext } from '@clawos/shared'
import { careerClawGapAnalysisAdapter, careerClawCoverLetterAdapter } from './adapter.js'

// ── CareerClaw sub-routes ─────────────────────────────────────────────────────
// Mounted at /run/careerclaw by app.ts; sub-paths become:
//   POST /run/careerclaw/gap-analysis
//   POST /run/careerclaw/cover-letter
//
// runWorkerAction is injected so this router stays decoupled from the server
// bootstrap and can be tested independently.

export type WorkerActionRunner = (
  res: Response,
  opts: { skill: 'careerclaw'; startMs: number; assertion: string; timeout?: boolean },
  fn: (ctx: VerifiedSkillExecutionContext) => Promise<Record<string, unknown>>,
) => Promise<void>

export function createCareerClawRouter(runWorkerAction: WorkerActionRunner): express.Router {
  const router = express.Router()

  router.post('/gap-analysis', async (req: Request, res: Response): Promise<void> => {
    const startMs = Date.now()
    const parseResult = CareerClawGapAnalysisRequestSchema.safeParse(req.body)
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid input', details: parseResult.error.flatten() })
      return
    }
    const input = careerClawGapAnalysisAdapter.validateInput(parseResult.data.input)
    await runWorkerAction(
      res,
      { skill: 'careerclaw', startMs, assertion: parseResult.data.assertion, timeout: true },
      (ctx) => careerClawGapAnalysisAdapter.execute(input, ctx),
    )
  })

  router.post('/cover-letter', async (req: Request, res: Response): Promise<void> => {
    const startMs = Date.now()
    const parseResult = CareerClawCoverLetterRequestSchema.safeParse(req.body)
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid input', details: parseResult.error.flatten() })
      return
    }
    const input = careerClawCoverLetterAdapter.validateInput(parseResult.data.input)
    await runWorkerAction(
      res,
      { skill: 'careerclaw', startMs, assertion: parseResult.data.assertion, timeout: true },
      (ctx) => careerClawCoverLetterAdapter.execute(input, ctx),
    )
  })

  return router
}
