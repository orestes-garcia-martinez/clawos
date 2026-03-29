/**
 * worker-client.ts — Typed HTTP client for the Lightsail skill worker.
 *
 * Sends authenticated POST requests to the worker's /run/:skill endpoints.
 * The worker is the only process that executes skill adapters.
 *
 * Auth: x-worker-secret header — shared secret, never in URLs or logs.
 * Timeout: 30s hard limit (matches the worker's CLI_TIMEOUT_MS).
 */

import type {
  CareerClawWorkerInput,
  CareerClawGapAnalysisWorkerInput,
  CareerClawCoverLetterWorkerInput,
  SkillSlug,
  WorkerSkillRunRequest,
  WorkerSkillRunResult,
} from '@clawos/shared'
import { ENV } from './env.js'

const WORKER_TIMEOUT_MS = 30_000

export class WorkerError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly isTimeout: boolean = false,
  ) {
    super(message)
    this.name = 'WorkerError'
  }
}

async function workerFetch<TInput, TResult>(
  path: string,
  body: WorkerSkillRunRequest<TInput>,
): Promise<WorkerSkillRunResult<TResult>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS)

  try {
    const response = await fetch(`${ENV.WORKER_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-worker-secret': ENV.WORKER_SECRET,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) {
      const json = await response.json().catch(() => ({}))
      const errMsg = (json as { error?: string }).error ?? `Worker returned ${response.status}`
      throw new WorkerError(errMsg, response.status, response.status === 504)
    }

    return (await response.json()) as WorkerSkillRunResult<TResult>
  } catch (err) {
    if (err instanceof WorkerError) throw err
    if (err instanceof Error && err.name === 'AbortError') {
      throw new WorkerError('Skill worker request timed out', 504, true)
    }
    throw new WorkerError(
      err instanceof Error ? err.message : 'Failed to contact skill worker',
      503,
    )
  } finally {
    clearTimeout(timer)
  }
}

export async function runWorkerSkill<TInput, TResult>(
  skill: SkillSlug,
  body: WorkerSkillRunRequest<TInput>,
): Promise<WorkerSkillRunResult<TResult>> {
  return workerFetch(`/run/${skill}`, body)
}

export function runWorkerCareerclaw(
  body: WorkerSkillRunRequest<CareerClawWorkerInput>,
): Promise<WorkerSkillRunResult<Record<string, unknown>>> {
  return runWorkerSkill<CareerClawWorkerInput, Record<string, unknown>>('careerclaw', body)
}

export function runWorkerGapAnalysis(
  body: WorkerSkillRunRequest<CareerClawGapAnalysisWorkerInput>,
): Promise<WorkerSkillRunResult<Record<string, unknown>>> {
  return workerFetch('/run/careerclaw/gap-analysis', body)
}

export function runWorkerCoverLetter(
  body: WorkerSkillRunRequest<CareerClawCoverLetterWorkerInput>,
): Promise<WorkerSkillRunResult<Record<string, unknown>>> {
  return workerFetch('/run/careerclaw/cover-letter', body)
}
