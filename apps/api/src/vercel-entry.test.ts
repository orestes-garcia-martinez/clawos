import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Vercel entrypoint', () => {
  it('imports the compiled API app from dist', () => {
    const entrypointPath = join(process.cwd(), 'api', 'index.js')
    const source = readFileSync(entrypointPath, 'utf8')

    expect(source).toContain('../dist/index.js')
    expect(source).not.toContain('../src/index')
  })
})
