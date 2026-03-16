/**
 * SkillsContext.tsx — platform-wide installed-skills state.
 *
 * Provides:
 *   installedSlugs    — ordered list of skill keys the user has installed
 *   loading           — true until the first DB fetch resolves
 *   installSkill()    — inserts a row into user_skills and updates local state
 *   removeSkill()     — deletes the row and updates local state
 *   updateLastUsed()  — writes last_used_at = now() for a slug (fire-and-forget)
 *
 * Source of truth is the user_skills Supabase table.
 * The static skill registry (skills/index.ts) defines what is available
 * to install; this context records per-user installation state.
 *
 * Usage: wrap the app in <SkillsProvider> inside <AuthProvider>;
 * consume with useSkills().
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { JSX } from 'react'
import { supabase } from '../lib/supabase.ts'
import { useAuth } from './AuthContext.tsx'
import type { SkillKey } from '../skills'

interface SkillsState {
  installedSlugs: SkillKey[]
  loading: boolean
  installSkill: (slug: SkillKey) => Promise<void>
  removeSkill: (slug: SkillKey) => Promise<void>
  updateLastUsed: (slug: SkillKey) => Promise<void>
}

const SkillsContext = createContext<SkillsState | undefined>(undefined)

export function SkillsProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const { user } = useAuth()
  const [installedSlugs, setInstalledSlugs] = useState<SkillKey[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  // Listen for mock skills-change event so resetSkills() works at runtime
  useEffect(() => {
    if (import.meta.env['VITE_MOCK'] !== 'true') return

    function handleSkillsChange() {
      setRefreshKey((k) => k + 1)
    }

    window.addEventListener('clawos:skills-change', handleSkillsChange)
    return () => window.removeEventListener('clawos:skills-change', handleSkillsChange)
  }, [])

  useEffect(() => {
    if (!user) {
      setInstalledSlugs([])
      setLoading(false)
      return
    }

    setLoading(true)

    void supabase
      .from('user_skills')
      .select('skill_slug')
      .eq('user_id', user.id)
      .eq('status', 'installed')
      .order('is_default', { ascending: false })
      .order('installed_at', { ascending: true })
      .then(({ data }) => {
        setInstalledSlugs((data ?? []).map((r) => r.skill_slug as SkillKey))
        setLoading(false)
      })
  }, [user?.id, refreshKey])

  const installSkill = useCallback(
    async (slug: SkillKey): Promise<void> => {
      if (!user) return

      const isFirst = installedSlugs.length === 0

      const { error } = await supabase.from('user_skills').insert({
        user_id: user.id,
        skill_slug: slug,
        status: 'installed',
        is_default: isFirst,
      })

      if (!error) {
        setInstalledSlugs((prev) => (prev.includes(slug) ? prev : [...prev, slug]))
      }
    },
    [user, installedSlugs],
  )

  const removeSkill = useCallback(
    async (slug: SkillKey): Promise<void> => {
      if (!user) return

      const { error } = await supabase
        .from('user_skills')
        .delete()
        .eq('user_id', user.id)
        .eq('skill_slug', slug)

      if (!error) {
        setInstalledSlugs((prev) => prev.filter((s) => s !== slug))
      }
    },
    [user],
  )

  const updateLastUsed = useCallback(
    async (slug: SkillKey): Promise<void> => {
      if (!user) return

      // Fire-and-forget — no local state update needed.
      await supabase
        .from('user_skills')
        .update({ last_used_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('skill_slug', slug)
    },
    [user],
  )

  return (
    <SkillsContext.Provider
      value={{ installedSlugs, loading, installSkill, removeSkill, updateLastUsed }}
    >
      {children}
    </SkillsContext.Provider>
  )
}

export function useSkills(): SkillsState {
  const ctx = useContext(SkillsContext)
  if (!ctx) throw new Error('useSkills must be used inside <SkillsProvider>')
  return ctx
}
