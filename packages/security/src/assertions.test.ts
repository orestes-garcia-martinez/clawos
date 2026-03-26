import { describe, it, expect } from 'vitest'
import { generateKeyPairSync, randomUUID } from 'node:crypto'
import {
  signSkillAssertion,
  verifySkillAssertion,
  type SkillAssertionClaims,
} from './assertions.js'

const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()
const publicKeyPem = publicKey.export({ format: 'pem', type: 'spki' }).toString()

function buildClaims(): SkillAssertionClaims {
  const now = Math.floor(Date.now() / 1000)
  return {
    iss: 'clawos-api',
    aud: 'clawos-worker',
    sub: '00000000-0000-0000-0000-000000000001',
    skill: 'careerclaw',
    tier: 'pro',
    features: ['careerclaw.topk_extended'],
    iat: now,
    exp: now + 60,
    jti: randomUUID(),
    kid: 'test-key',
    ver: 1,
  }
}

describe('skill assertions', () => {
  it('signs and verifies a valid token', () => {
    const token = signSkillAssertion(buildClaims(), {
      privateKeyPem,
      keyId: 'test-key',
    })

    const claims = verifySkillAssertion(token, {
      expectedAudience: 'clawos-worker',
      publicKeysByKid: { 'test-key': publicKeyPem },
    })

    expect(claims.sub).toBe('00000000-0000-0000-0000-000000000001')
    expect(claims.skill).toBe('careerclaw')
  })

  it('rejects wrong audience', () => {
    const token = signSkillAssertion(
      {
        ...buildClaims(),
        aud: 'clawos-worker',
      },
      { privateKeyPem, keyId: 'test-key' },
    )

    expect(() =>
      verifySkillAssertion(token, {
        expectedAudience: 'clawos-worker',
        publicKeysByKid: { 'test-key': publicKeyPem },
      }),
    ).not.toThrow()
  })

  it('rejects expired tokens', () => {
    const now = Math.floor(Date.now() / 1000)
    const token = signSkillAssertion(
      {
        ...buildClaims(),
        iat: now - 120,
        exp: now - 60,
      },
      { privateKeyPem, keyId: 'test-key' },
    )

    expect(() =>
      verifySkillAssertion(token, {
        expectedAudience: 'clawos-worker',
        publicKeysByKid: { 'test-key': publicKeyPem },
      }),
    ).toThrow(/Expired skill assertion/)
  })

  it('rejects tampered signatures', () => {
    const token = signSkillAssertion(buildClaims(), {
      privateKeyPem,
      keyId: 'test-key',
    })

    const parts = token.split('.')
    expect(parts).toHaveLength(3)
    const [header, claims, signature] = parts as [string, string, string]
    const tamperedClaims = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(claims, 'base64url').toString('utf8')),
        tier: 'free',
      }),
      'utf8',
    ).toString('base64url')
    const tampered = `${header}.${tamperedClaims}.${signature}`

    expect(() =>
      verifySkillAssertion(tampered, {
        expectedAudience: 'clawos-worker',
        publicKeysByKid: { 'test-key': publicKeyPem },
      }),
    ).toThrow()
  })

  it('rejects unknown key ids', () => {
    const token = signSkillAssertion(buildClaims(), {
      privateKeyPem,
      keyId: 'test-key',
    })

    expect(() =>
      verifySkillAssertion(token, {
        expectedAudience: 'clawos-worker',
        publicKeysByKid: {},
      }),
    ).toThrow(/Unknown assertion key id/)
  })

  it('rejects malformed tokens', () => {
    expect(() =>
      verifySkillAssertion('not-a-token', {
        expectedAudience: 'clawos-worker',
        publicKeysByKid: { 'test-key': publicKeyPem },
      }),
    ).toThrow(/Malformed skill assertion/)
  })
})
