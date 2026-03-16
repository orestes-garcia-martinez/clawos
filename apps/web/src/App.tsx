/**
 * App.tsx — ClawOS route tree.
 *
 * Route structure:
 *   /auth                    → AuthPage (public; skipped if signed in)
 *   /home                    → HomePage (auth-guarded; no AppShell)
 *   /careerclaw/chat         → ChatView    (inside AppShell, auth-guarded)
 *   /careerclaw/jobs         → JobsView
 *   /careerclaw/history      → HistoryView
 *   /settings                → SettingsPage
 *   / and *                  → RootRedirect (skills-aware)
 *
 * Auth redirect rules (skills-aware):
 *   0 installed skills   → /home
 *   ≥1 installed skills  → /{installedSlugs[0]}/chat
 *
 * AuthGuard: unauthenticated users are sent to /auth.
 * SkillsProvider: must be inside AuthProvider; supplies useSkills() to all routes.
 */

import type { JSX } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext.tsx'

import { AuthPage } from './pages/auth/AuthPage.tsx'

import { JobsView } from './pages/workspace/JobsView.tsx'
import { HistoryView } from './pages/workspace/HistoryView.tsx'
import { SettingsPage } from './pages/SettingsPage.tsx'
import { SkillsProvider, useSkills } from './context/SkillsContext.tsx'
import { HomePage } from './pages/HomePage.tsx'
import { AppShell } from './shell/AppShell.tsx'
import { ChatView } from './pages/workspace/ChatView.tsx'

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

// ── Auth guard ──────────────────────────────────────────────────────────────

function AuthGuard({ children }: { children: JSX.Element }): JSX.Element {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/auth" replace />
  return children
}

// ── /auth: signed-in users are redirected away ─────────────────────────────
// Waits for both auth and skills to resolve before choosing the destination.

function AuthRedirect(): JSX.Element {
  const { user, loading: authLoading } = useAuth()
  const { installedSlugs, loading: skillsLoading } = useSkills()

  if (authLoading || (user && skillsLoading)) return <LoadingScreen />
  if (!user) return <AuthPage />
  if (installedSlugs.length === 0) return <Navigate to="/home" replace />
  return <Navigate to={`/${installedSlugs[0]}/chat`} replace />
}

// ── / and *: skills-aware root redirect ────────────────────────────────────

function RootRedirect(): JSX.Element {
  const { installedSlugs, loading } = useSkills()
  if (loading) return <LoadingScreen />
  if (installedSlugs.length === 0) return <Navigate to="/home" replace />
  return <Navigate to={`/${installedSlugs[0]}/chat`} replace />
}

// ── App ─────────────────────────────────────────────────────────────────────

function AppRoutes(): JSX.Element {
  return (
    <Routes>
      {/* Public */}
      <Route path="/auth" element={<AuthRedirect />} />

      {/* Platform home — auth-guarded, no AppShell sidebar */}
      <Route
        path="/home"
        element={
          <AuthGuard>
            <HomePage />
          </AuthGuard>
        }
      />

      {/* Platform shell — auth-guarded, AppShell sidebar */}
      <Route
        element={
          <AuthGuard>
            <AppShell />
          </AuthGuard>
        }
      >
        {/* CareerClaw workspace */}
        <Route path="/careerclaw/chat" element={<ChatView />} />
        <Route path="/careerclaw/jobs" element={<JobsView />} />
        <Route path="/careerclaw/history" element={<HistoryView />} />

        {/* Platform pages */}
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
