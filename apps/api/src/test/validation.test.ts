/**
 * validation.test.ts — Zod input validation tests.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { app, buildSupabaseMock, mockCallLLM, VALID_BODY } from './_setup.js'

const FREE_USER_ID = '00000000-0000-0000-0000-000000000001'

describe('Zod input validation', () => {
  beforeEach(() => {
    buildSupabaseMock({ userId: FREE_USER_ID, tier: 'free' })
    mockCallLLM.mockResolvedValue({ type: 'text', content: 'Hello!', provider: 'anthropic' })
  })

  it('rejects empty message', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...VALID_BODY, message: '' }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe('BAD_REQUEST')
  })

  it('rejects message over 4000 chars', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...VALID_BODY, message: 'x'.repeat(4001) }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects invalid channel', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: JSON.stringify({ ...VALID_BODY, channel: 'discord' }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects non-JSON body', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: 'not json',
    })
    expect(res.status).toBe(400)
  })
})
