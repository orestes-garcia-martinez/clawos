import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    test: {
      include: ['src/**/*.integration.test.ts'],
      exclude: [],
      // Merge real env from .env.test with VITEST=true to suppress app.listen().
      // All other vars come from .env.test -- no dummy values here.
      env: { ...env, VITEST: 'true' },
      testTimeout: 60_000, // real LLM + Telegram + network calls
      hookTimeout: 30_000, // user creation / deletion in Supabase
      // Run integration tests sequentially -- each test mutates Supabase state.
      pool: 'forks',
      poolOptions: { forks: { singleFork: true } },
    },
  }
})
