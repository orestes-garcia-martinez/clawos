/**
 * auth.test.ts — Auth middleware tests.
 */

import { describe, it, expect } from 'vitest'
import { app, mockGetUser, mockFrom, VALID_BODY } from './_setup.js'

describe('Auth middleware', () => {
  it('rejects POST /chat with no Authorization header', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe('UNAUTHORIZED')
  })

  it('rejects POST /chat with invalid JWT', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'invalid' } })
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
      }),
    }))

    const res = await app.request('/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid-jwt',
      },
      body: JSON.stringify(VALID_BODY),
    })
    expect(res.status).toBe(401)
  })
})
