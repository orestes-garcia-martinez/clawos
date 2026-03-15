/**
 * AppShell.tsx — ClawOS platform shell.
 *
 * Owns:
 *   - Brand/status area
 *   - Skill switcher (installed skills only, via SkillsContext)
 *   - Active skill nav section
 *   - Platform nav section
 *   - Pro upgrade card
 *   - User footer
 *   - Mobile sidebar drawer + backdrop
 *   - Topbar with hamburger (mobile)
 *
 * Guard: if a user lands on a skill route for a skill they have not installed,
 * they are redirected to /home. Covers bookmarked routes and direct URL entry.
 *
 * Hook discipline: all hook calls are unconditional and precede every early
 * return. Derived values (activeSkill, skill) are computed after guards.
 */

import type { JSX } from 'react'
import { useState, useEffect, useCallback } from 'react'
import { Navigate, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { ClawLogo, IconMenu, IconX } from './icons.tsx'
import { SkillSwitcher } from './SkillSwitcher.tsx'
import { PlatformNav } from './PlatformNav.tsx'
import { SkillNav } from './SkillNav.tsx'
import { UserFooter } from './UserFooter.tsx'

import { useAuth } from '../context/AuthContext'
import { useSkills } from '../context/SkillsContext.tsx'
import type { SkillKey } from '../skills'
import { SKILL_MAP } from '../skills'

export function AppShell(): JSX.Element {
  const { tier } = useAuth()
  const { installedSlugs, loading: skillsLoading } = useSkills()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const [sidebarOpen, setSidebarOpen] = useState(false)

  // All hooks must be unconditional — placed before any early return.

  const handleSelectSkill = useCallback(
    (key: SkillKey) => {
      navigate(`/${key}/chat`)
      setSidebarOpen(false)
    },
    [navigate],
  )

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) setSidebarOpen(false)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // ── Guards ────────────────────────────────────────────────────────────────

  if (skillsLoading) {
    return (
      <div className="h-screen bg-bg flex items-center justify-center">
        <span
          className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin"
          aria-label="Loading…"
        />
      </div>
    )
  }

  const pathSkill = pathname.split('/')[1] as SkillKey | undefined

  if (!pathSkill || !SKILL_MAP[pathSkill] || !installedSlugs.includes(pathSkill)) {
    return <Navigate to="/home" replace />
  }

  // ── Derived values — safe to compute after guards ─────────────────────────

  const activeSkill = pathSkill
  const skill = SKILL_MAP[activeSkill]

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen bg-bg text-text font-sans flex overflow-hidden">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={[
          'fixed lg:static inset-y-0 left-0 z-30',
          'w-64 shrink-0 bg-surface border-r border-border',
          'flex flex-col',
          'transition-transform duration-200 ease-in-out',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        ].join(' ')}
        aria-label="Platform navigation"
      >
        {/* Brand block */}
        <div className="h-16 px-4 py-4 border-b border-border">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate('/home')}
              className="flex items-center gap-3 group"
              aria-label="ClawOS home"
            >
              <div className="text-accent group-hover:text-accent transition-colors">
                <ClawLogo className="w-7 h-7" />
              </div>
              <div>
                <div className="font-display font-bold text-lg leading-none tracking-tight">
                  ClawOS
                </div>
                <div className="text-[10px] text-text-muted font-mono mt-0.5 tracking-wider uppercase">
                  Multi-Skill Platform
                </div>
              </div>
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
              aria-label="Close navigation"
            >
              <IconX />
            </button>
          </div>
        </div>

        {/* Installed skill switcher */}
        <SkillSwitcher activeSkill={activeSkill} onSelectSkill={handleSelectSkill} />

        {/* Active skill nav */}
        <SkillNav skill={skill} onNavigate={() => setSidebarOpen(false)} />

        {/* Platform nav */}
        <PlatformNav />

        {/* Pro upgrade card — free users only */}
        {tier === 'free' && (
          <div className="px-3 pb-2">
            <div
              className="p-4 rounded-2xl space-y-3"
              style={{
                background: 'linear-gradient(135deg, var(--accent-2-dim), var(--accent-dim))',
                border: '1px solid var(--accent-border)',
              }}
            >
              <div>
                <div className="text-sm font-semibold font-display">Go Pro · $9/mo</div>
                <p className="text-xs text-text-muted mt-1 leading-relaxed">
                  LLM outreach, cover letters, resume gap analysis.
                </p>
              </div>
              <button
                onClick={() => navigate('/settings')}
                className="w-full py-2 rounded-xl bg-accent text-bg text-xs font-bold hover:brightness-110 active:scale-95 transition-all"
              >
                Upgrade now
              </button>
            </div>
          </div>
        )}

        {/* User footer */}
        <UserFooter />
      </aside>

      {/* Main panel */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-16 shrink-0 border-b border-border bg-surface flex items-center px-4 gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-all"
            aria-label="Open navigation"
          >
            <IconMenu />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-text-muted">
              <ClawLogo className="w-4 h-4" />
            </span>
            <span className="font-display font-semibold text-sm">{skill.name}</span>
            {skill.version && (
              <span className="hidden sm:inline text-[10px] font-mono text-text-muted">
                {skill.version}
              </span>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 border border-border text-[11px] font-mono text-text-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-success" aria-hidden="true" />
              {tier === 'pro' ? 'Pro' : 'Free'} · Web
            </div>
          </div>
        </header>

        {/* Workspace */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden" id="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
