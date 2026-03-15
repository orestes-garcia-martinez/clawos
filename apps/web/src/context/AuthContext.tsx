/**
 * AuthContext.tsx — platform-wide auth state.
 *
 * Provides:
 *   user         — Supabase User object (null if not signed in)
 *   session      — raw Supabase Session (contains access_token / JWT)
 *   tier         — 'free' | 'pro' (fetched from users table after auth)
 *   loading      — true until first auth state resolution
 *   signOut()    — signs out and clears state
 *
 * Usage: wrap the app in <AuthProvider>; consume with useAuth().
 */

import { createContext, useContext, useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase.ts'

type Tier = 'free' | 'pro'

interface AuthState {
  user: User | null
  session: Session | null
  tier: Tier
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [tier, setTier] = useState<Tier>('free')
  const [loading, setLoading] = useState(true)

  // Fetch tier from users table after auth resolves
  async function fetchTier(userId: string): Promise<void> {
    const { data } = await supabase.from('users').select('tier').eq('id', userId).single()

    if (data?.tier === 'pro') setTier('pro')
    else setTier('free')
  }

  useEffect(() => {
    // Initialise from current session
    void supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      setUser(s?.user ?? null)
      if (s?.user) void fetchTier(s.user.id)
      setLoading(false)
    })

    // Subscribe to subsequent auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setUser(s?.user ?? null)
      if (s?.user) void fetchTier(s.user.id)
      else setTier('free')
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  // ── Mock-mode tier switching (dev only) ────────────────────────────────
  // Listens for the custom event fired by window.__clawos.setTier().
  // In production builds VITE_MOCK is undefined, so the listener is never added.
  useEffect(() => {
    if (import.meta.env['VITE_MOCK'] !== 'true') return

    function handleTierChange(e: Event): void {
      const tier = (e as CustomEvent<Tier>).detail
      setTier(tier)
    }

    window.addEventListener('clawos:tier-change', handleTierChange)
    return () => window.removeEventListener('clawos:tier-change', handleTierChange)
  }, [])

  async function signOut(): Promise<void> {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, session, tier, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
