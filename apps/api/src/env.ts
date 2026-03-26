/**
 * env.ts — Boot-time environment variable validation.
 *
 * Called once at startup. If any required var is missing the process exits
 * with a clear error — no silent failures, no undefined reads at runtime.
 *
 * Security note: values are read here and exported as typed constants.
 * No other module should read process.env directly.
 */

function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) {
    console.error(`[api] Fatal: required environment variable "${key}" is not set. Exiting.`)
    process.exit(1)
  }
  return val
}

function optionalEnv(key: string): string | undefined {
  return process.env[key] || undefined
}

export const ENV = {
  PORT: Number(process.env['PORT'] ?? 3001),

  // Supabase
  SUPABASE_URL: requireEnv('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),

  // LLM — platform keys, isolated from skill-level keys
  CLAWOS_ANTHROPIC_KEY: requireEnv('CLAWOS_ANTHROPIC_KEY'),
  CLAWOS_OPENAI_KEY: optionalEnv('CLAWOS_OPENAI_KEY'),

  // Lightsail skill worker
  WORKER_URL: requireEnv('WORKER_URL'),
  WORKER_SECRET: requireEnv('WORKER_SECRET'),

  // Signed skill assertions (API -> worker)
  SKILL_ASSERTION_PRIVATE_KEY: requireEnv('SKILL_ASSERTION_PRIVATE_KEY'),
  SKILL_ASSERTION_KEY_ID: requireEnv('SKILL_ASSERTION_KEY_ID'),

  // CORS
  ALLOWED_ORIGIN: process.env['ALLOWED_ORIGIN'] ?? 'http://localhost:5173',

  // Service-to-service auth — trusted internal adapters (Telegram, WhatsApp)
  SERVICE_SECRET: optionalEnv('SERVICE_SECRET'),

  // Telegram account-linking token secret (server-side only, never sent to browser)
  LINK_TOKEN_SECRET: optionalEnv('LINK_TOKEN_SECRET'),

  // ── Polar.sh billing ───────────────────────────────────────────────────────
  POLAR_ACCESS_TOKEN: optionalEnv('POLAR_ACCESS_TOKEN'),
  POLAR_WEBHOOK_SECRET: optionalEnv('POLAR_WEBHOOK_SECRET'),
  POLAR_ENV: (process.env['POLAR_ENV'] === 'production' ? 'production' : 'sandbox') as
    | 'sandbox'
    | 'production',
  POLAR_PRODUCT_CAREERCLAW_PRO_ID: optionalEnv('POLAR_PRODUCT_CAREERCLAW_PRO_ID'),
  POLAR_BENEFIT_CAREERCLAW_PRO_ACCESS_ID: optionalEnv('POLAR_BENEFIT_CAREERCLAW_PRO_ACCESS_ID'),

  INTERNAL_API_KEY: optionalEnv('INTERNAL_API_KEY'),
  WEB_APP_URL: process.env['WEB_APP_URL'] ?? 'https://app.clawoshq.com',
} as const
