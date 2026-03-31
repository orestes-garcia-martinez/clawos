import { randomUUID } from 'node:crypto'
import type { SkillSlug } from '@clawos/shared'
import { signSkillAssertion } from '@clawos/security'
import { ENV } from './env.js'

function normalizePem(pem: string): string {
  return pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem
}

export function issueSkillAssertion(params: {
  userId: string
  skill: SkillSlug
  tier: 'free' | 'pro'
  features: string[]
}): string {
  const now = Math.floor(Date.now() / 1000)

  return signSkillAssertion(
    {
      iss: 'clawos-api',
      aud: 'clawos-worker',
      sub: params.userId,
      skill: params.skill,
      tier: params.tier,
      features: params.features,
      iat: now,
      exp: now + 60,
      jti: randomUUID(),
      kid: ENV.SKILL_ASSERTION_KEY_ID,
      ver: 1,
    },
    {
      privateKeyPem: normalizePem(ENV.SKILL_ASSERTION_PRIVATE_KEY),
      keyId: ENV.SKILL_ASSERTION_KEY_ID,
    },
  )
}
