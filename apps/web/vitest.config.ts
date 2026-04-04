import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: [
      {
        // src/generated/skill-versions.json is created by the prebuild script
        // and is gitignored. Redirect to a committed stub so tests can run on
        // a fresh checkout without running the prebuild first.
        find: /.*\/generated\/skill-versions\.json$/,
        replacement: path.resolve(__dirname, 'src/test/fixtures/skill-versions.json'),
      },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'lcov'],
    },
  },
})
