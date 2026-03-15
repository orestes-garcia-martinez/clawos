/**
 * UserFooter.tsx — bottom-of-sidebar user area.
 *
 * Shows: avatar initial, plan tier, theme toggle.
 * Clicking the avatar shows a minimal sign-out option.
 */

import type { JSX } from 'react'
import { useState, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { IconSun, IconMoon } from './icons.tsx'

type Theme = 'dark' | 'light'

function getStoredTheme(): Theme {
  try {
    return (localStorage.getItem('clawos-theme') as Theme) ?? 'dark'
  } catch {
    return 'dark'
  }
}

export function UserFooter(): JSX.Element {
  const { user, tier, signOut } = useAuth()
  const [theme, setTheme] = useState<Theme>(getStoredTheme)
  const [menuOpen, setMenuOpen] = useState(false)

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark'
      document.documentElement.dataset['theme'] = next
      try {
        localStorage.setItem('clawos-theme', next)
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const initial = user?.email?.charAt(0).toUpperCase() ?? '?'
  const email = user?.email ?? ''

  return (
    <div className="p-3 border-t border-border relative">
      {/* Sign-out popover */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            aria-hidden="true"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute bottom-full left-3 right-3 mb-1 z-20 rounded-xl border border-border bg-surface shadow-lg overflow-hidden">
            <div className="px-3 py-2.5 border-b border-border-subtle">
              <p className="text-xs font-medium text-text truncate">{email}</p>
              <p className="text-[11px] text-text-muted mt-0.5 font-mono">
                {tier === 'pro' ? 'Pro Plan' : 'Free Plan'}
              </p>
            </div>
            <button
              onClick={() => {
                setMenuOpen(false)
                void signOut()
              }}
              className="w-full px-3 py-2 text-sm text-left text-danger hover:bg-surface-2 transition-colors"
            >
              Sign out
            </button>
          </div>
        </>
      )}

      <div className="flex items-center gap-2.5">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="w-8 h-8 rounded-full bg-surface-3 border border-border flex items-center justify-center text-xs font-bold font-mono text-text-muted shrink-0 hover:border-accent-border hover:text-text transition-all"
          aria-label="Account menu"
          aria-expanded={menuOpen}
        >
          {initial}
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-text truncate">
            {tier === 'pro' ? 'Pro Plan' : 'Free Plan'}
          </p>
        </div>
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-all shrink-0"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <IconSun /> : <IconMoon />}
        </button>
      </div>
    </div>
  )
}
