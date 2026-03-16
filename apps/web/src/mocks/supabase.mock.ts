/**
 * supabase.mock.ts — In-memory Supabase mock for local development.
 * No network calls. Auth resolves based on the active persona.
 *
 * ── Personas ─────────────────────────────────────────────────────────────────
 * Set VITE_MOCK_PERSONA in .env (restart required):
 *
 *   'returning' — (default) auto-signed-in, CareerClaw installed, pro tier
 *   'new'       — unauthenticated; must sign in with test credentials:
 *                   email:    test@clawos.local
 *                   password: clawos123
 *                  Starts with zero skills, free tier → full onboarding flow
 *
 * ── Tier switching ───────────────────────────────────────────────────────────
 * Toggle between free and pro from the browser console:
 *
 *   window.__clawos.setTier('pro')
 *   window.__clawos.setTier('free')
 *
 * ── Skills switching ─────────────────────────────────────────────────────────
 * Reset installed skills to simulate first-time user:
 *
 *   window.__clawos.resetSkills()
 *
 * The change is instant — AuthContext / SkillsContext re-render the app.
 */

// ── Mutable mock tier ─────────────────────────────────────────────────────

import type { createClient } from '@supabase/supabase-js'

export type MockTier = 'free' | 'pro'
export type MockPersona = 'new' | 'returning'

const persona: MockPersona =
  (import.meta.env['VITE_MOCK_PERSONA'] as MockPersona | undefined) === 'new' ? 'new' : 'returning'

let currentTier: MockTier = persona === 'new' ? 'free' : 'pro'

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

/** Reset installed skills so /home shows the zero-skills welcome. */
export function resetMockSkills(): void {
  TABLES.user_skills = []
  window.dispatchEvent(new CustomEvent('clawos:skills-change'))
  console.info('[ClawOS mock] Skills reset — navigate to /home to pick your first skill')
}

// Expose on window for quick console access
declare global {
  interface Window {
    __clawos: {
      setTier: (tier: MockTier) => void
      getTier: () => MockTier
      resetSkills: () => void
      persona: MockPersona
    }
  }
}

window.__clawos = {
  setTier: setMockTier,
  getTier: getMockTier,
  resetSkills: resetMockSkills,
  persona,
}

// ── Test credentials (new persona) ────────────────────────────────────────

const MOCK_CREDENTIALS = {
  email: 'test@clawos.local',
  password: 'clawos123',
} as const

// ── Fake user & session ───────────────────────────────────────────────────

const MOCK_USER = {
  id: '00000000-0000-0000-0000-000000000001',
  email: persona === 'new' ? MOCK_CREDENTIALS.email : 'dev@clawos.local',
  aud: 'authenticated',
  role: 'authenticated',
  created_at: new Date().toISOString(),
  app_metadata: {},
  user_metadata: {
    full_name: persona === 'new' ? 'New User' : 'Dev User',
  },
} as const

const MOCK_SESSION = {
  access_token: 'mock-jwt-token',
  token_type: 'bearer',
  expires_in: 3600,
  refresh_token: 'mock-refresh-token',
  user: MOCK_USER,
}

// ── Auth state ────────────────────────────────────────────────────────────
// For the 'new' persona, auth starts as null (unauthenticated).
// For the 'returning' persona, auth starts with a valid session.

let currentSession: typeof MOCK_SESSION | null = persona === 'new' ? null : MOCK_SESSION

// ── Fake table data ───────────────────────────────────────────────────────

interface UserSkillRow {
  id: string
  user_id: string
  skill_slug: string
  status: string
  installed_at: string
  last_used_at: string | null
  is_default: boolean
  created_at: string
  updated_at: string
}

const TABLES: Record<string, Record<string, unknown>[]> = {
  users: [{ id: MOCK_USER.id, tier: currentTier, created_at: new Date().toISOString() }],
  user_skills:
    persona === 'new'
      ? []
      : [
          {
            id: crypto.randomUUID(),
            user_id: MOCK_USER.id,
            skill_slug: 'careerclaw',
            status: 'installed',
            installed_at: new Date().toISOString(),
            last_used_at: null,
            is_default: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } satisfies UserSkillRow,
        ],
}

// ── Chainable query builder ───────────────────────────────────────────────
//
// Mimics the Supabase PostgREST chain for queries used by AuthContext,
// SkillsContext (select, insert, delete, update).

type Operation = 'select' | 'insert' | 'delete' | 'update'

interface QueryState {
  table: string
  operation: Operation
  filters: Array<{ column: string; op: string; value: unknown }>
  orders: Array<{ column: string; ascending: boolean }>
  isSingle: boolean
  isMaybeSingle: boolean
  insertData: Record<string, unknown> | null
  updateData: Record<string, unknown> | null
}

