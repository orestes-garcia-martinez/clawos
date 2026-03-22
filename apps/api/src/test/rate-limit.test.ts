/**
 * rate-limit.test.ts — Rate limiting tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { app, buildSupabaseMock, mockCallLLM, resetRateLimit, VALID_BODY } from './_setup.js'

const RL_FREE_USER = '00000000-0000-0000-0000-000000000010'

beforeEach(() => {
  resetRateLimit()
})

describe('Rate limiting', () => {
  beforeEach(() => {
    buildSupabaseMock({ userId: RL_FREE_USER, tier: 'free' })
    mockCallLLM.mockResolvedValue({ type: 'text', content: 'ok', provider: 'anthropic' })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns 429 after 10 requests for a free-tier user', async () => {
    for (let i = 0; i < 10; i++) {
      await app.request('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
        body: JSON.stringify({ ...VALID_BODY, userId: RL_FREE_USER }),
      })
    }

    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...VALID_BODY, userId: RL_FREE_USER }),
    })
    expect(res.status).toBe(429)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe('RATE_LIMITED')
    expect(res.headers.get('Retry-After')).toBeDefined()
  })
})
