/**
 * App.tsx — ClawOS route tree.
 *
 * Route structure:
 *   /auth                    → AuthPage (public; skipped if signed in)
 *   /skills                  → SkillsPage (auth-guarded, no AppShell)
 *   /home                    → HomePage (auth-guarded, inside AppShell)
 *   /careerclaw/chat         → ChatView    (inside AppShell, auth-guarded)
 *   /careerclaw/jobs         → JobsView
 *   /careerclaw/history      → HistoryView
 *   /sessions                → SessionsPage
 *   /notifications           → NotificationsPage
 *   /settings                → SettingsPage
 *   / and *                  → RootRedirect (skills-aware, localStorage-backed)
 *
 * Auth redirect rules (skills-aware):
 *   0 installed skills   → /home
 *   ≥1 installed skills  → last active skill (localStorage) or installedSlugs[0]
 *
 * AuthGuard: unauthenticated users are sent to /auth.
 * SkillsProvider: must be inside AuthProvider; supplies useSkills() to all routes.
 *
 * localStorage key: 'clawos-last-skill'
 *   Written by AppShell on every valid skill route change.
 *   Read here to restore the user's last workspace on re-entry.
 */

import type { JSX } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext.tsx'
import { SkillsProvider, useSkills } from './context/SkillsContext.tsx'
import { AuthPage } from './pages/auth/AuthPage.tsx'
import { HomePage } from './pages/HomePage.tsx'
import { SkillsPage } from './pages/SkillsPage.tsx'
import { SessionsPage } from './pages/SessionsPage.tsx'
import { NotificationsPage } from './pages/NotificationsPage.tsx'
import { AppShell } from './shell/AppShell.tsx'
import { ChatView } from './pages/workspace/ChatView.tsx'
import { JobsView } from './pages/workspace/JobsView.tsx'
import { HistoryView } from './pages/workspace/HistoryView.tsx'
import { SettingsPage } from './pages/SettingsPage.tsx'
import type { SkillKey } from './skills'
import { SKILL_MAP } from './skills'

// ── Shared loading spinner ──────────────────────────────────────────────────

function LoadingScreen(): JSX.Element {
  return (
    <div className="h-screen bg-bg flex items-center justify-center">
      <span
        className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin"
        aria-label="Loading…"
      />
    </div>
  )
}

// ── localStorage helpers ────────────────────────────────────────────────────

const LAST_SKILL_KEY = 'clawos-last-skill'

export function writeLastSkill(slug: SkillKey): void {
  try {
    localStorage.setItem(LAST_SKILL_KEY, slug)
  } catch {
    /* ignore — private browsing / storage full */
  }
}

function readLastSkill(): SkillKey | null {
  try {
    const stored = localStorage.getItem(LAST_SKILL_KEY) as SkillKey | null
    // Validate it is still a known skill key before trusting it
    if (stored && stored in SKILL_MAP) return stored
  } catch {
    /* ignore */
  }
  return null
}

// ── Auth guard ──────────────────────────────────────────────────────────────

function AuthGuard({ children }: { children: JSX.Element }): JSX.Element {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/auth" replace />
  return children
}

// ── /auth: signed-in users are redirected away ─────────────────────────────

function AuthRedirect(): JSX.Element {
  const { user, loading: authLoading } = useAuth()
  const { installedSlugs, loading: skillsLoading } = useSkills()

  if (authLoading || (user && skillsLoading)) return <LoadingScreen />
  if (!user) return <AuthPage />
  if (installedSlugs.length === 0) return <Navigate to="/home" replace />

  // Restore last active skill if it is still installed
  const lastSkill = readLastSkill()
  const destination =
    lastSkill && installedSlugs.includes(lastSkill) ? lastSkill : installedSlugs[0]
  return <Navigate to={`/${destination}/chat`} replace />
}

// ── / and *: skills-aware root redirect ────────────────────────────────────

function RootRedirect(): JSX.Element {
  const { installedSlugs, loading } = useSkills()
  if (loading) return <LoadingScreen />
  if (installedSlugs.length === 0) return <Navigate to="/home" replace />

  const lastSkill = readLastSkill()
  const destination =
    lastSkill && installedSlugs.includes(lastSkill) ? lastSkill : installedSlugs[0]
  return <Navigate to={`/${destination}/chat`} replace />
}

// ── App ─────────────────────────────────────────────────────────────────────

function AppRoutes(): JSX.Element {
  return (
    <Routes>
      {/* Public */}
      <Route path="/auth" element={<AuthRedirect />} />

      {/* Skill catalog — auth-guarded, no AppShell (full-page experience) */}
      <Route
        path="/skills"
        element={
          <AuthGuard>
            <SkillsPage />
          </AuthGuard>
        }
      />

      {/* All other auth-guarded routes — wrapped by AppShell */}
      <Route
        element={
          <AuthGuard>
            <AppShell />
          </AuthGuard>
        }
      >
        {/* Platform home — zero-state welcome page */}
        <Route path="/home" element={<HomePage />} />

        {/* CareerClaw workspace */}
        <Route path="/careerclaw/chat" element={<ChatView />} />
        <Route path="/careerclaw/jobs" element={<JobsView />} />
        <Route path="/careerclaw/history" element={<HistoryView />} />

        {/* Platform pages */}
        <Route path="/sessions" element={<SessionsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/settings" element={<SettingsPage />} />

        {/* Root and catch-all */}
        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<RootRedirect />} />
      </Route>
    </Routes>
  )
}

export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SkillsProvider>
          <AppRoutes />
        </SkillsProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
