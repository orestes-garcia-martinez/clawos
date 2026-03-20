/**
 * worker-client.ts — Typed HTTP client for the Lightsail skill worker.
 *
 * Sends authenticated POST requests to the worker's /run/* endpoints.
 * The worker is the only process that executes skill CLI commands.
 *
 * Auth: x-worker-secret header — shared secret, never in URLs or logs.
 * Timeout: 30s hard limit (matches the worker's CLI_TIMEOUT_MS).
 */

import { ENV } from './env.js'

const WORKER_TIMEOUT_MS = 30_000

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorkerRunInput {
  userId: string
  profile: {
    name?: string
    workMode?: 'remote' | 'hybrid' | 'onsite'
    salaryMin?: number
    salaryMax?: number
    locationPref?: string
    skills?: string[]
    targetRoles?: string[]
    experienceYears?: number
    resumeSummary?: string
  }
  resumeText?: string
  topK: number
}

export interface WorkerRunResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  briefing: Record<string, any>
  durationMs: number
}

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

// ── Client ────────────────────────────────────────────────────────────────────

/**
 * Invoke the CareerClaw skill on the Lightsail worker.
 * Throws WorkerError on timeout, non-2xx, or network failure.
 */
export async function runWorkerCareerclaw(input: WorkerRunInput): Promise<WorkerRunResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS)

  try {
    const response = await fetch(`${ENV.WORKER_URL}/run/careerclaw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-worker-secret': ENV.WORKER_SECRET,
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    })

    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      const errMsg = (body as { error?: string }).error ?? `Worker returned ${response.status}`
      const isTimeout = response.status === 504
      throw new WorkerError(errMsg, response.status, isTimeout)
    }

    const data = await response.json()
    return data as WorkerRunResult
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
