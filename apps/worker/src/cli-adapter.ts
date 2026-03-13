/**
 * cli-adapter.ts — CareerClaw CLI invocation adapter.
 *
 * This module owns the spawn contract for careerclaw-js.
 * All CLI flag names, temp file lifecycle, and output parsing live here.
 * If the CLI interface changes, only this file needs updating.
 *
 * Security rules enforced here:
 *   - Profile JSON and resume text are written to temp files, never passed
 *     as CLI arguments. Arg lists are visible in `ps aux` — temp files are not.
 *   - Temp files are written inside WORKSPACE_DIR (restricted to clawos-admin).
 *   - Temp files are always deleted in a finally block regardless of outcome.
 *   - Raw resume text is never included in logs or error messages.
 *   - The CLI binary is resolved from the global npm bin — careerclaw-js is
 *     installed globally on Lightsail via `npm install -g careerclaw-js`.
 *
 * Persistence note:
 *   The worker always passes --dry-run to the CLI. Tracking (saved jobs,
 *   run logs) is the responsibility of the Agent API writing to Supabase —
 *   not the CLI writing to local filesystem. This keeps the skill layer
 *   stateless and decoupled from platform persistence.
 *
 * Profile field mapping (camelCase ClawOS → snake_case careerclaw-js):
 *   skills          → skills          (primary keyword corpus)
 *   targetRoles     → target_roles    (secondary keyword corpus)
 *   experienceYears → experience_years
 *   resumeSummary   → resume_summary  (tertiary keyword corpus)
 *   workMode        → work_mode
 *   salaryMin       → salary_min
 *   locationPref    → location
 */

import { spawn } from 'node:child_process'
import { writeFile, unlink, mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'

// ── Config ────────────────────────────────────────────────────────────────────

/** Directory where temp files are written. Must be writable by clawos-admin. */
const WORKSPACE_DIR =
  process.env.CAREERCLAW_WORKSPACE_DIR ?? '/home/clawos-admin/careerclaw-workspace'

/** CLI timeout in milliseconds. Strategy target: 5s p95. Hard limit: 30s. */
const CLI_TIMEOUT_MS = 30_000

/**
 * careerclaw-js is installed globally on Lightsail.
 * We resolve it from the system PATH rather than node_modules/.bin
 * because the worker is not co-located with careerclaw-js in the monorepo.
 */
const CAREERCLAW_BIN = process.env.CAREERCLAW_BIN_PATH ?? '/usr/bin/careerclaw-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CareerClawCliInput {
  profile: {
    name?: string
    /** Primary keyword corpus — empty array = near-zero match scores */
    skills?: string[]
    /** Secondary keyword corpus */
    targetRoles?: string[]
    experienceYears?: number | null
    resumeSummary?: string | null
    workMode?: 'remote' | 'hybrid' | 'onsite'
    salaryMin?: number
    salaryMax?: number
    locationPref?: string
  }
  resumeText?: string
  topK: number
}

export interface CareerClawCliResult {
  /** Raw BriefingResult JSON from careerclaw-js --json */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  briefing: Record<string, any>
  durationMs: number
}

export class CareerClawCliError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number | null,
    public readonly durationMs: number,
  ) {
    super(message)
    this.name = 'CareerClawCliError'
  }
}

// ── Profile mapping ───────────────────────────────────────────────────────────
// The worker receives a CareerClaw profile in ClawOS format (camelCase).
// The CLI expects profile.json in careerclaw-js format (snake_case).
// This function translates between the two — isolating the impedance mismatch.
//
// careerclaw-js UserProfile interface (models.ts):
//   skills: string[]
//   target_roles: string[]
//   experience_years: number | null
//   work_mode: WorkMode | null   ("remote"|"hybrid"|"onsite"|"any")
//   resume_summary: string | null
//   location: string | null
//   salary_min: number | null
//
// All fields are optional in the interface but skills + target_roles are the
// primary keyword corpus. Without them the engine returns zero matches.

interface CareerClawProfile {
  skills: string[]
  target_roles: string[]
  experience_years: number | null
  work_mode: 'remote' | 'hybrid' | 'onsite' | null
  resume_summary: string | null
  location: string | null
  salary_min: number | null
}

function buildCliProfile(input: CareerClawCliInput['profile']): CareerClawProfile {
  return {
    skills: input.skills ?? [],
    target_roles: input.targetRoles ?? [],
    experience_years: input.experienceYears ?? null,
    work_mode: input.workMode ?? null,
    resume_summary: input.resumeSummary ?? null,
    location: input.locationPref ?? null,
    salary_min: input.salaryMin ?? null,
  }
}

