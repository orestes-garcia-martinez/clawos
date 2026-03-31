/**
 * health.test.ts — GET /health endpoint tests.
 */

import { describe, it, expect } from 'vitest'
import { app } from './_setup.js'

describe('GET /health', () => {
  it('returns 200 with no auth', async () => {
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string; service: string }
    expect(body.status).toBe('ok')
    expect(body.service).toBe('clawos-api')
  })
})
