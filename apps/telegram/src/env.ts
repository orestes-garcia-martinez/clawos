/**
 * env.ts -- Boot-time environment variable validation.
 *
 * Called once at startup. If any required var is missing the process exits
 * with a clear error -- no silent failures, no undefined reads at runtime.
 *
 * Security note: values are read here and exported as typed constants.
 * No other module should read process.env directly.
 */

function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) {
    // In test environments, return an empty string so the module can be imported.
    // Integration tests use describe.skipIf to skip the suite when vars are missing.
    if (process.env['VITEST']) {
      return ''
    }
    console.error(`[telegram] Fatal: required environment variable "${key}" is not set. Exiting.`)
    process.exit(1)
  }
  return val
}

export const ENV = {
  PORT: Number(process.env['PORT'] ?? 3003),

  // Telegram Bot API
  TELEGRAM_BOT_TOKEN: requireEnv('TELEGRAM_BOT_TOKEN'),
  // Arbitrary secret registered with setWebhook -- X-Telegram-Bot-Api-Secret-Token header
  TELEGRAM_WEBHOOK_SECRET: requireEnv('TELEGRAM_WEBHOOK_SECRET'),

  // Agent API (Vercel)
  AGENT_API_URL: requireEnv('AGENT_API_URL'),

  // Service-to-service auth -- must match SERVICE_SECRET in apps/api/.env
  SERVICE_SECRET: requireEnv('SERVICE_SECRET'),

  // HMAC secret for /link token validation -- must match LINK_TOKEN_SECRET in apps/web/.env
  LINK_TOKEN_SECRET: requireEnv('LINK_TOKEN_SECRET'),

  // Supabase -- service role key bypasses RLS for identity management
  SUPABASE_URL: requireEnv('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
} as const
