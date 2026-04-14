// ─────────────────────────────────────────────────────────────────────────────
// ClawOS — Supabase client factory
//
// Two exports:
//   createBrowserClient() — anon key, for use in apps/web (React, browser)
//   createServerClient()  — service role key, for use in apps/api, apps/telegram,
//                           apps/worker (Node.js, server-side only)
//
// The service role key bypasses RLS. Use it only in server-side code that has
// already authenticated the user via JWT. Never expose it to the browser.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types.js'

export type { Database }
export type TypedSupabaseClient = SupabaseClient<Database>

// ── Browser client — anon key ─────────────────────────────────────────────────
// Safe to use in the browser. RLS enforces data access.
// Call once and reuse; do not create per request.

export function createBrowserClient(): TypedSupabaseClient {
  const url = getEnv('VITE_SUPABASE_URL', 'SUPABASE_URL')
  const key = getEnv('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY')
  return createClient<Database>(url, key)
}

// ── Server client — service role key ─────────────────────────────────────────
// Bypasses RLS. Server-side use only. Never send this key to the browser.
// The caller is responsible for ensuring the user is authenticated before
// using this client to access user-specific data.

export function createServerClient(): TypedSupabaseClient {
  const url = getRequiredEnv('SUPABASE_URL')
  const key = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  return createClient<Database>(url, key, {
    auth: {
      // Disable auto-refresh — server clients are request-scoped.
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Read the first env var that is set. Used to support both Vite-prefixed
 * browser vars and plain server vars from a single helper.
 */
function getEnv(...keys: string[]): string {
  for (const key of keys) {
    const val = process.env[key]
    if (val) return val
  }
  throw new Error(
    `Supabase client: missing required environment variable. ` + `Set one of: ${keys.join(', ')}`,
  )
}

function getRequiredEnv(key: string): string {
  const val = process.env[key]
  if (!val) {
    throw new Error(`Supabase client: missing required environment variable: ${key}`)
  }
  return val
}
