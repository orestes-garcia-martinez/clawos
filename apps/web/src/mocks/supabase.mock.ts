/**
 * supabase.mock.ts — In-memory Supabase mock for local development.
 * No network calls. Auth always resolves to a fake user.
 *
 * ── Tier switching ───────────────────────────────────────────────────────────
 * Toggle between free and pro from the browser console:
 *
 *   window.__clawos.setTier('pro')
 *   window.__clawos.setTier('free')
 *
 * The change is instant — AuthContext re-renders the entire app.
 */

// ── Mutable mock tier ─────────────────────────────────────────────────────

import type { createClient } from '@supabase/supabase-js'

export type MockTier = 'free' | 'pro'

let currentTier: MockTier = 'pro'

/** Read the current mock tier (used by MSW handlers too). */
export function getMockTier(): MockTier {
  return currentTier
}

/** Change the mock tier at runtime. Fires a custom event so AuthContext reacts. */
export function setMockTier(tier: MockTier): void {
  currentTier = tier
  TABLES.users[0]!.tier = tier
  window.dispatchEvent(new CustomEvent('clawos:tier-change', { detail: tier }))
  console.info(`[ClawOS mock] Tier switched to "${tier}"`)
}

// Expose on window for quick console access
declare global {
  interface Window {
    __clawos: {
      setTier: (tier: MockTier) => void
      getTier: () => MockTier
    }
  }
}

window.__clawos = {
  setTier: setMockTier,
  getTier: getMockTier,
}

// ── Fake user & session ───────────────────────────────────────────────────

const MOCK_USER = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'dev@clawos.local',
  aud: 'authenticated',
  role: 'authenticated',
  created_at: new Date().toISOString(),
  app_metadata: {},
  user_metadata: { full_name: 'Dev User' },
} as const

const MOCK_SESSION = {
  access_token: 'mock-jwt-token',
  token_type: 'bearer',
  expires_in: 3600,
  refresh_token: 'mock-refresh-token',
  user: MOCK_USER,
}

// ── Fake table data ───────────────────────────────────────────────────────

const TABLES: Record<string, Record<string, unknown>[]> = {
  users: [{ id: MOCK_USER.id, tier: currentTier, created_at: new Date().toISOString() }],
}

// ── Chainable query builder ───────────────────────────────────────────────

function makeQueryChain(data: unknown) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'neq', 'is', 'gt', 'lt', 'order', 'limit', 'in']) {
    chain[m] = () => chain
  }
  chain.single = () => Promise.resolve({ data, error: null })
  chain.maybeSingle = () => Promise.resolve({ data, error: null })
  chain.then = (cb: (v: unknown) => void) => {
    cb({ data: Array.isArray(data) ? data : [data], error: null })
    return Promise.resolve()
  }
  chain.insert = () => makeQueryChain(data)
  chain.update = () => makeQueryChain(data)
  chain.upsert = () => makeQueryChain(data)
  chain.delete = () => makeQueryChain(data)
  return chain
}

// ── Auth listeners ────────────────────────────────────────────────────────

type AuthChangeCallback = (event: string, session: typeof MOCK_SESSION | null) => void
const listeners: AuthChangeCallback[] = []

// ── Exported mock client ──────────────────────────────────────────────────

export const supabase = {
  auth: {
    getSession: () => Promise.resolve({ data: { session: MOCK_SESSION }, error: null }),
    getUser: () => Promise.resolve({ data: { user: MOCK_USER }, error: null }),
    signInWithPassword: () => {
      listeners.forEach((cb) => cb('SIGNED_IN', MOCK_SESSION))
      return Promise.resolve({ data: { session: MOCK_SESSION, user: MOCK_USER }, error: null })
    },
    signInWithOAuth: () => {
      listeners.forEach((cb) => cb('SIGNED_IN', MOCK_SESSION))
      return Promise.resolve({ data: { url: null, provider: 'github' }, error: null })
    },
    signUp: () =>
      Promise.resolve({ data: { session: MOCK_SESSION, user: MOCK_USER }, error: null }),
    signOut: () => {
      listeners.forEach((cb) => cb('SIGNED_OUT', null))
      return Promise.resolve({ error: null })
    },
    onAuthStateChange: (cb: AuthChangeCallback) => {
      listeners.push(cb)
      setTimeout(() => cb('INITIAL_SESSION', MOCK_SESSION), 0)
      return { data: { subscription: { unsubscribe: () => {} } } }
    },
  },
  from: (table: string) => {
    const rows = TABLES[table]
    return makeQueryChain(rows?.[0] ?? null)
  },
} as unknown as ReturnType<typeof createClient>
