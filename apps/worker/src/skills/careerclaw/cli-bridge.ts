/**
 * cli-bridge.ts — temporary CareerClaw CLI bridge.
 *
 * This file preserves the current worker->CLI behavior behind a skill adapter
 * boundary. Once the CareerClaw source bundle is available, the adapter can
 * swap this bridge for a direct import without changing the worker contract.
 */

import { spawn } from 'node:child_process'
import { writeFile, unlink, mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import type { CareerClawWorkerInput } from '@clawos/shared'

const WORKSPACE_DIR =
  process.env.CAREERCLAW_WORKSPACE_DIR ?? '/home/clawos-admin/careerclaw-workspace'
const CLI_TIMEOUT_MS = 30_000
const CAREERCLAW_BIN = process.env.CAREERCLAW_BIN_PATH ?? '/usr/bin/careerclaw-js'

export interface CareerClawCliBridgeResult {
  briefing: Record<string, unknown>
  durationMs: number
}

export class CareerClawCliBridgeError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number | null,
    public readonly durationMs: number,
  ) {
    super(message)
    this.name = 'CareerClawCliBridgeError'
  }
}

interface CareerClawProfile {
  skills: string[]
  target_roles: string[]
  experience_years: number | null
  work_mode: 'remote' | 'hybrid' | 'onsite' | null
  resume_summary: string | null
  location: string | null
  salary_min: number | null
}

function buildCliProfile(input: CareerClawWorkerInput['profile']): CareerClawProfile {
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

export async function runCareerClawCliBridge(
  input: CareerClawWorkerInput,
): Promise<CareerClawCliBridgeResult> {
  const startMs = Date.now()
  let tmpDir: string | null = null

  try {
    tmpDir = await mkdtemp(join(WORKSPACE_DIR, 'run-'))

    const profilePath = join(tmpDir, 'profile.json')
    await writeFile(profilePath, JSON.stringify(buildCliProfile(input.profile)), { mode: 0o600 })

    const args: string[] = [
      '--profile',
      profilePath,
      '--top-k',
      String(input.topK),
      '--json',
      '--dry-run',
    ]

    if (input.resumeText) {
      const resumePath = join(tmpDir, 'resume.txt')
      await writeFile(resumePath, input.resumeText, { mode: 0o600 })
      args.push('--resume-txt', resumePath)
    }

    const result = await spawnWithTimeout(CAREERCLAW_BIN, args, CLI_TIMEOUT_MS)
    const durationMs = Date.now() - startMs

    let briefing: Record<string, unknown>
    try {
      briefing = JSON.parse(result.stdout) as Record<string, unknown>
    } catch {
      throw new CareerClawCliBridgeError(
        `careerclaw-js produced invalid JSON (exit ${result.exitCode})`,
        result.exitCode,
        durationMs,
      )
    }

    return { briefing, durationMs }
  } finally {
    if (tmpDir) {
      await rmTmpDir(tmpDir).catch(() => {
        console.error(`[worker] Failed to clean up temp dir: ${tmpDir}`)
      })
    }
  }
}

interface SpawnResult {
  stdout: string
  stderr: string
  exitCode: number | null
}

function spawnWithTimeout(bin: string, args: string[], timeoutMs: number): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      env: process.env,
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
        new CareerClawCliBridgeError(
          `careerclaw-js timed out after ${timeoutMs}ms`,
          null,
          timeoutMs,
        ),
      )
    }, timeoutMs)

    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        const hint = stderr.slice(0, 500).replace(/\n/g, ' ').trim()
        reject(
          new CareerClawCliBridgeError(
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
        new CareerClawCliBridgeError(
          `Failed to spawn careerclaw-js: ${err.message}`,
          null,
          Date.now(),
        ),
      )
    })
  })
}

async function rmTmpDir(dir: string): Promise<void> {
  const { readdir, rmdir } = await import('node:fs/promises')
  const files = await readdir(dir)
  await Promise.all(files.map((file) => unlink(join(dir, file))))
  await rmdir(dir)
}