function applyFilters(
  rows: Record<string, unknown>[],
  state: QueryState,
): Record<string, unknown>[] {
  let result = rows
  for (const f of state.filters) {
    result = result.filter((row) => {
      switch (f.op) {
        case 'eq':
          return row[f.column] === f.value
        case 'neq':
          return row[f.column] !== f.value
        case 'is':
          return row[f.column] === f.value
        case 'gt':
          return (row[f.column] as number) > (f.value as number)
        case 'lt':
          return (row[f.column] as number) < (f.value as number)
        case 'in':
          return (f.value as unknown[]).includes(row[f.column])
        default:
          return true
      }
    })
  }
  return result
}

function applyOrders(
  rows: Record<string, unknown>[],
  state: QueryState,
): Record<string, unknown>[] {
  if (state.orders.length === 0) return rows
  return [...rows].sort((a, b) => {
    for (const o of state.orders) {
      const aVal = a[o.column]
      const bVal = b[o.column]
      if (aVal === bVal) continue
      // booleans: true before false when descending (is_default desc)
      if (typeof aVal === 'boolean') {
        const cmp = aVal === bVal ? 0 : aVal ? -1 : 1
        return o.ascending ? cmp : -cmp
      }
      // strings / dates
      const cmp = String(aVal ?? '').localeCompare(String(bVal ?? ''))
      return o.ascending ? cmp : -cmp
    }
    return 0
  })
}

function makeQueryChain(table: string): Record<string, unknown> {
  const state: QueryState = {
    table,
    operation: 'select',
    filters: [],
    orders: [],
    isSingle: false,
    isMaybeSingle: false,
    insertData: null,
    updateData: null,
  }

  const chain: Record<string, unknown> = {}

  // Filter methods
  chain.select = () => chain
  chain.eq = (col: string, val: unknown) => {
    state.filters.push({ column: col, op: 'eq', value: val })
    return chain
  }
  chain.neq = (col: string, val: unknown) => {
    state.filters.push({ column: col, op: 'neq', value: val })
    return chain
  }
  chain.is = (col: string, val: unknown) => {
    state.filters.push({ column: col, op: 'is', value: val })
    return chain
  }
  chain.gt = (col: string, val: unknown) => {
    state.filters.push({ column: col, op: 'gt', value: val })
    return chain
  }
  chain.lt = (col: string, val: unknown) => {
    state.filters.push({ column: col, op: 'lt', value: val })
    return chain
  }
  chain.in = (col: string, val: unknown) => {
    state.filters.push({ column: col, op: 'in', value: val })
    return chain
  }
  chain.order = (col: string, opts?: { ascending?: boolean }) => {
    state.orders.push({ column: col, ascending: opts?.ascending ?? true })
    return chain
  }
  chain.limit = () => chain

  // Mutation methods — set operation flag, return chain for further filtering
  chain.delete = () => {
    state.operation = 'delete'
    return chain
  }
  chain.update = (data: Record<string, unknown>) => {
    state.operation = 'update'
    state.updateData = data
    return chain
  }
  chain.upsert = () => chain

  // Terminal methods
  chain.single = () => {
    state.isSingle = true
    return resolveSelect()
  }
  chain.maybeSingle = () => {
    state.isMaybeSingle = true
    return resolveSelect()
  }

  // Insert — handled separately (see makeInsertResult)
  chain.insert = (data: Record<string, unknown>) => {
    state.insertData = data
    return makeInsertResult(state)
  }

  // Thenable — allows awaiting the chain directly
  chain.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
    try {
      const rows = (TABLES[table] ?? []) as Record<string, unknown>[]

      if (state.operation === 'delete') {
        const toRemove = applyFilters(rows, state)
        TABLES[table] = rows.filter((r) => !toRemove.includes(r))
        resolve({ data: null, error: null })
        return
      }

      if (state.operation === 'update' && state.updateData) {
        const toUpdate = applyFilters(rows, state)
        toUpdate.forEach((r) => Object.assign(r, state.updateData))
        resolve({ data: toUpdate, error: null })
        return
      }

      // Default: select
      const filtered = applyFilters(rows, state)
      const ordered = applyOrders(filtered, state)
      resolve({ data: ordered, error: null })
    } catch (e) {
      reject?.(e)
    }
  }

  function resolveSelect() {
    const rows = (TABLES[table] ?? []) as Record<string, unknown>[]
    const filtered = applyFilters(rows, state)
    const ordered = applyOrders(filtered, state)
    if (state.isSingle || state.isMaybeSingle) {
      return Promise.resolve({ data: ordered[0] ?? null, error: null })
    }
    return Promise.resolve({ data: ordered, error: null })
  }

  return chain
}

