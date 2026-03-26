import type { SkillSlug, VerifiedSkillExecutionContext } from '@clawos/shared'
import { verifySkillAssertion } from '@clawos/security'
import { InMemoryReplayStore } from './replay-store.js'

export class InvalidSkillAssertionError extends Error {
  constructor() {
    super('Invalid skill assertion')
    this.name = 'InvalidSkillAssertionError'
  }
}

function normalizePem(pem: string): string {
  return pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem
}

function loadPublicKeysByKid(): Record<string, string> {
  const raw = process.env['SKILL_ASSERTION_PUBLIC_KEYS_JSON']
  if (!raw) {
    throw new InvalidSkillAssertionError()
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, string>
    const entries = Object.entries(parsed).map(([kid, pem]) => [kid, normalizePem(pem)])
    if (entries.length === 0) throw new Error('No keys')
    return Object.fromEntries(entries)
  } catch {
    throw new InvalidSkillAssertionError()
  }
}

const replayStore = new InMemoryReplayStore()

export async function verifyAndConsumeSkillAssertion(params: {
  token: string
  expectedSkill: SkillSlug
}): Promise<VerifiedSkillExecutionContext> {
  try {
    const claims = verifySkillAssertion(params.token, {
      expectedAudience: 'clawos-worker',
      publicKeysByKid: loadPublicKeysByKid(),
    })

    if (claims.skill !== params.expectedSkill) {
      throw new InvalidSkillAssertionError()
    }

    if (await replayStore.has(claims.jti)) {
      throw new InvalidSkillAssertionError()
    }

    await replayStore.put(claims.jti, claims.exp)

    return {
      source: 'clawos',
      verified: true,
      userId: claims.sub,
      skill: claims.skill,
      tier: claims.tier,
      features: claims.features,
      requestId: claims.jti,
      issuedAt: claims.iat,
      expiresAt: claims.exp,
    }
  } catch (err) {
    if (err instanceof InvalidSkillAssertionError) throw err
    throw new InvalidSkillAssertionError()
  }
}
