import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Parse and inject .env.test into process.env before test collection.
// This runs in the vitest main process; values are forwarded to workers
// via vitest's env-passing mechanism, so describe.skipIf sees them.
function loadEnvTest(): Record<string, string> {
  const env: Record<string, string> = {}
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env.test'), 'utf8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const value = trimmed.slice(eqIdx + 1).trim()
      if (key) env[key] = value
    }
  } catch {
    // .env.test not present — describe.skipIf will skip the suite
  }
  return env
}

export default defineConfig({
  test: {
    include: ['**/*.smoke.test.ts'],
    env: loadEnvTest(),
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'lcov'],
    },
  },
})
