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

  // CORS
  ALLOWED_ORIGIN: process.env['ALLOWED_ORIGIN'] ?? 'http://localhost:5173',
} as const
