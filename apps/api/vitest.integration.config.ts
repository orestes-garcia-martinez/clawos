import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    test: {
      include: ['src/**/*.integration.test.ts'],
      exclude: [],
      env,
      testTimeout: 30_000, // real LLM + network calls
      hookTimeout: 15_000,
    },
  }
})
