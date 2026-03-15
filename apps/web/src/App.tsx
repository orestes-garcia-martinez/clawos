/**
 * App.tsx — ClawOS route tree.
 *
 * Route structure:
 *   /                        → redirect to /careerclaw/chat
 *   /auth                    → AuthPage (public)
 *   /:skillKey               → redirect to /:skillKey/chat
 *   /:skillKey/chat          → ChatView    (inside AppShell, auth-guarded)
 *   /:skillKey/jobs          → JobsView
 *   /:skillKey/history       → HistoryView
 *   /settings                → SettingsPage
 *
 * AuthGuard: unauthenticated users are sent to /auth.
 * AuthPage: authenticated users are sent to /careerclaw/chat.
 */

import type { JSX } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext.tsx'
import { AuthPage } from './pages/auth/AuthPage.tsx'
import { AppShell } from './shell/AppShell.tsx'
import { ChatView } from './pages/workspace/ChatView.tsx'
import { JobsView } from './pages/workspace/JobsView.tsx'
import { HistoryView } from './pages/workspace/HistoryView.tsx'
import { SettingsPage } from './pages/SettingsPage.tsx'

// ── Auth guard ─────────────────────────────────────────────────────────────

function AuthGuard({ children }: { children: JSX.Element }): JSX.Element {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="h-screen bg-bg flex items-center justify-center">
        <span
          className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin"
          aria-label="Loading…"
        />
      </div>
    )
  }

  if (!user) return <Navigate to="/auth" replace />
  return children
}

// ── Auth redirect: signed-in users skip /auth ─────────────────────────────

function AuthRedirect(): JSX.Element {
  const { user, loading } = useAuth()
  if (loading) return <></>
  if (user) return <Navigate to="/careerclaw/chat" replace />
  return <AuthPage />
}

// ── Skill route guard: redirect /:skillKey → /:skillKey/chat ──────────────

function SkillRoot({ skillKey }: { skillKey: string }): JSX.Element {
  return <Navigate to={`/${skillKey}/chat`} replace />
}

// ── App ────────────────────────────────────────────────────────────────────

function AppRoutes(): JSX.Element {
  return (
    <Routes>
      {/* Public */}
      <Route path="/auth" element={<AuthRedirect />} />

      {/* Platform shell — auth-guarded */}
      <Route
        element={
          <AuthGuard>
            <AppShell />
          </AuthGuard>
        }
      >
        {/* Workspace routes */}
        {['careerclaw', 'scrapeclaw', 'investclaw'].map((sk) => (
          <Route key={sk} path={`/${sk}`} element={<SkillRoot skillKey={sk} />} />
        ))}

        <Route path="/careerclaw/chat" element={<ChatView />} />
        <Route path="/careerclaw/jobs" element={<JobsView />} />
        <Route path="/careerclaw/history" element={<HistoryView />} />

        {/* Coming-soon skills — shell renders overlay, no workspace routes needed */}
        <Route path="/scrapeclaw/*" element={<Navigate to="/scrapeclaw/chat" replace />} />
        <Route path="/scrapeclaw/chat" element={<></>} />
        <Route path="/investclaw/*" element={<Navigate to="/investclaw/chat" replace />} />
        <Route path="/investclaw/chat" element={<></>} />

        {/* Platform pages */}
        <Route path="/settings" element={<SettingsPage />} />

        {/* Default */}
        <Route path="/" element={<Navigate to="/careerclaw/chat" replace />} />
        <Route path="*" element={<Navigate to="/careerclaw/chat" replace />} />
      </Route>
    </Routes>
  )
}

export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
