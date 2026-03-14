import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Provide required env vars before any module is imported.
    // This avoids the ESM hoisting issue where process.env assignments
    // in test files run after module-level env.ts calls process.exit(1).
    env: {
      TELEGRAM_BOT_TOKEN: 'test-bot-token',
      TELEGRAM_WEBHOOK_SECRET: 'test-webhook-secret',
      AGENT_API_URL: 'http://localhost:3001',
      SERVICE_SECRET: 'test-service-secret',
      LINK_TOKEN_SECRET: 'test-link-secret',
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      VITEST: 'true',
    },
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'lcov'],
    },
  },
})
