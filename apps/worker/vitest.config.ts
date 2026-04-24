import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: ['**/*.smoke.test.ts', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'lcov'],
    },
  },
})
