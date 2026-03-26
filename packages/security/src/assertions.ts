import {
  createPrivateKey,
  createPublicKey,
  sign as nodeSign,
  verify as nodeVerify,
} from 'node:crypto'
import { z } from 'zod'
import { TierSchema } from './schemas.js'



export const SkillSlugSchema = z.enum(['careerclaw'])

const SkillAssertionHeaderSchema = z.object({
  alg: z.literal('EdDSA'),
  typ: z.literal('CSAT'),
  kid: z.string().min(1),
  ver: z.literal(1),
})

export const SkillAssertionClaimsSchema = z.object({
  iss: z.literal('clawos-api'),
  aud: z.literal('clawos-worker'),
  sub: z.string().uuid(),
  skill: SkillSlugSchema,
  tier: TierSchema,
  features: z.array(z.string().min(1)).max(100),
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
  jti: z.string().uuid(),
  kid: z.string().min(1),
  ver: z.literal(1),
})

export type SkillAssertionClaims = z.infer<typeof SkillAssertionClaimsSchema>

function toBase64Url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url')
}

function fromBase64Url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8')
}

function normalizePem(pem: string): string {
  return pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem
}

export function signSkillAssertion(
  claims: SkillAssertionClaims,
  opts: { privateKeyPem: string; keyId: string },
): string {
  const parsedClaims = SkillAssertionClaimsSchema.parse(claims)
  if (parsedClaims.kid !== opts.keyId) {
    throw new Error('Skill assertion kid mismatch')
  }

  const header = SkillAssertionHeaderSchema.parse({
    alg: 'EdDSA',
    typ: 'CSAT',
    kid: opts.keyId,
    ver: 1,
  })

  const encodedHeader = toBase64Url(JSON.stringify(header))
  const encodedClaims = toBase64Url(JSON.stringify(parsedClaims))
  const signingInput = `${encodedHeader}.${encodedClaims}`

  const privateKey = createPrivateKey(normalizePem(opts.privateKeyPem))
  const signature = nodeSign(null, Buffer.from(signingInput, 'utf8'), privateKey)

  return `${signingInput}.${toBase64Url(signature)}`
}

export function verifySkillAssertion(
  token: string,
  opts: {
    expectedAudience: 'clawos-worker'
    publicKeysByKid: Record<string, string>
  },
): SkillAssertionClaims {
  const [encodedHeader, encodedClaims, encodedSignature] = token.split('.')
  if (!encodedHeader || !encodedClaims || !encodedSignature) {
    throw new Error('Malformed skill assertion')
  }

  const header = SkillAssertionHeaderSchema.parse(JSON.parse(fromBase64Url(encodedHeader)))
  const claims = SkillAssertionClaimsSchema.parse(JSON.parse(fromBase64Url(encodedClaims)))

  if (claims.aud !== opts.expectedAudience) {
    throw new Error('Unexpected assertion audience')
  }

  if (header.kid !== claims.kid) {
    throw new Error('Assertion kid mismatch')
  }

  if (header.ver !== claims.ver) {
    throw new Error('Assertion version mismatch')
  }

  const publicKeyPem = opts.publicKeysByKid[claims.kid]
  if (!publicKeyPem) {
    throw new Error('Unknown assertion key id')
  }

  const publicKey = createPublicKey(normalizePem(publicKeyPem))
  const signingInput = `${encodedHeader}.${encodedClaims}`
  const signature = Buffer.from(encodedSignature, 'base64url')
  const isValid = nodeVerify(null, Buffer.from(signingInput, 'utf8'), publicKey, signature)

  if (!isValid) {
    throw new Error('Invalid assertion signature')
  }

  const now = Math.floor(Date.now() / 1000)
  if (claims.exp < now) {
    throw new Error('Expired skill assertion')
  }

  if (claims.iat > now + 30) {
    throw new Error('Skill assertion issued in the future')
  }

  return claims
}