// ── Main invocation ───────────────────────────────────────────────────────────

/**
 * Run the careerclaw-js CLI and return the parsed BriefingResult.
 *
 * Always passes --dry-run: persistence is handled by the Agent API
 * writing to Supabase, not by the CLI writing to local filesystem.
 *
 * Temp files are cleaned up unconditionally in the finally block.
 * Throws CareerClawCliError on timeout, non-zero exit, or JSON parse failure.
 */
export async function runCareerClawCli(input: CareerClawCliInput): Promise<CareerClawCliResult> {
  const startMs = Date.now()
  let tmpDir: string | null = null

  try {
    // ── Write temp files ────────────────────────────────────────────────────
    // Files go in WORKSPACE_DIR with a random suffix.
    // Temp files are never in /tmp — they stay under the clawos-admin workspace.
    tmpDir = await mkdtemp(join(WORKSPACE_DIR, 'run-'))

    const profilePath = join(tmpDir, 'profile.json')
    const cliProfile = buildCliProfile(input.profile)
    await writeFile(profilePath, JSON.stringify(cliProfile), { mode: 0o600 })

    const args: string[] = [
      '--profile',
      profilePath,
      '--top-k',
      String(input.topK),
      '--json',
      '--dry-run', // persistence is Supabase's job, not the CLI's
    ]

    // Resume text: write to file and pass path — never inline in args
    if (input.resumeText) {
      const resumePath = join(tmpDir, 'resume.txt')
      await writeFile(resumePath, input.resumeText, { mode: 0o600 })
      args.push('--resume-txt', resumePath)
    }

    // ── Spawn CLI ───────────────────────────────────────────────────────────
    const result = await spawnWithTimeout(CAREERCLAW_BIN, args, CLI_TIMEOUT_MS)
    const durationMs = Date.now() - startMs

    // ── Parse output ────────────────────────────────────────────────────────
    let briefing: Record<string, unknown>
    try {
      briefing = JSON.parse(result.stdout) as Record<string, unknown>
    } catch {
      throw new CareerClawCliError(
        `careerclaw-js produced invalid JSON (exit ${result.exitCode})`,
        result.exitCode,
        durationMs,
      )
    }

    return { briefing, durationMs }
  } finally {
    // Always clean up temp files — never leave profile or resume on disk
    if (tmpDir) {
      await rmTmpDir(tmpDir).catch(() => {
        // Log cleanup failure but do not re-throw — the run result is already determined
        console.error(`[worker] Failed to clean up temp dir: ${tmpDir}`)
      })
    }
  }
}

// ── spawn helper ──────────────────────────────────────────────────────────────

interface SpawnResult {
  stdout: string
  stderr: string
  exitCode: number | null
}

function spawnWithTimeout(bin: string, args: string[], timeoutMs: number): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      // Inherit the worker's env (LLM keys, CAREERCLAW_DIR, etc.)
      env: process.env,
      // Do not inherit parent stdio — capture stdout/stderr explicitly
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(
        new CareerClawCliError(`careerclaw-js timed out after ${timeoutMs}ms`, null, timeoutMs),
      )
    }, timeoutMs)

    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        // stderr may contain useful diagnostics but never raw resume text.
        // Truncate to 500 chars to keep audit logs lean.
        const hint = stderr.slice(0, 500).replace(/\n/g, ' ').trim()
        reject(
          new CareerClawCliError(
            `careerclaw-js exited with code ${code}${hint ? `: ${hint}` : ''}`,
            code,
            Date.now(),
          ),
        )
        return
      }
      resolve({ stdout, stderr, exitCode: code })
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      reject(
        new CareerClawCliError(`Failed to spawn careerclaw-js: ${err.message}`, null, Date.now()),
      )
    })
  })
}

// ── Temp dir cleanup ──────────────────────────────────────────────────────────

async function rmTmpDir(dir: string): Promise<void> {
  // Enumerate and delete files individually — avoids importing fs/promises rm
  // with recursive flag (requires Node 14.14+, which is fine, but being explicit
  // makes the intent clear: only touch files we created).
  const { readdir } = await import('node:fs/promises')
  const files = await readdir(dir)
  await Promise.all(files.map((f) => unlink(join(dir, f))))
  await (await import('node:fs/promises')).rmdir(dir)
}