function makeInsertResult(state: QueryState): Record<string, unknown> {
  const data = state.insertData
  if (data && state.table === 'user_skills') {
    const existing = (TABLES.user_skills as unknown as UserSkillRow[]).find(
      (r) => r.user_id === data.user_id && r.skill_slug === data.skill_slug,
    )
    if (!existing) {
      const now = new Date().toISOString()
      const row: UserSkillRow = {
        id: crypto.randomUUID(),
        user_id: data.user_id as string,
        skill_slug: data.skill_slug as string,
        status: (data.status as string) ?? 'installed',
        installed_at: now,
        last_used_at: null,
        is_default: (data.is_default as boolean) ?? false,
        created_at: now,
        updated_at: now,
      }
      TABLES.user_skills.push({ ...row })
    }
  }
  return {
    select: () => Promise.resolve({ data, error: null }),
    then: (cb: (v: unknown) => void) => {
      cb({ data, error: null })
      return Promise.resolve()
    },
  } as Record<string, unknown>
}

// ── Auth listeners ────────────────────────────────────────────────────────

type AuthChangeCallback = (event: string, session: typeof MOCK_SESSION | null) => void
const listeners: AuthChangeCallback[] = []

/** Notify all auth listeners — used internally by sign-in / sign-out. */
function notifyListeners(event: string, session: typeof MOCK_SESSION | null): void {
  listeners.forEach((cb) => cb(event, session))
}

// ── Auth helpers ──────────────────────────────────────────────────────────

function validateCredentials(email: string, password: string): { error: Error | null } {
  if (email === MOCK_CREDENTIALS.email && password === MOCK_CREDENTIALS.password) {
    return { error: null }
  }
  return { error: new Error('Invalid login credentials') }
}

// ── Exported mock client ──────────────────────────────────────────────────

export const supabase = {
  auth: {
    getSession: () =>
      Promise.resolve({
        data: { session: currentSession },
        error: null,
      }),

    getUser: () =>
      Promise.resolve({
        data: { user: currentSession ? MOCK_USER : null },
        error: null,
      }),

    signInWithPassword: ({ email, password }: { email: string; password: string }) => {
      const { error } = validateCredentials(email, password)
      if (error) {
        return Promise.resolve({
          data: { session: null, user: null },
          error,
        })
      }
      currentSession = MOCK_SESSION
      notifyListeners('SIGNED_IN', MOCK_SESSION)
      return Promise.resolve({
        data: { session: MOCK_SESSION, user: MOCK_USER },
        error: null,
      })
    },

    signInWithOtp: ({ email }: { email: string; options?: Record<string, unknown> }) => {
      // For the new persona, only accept the test email
      if (persona === 'new' && email !== MOCK_CREDENTIALS.email) {
        return Promise.resolve({
          data: { user: null, session: null },
          error: new Error(`Unknown email: ${email}`),
        })
      }
      // Simulate magic link — immediately sign in (no real email sent)
      currentSession = MOCK_SESSION
      notifyListeners('SIGNED_IN', MOCK_SESSION)
      return Promise.resolve({ data: {}, error: null })
    },

    signInWithOAuth: () => {
      currentSession = MOCK_SESSION
      notifyListeners('SIGNED_IN', MOCK_SESSION)
      return Promise.resolve({ data: { url: null, provider: 'github' }, error: null })
    },

    signUp: ({ email, password }: { email: string; password: string }) => {
      // Simulate duplicate email error if signing up with existing credentials
      if (email === MOCK_CREDENTIALS.email) {
        return Promise.resolve({
          data: { session: null, user: MOCK_USER },
          error: null,
          // Supabase returns the user but no session until email is confirmed
        })
      }
      // Accept any new email/password — "create" the account
      console.info(
        `[ClawOS mock] Sign-up for "${email}" accepted. Use test@clawos.local / clawos123 to sign in.`,
      )
      return Promise.resolve({
        data: { session: null, user: { ...MOCK_USER, email } },
        error: password.length < 8 ? new Error('Password must be at least 8 characters') : null,
      })
    },

    signOut: () => {
      currentSession = null
      notifyListeners('SIGNED_OUT', null)
      return Promise.resolve({ error: null })
    },

    onAuthStateChange: (cb: AuthChangeCallback) => {
      listeners.push(cb)
      // Fire initial state on next tick — null session for 'new', valid for 'returning'
      setTimeout(() => cb('INITIAL_SESSION', currentSession), 0)
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              const idx = listeners.indexOf(cb)
              if (idx !== -1) listeners.splice(idx, 1)
            },
          },
        },
      }
    },
  },
  from: (table: string) => makeQueryChain(table),
} as unknown as ReturnType<typeof createClient>
