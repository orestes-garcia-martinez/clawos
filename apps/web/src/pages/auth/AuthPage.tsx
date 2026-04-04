/**
 * AuthPage.tsx — ClawOS authentication page.
 *
 * Single-field magic link design. One email input, one button — handles
 * both new users (account creation) and returning users identically.
 * No password, no tabs, no forgot-password flow.
 *
 * On link click, Supabase fires onAuthStateChange and App.tsx redirects
 * to the user's last workspace.
 */

import type { JSX } from 'react'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { ClawLogo } from '../../shell/icons.tsx'

type SubmitState = 'idle' | 'loading' | 'sent' | 'error'

export function AuthPage(): JSX.Element {
  const [email, setEmail] = useState('')
  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitState('loading')
    setErrorMsg('')

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    })

    if (error) {
      setSubmitState('error')
      setErrorMsg(error.message)
    } else {
      setSubmitState('sent')
    }
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Brand */}
        <div className="text-center space-y-3">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl text-accent"
            style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-border)' }}
          >
            <ClawLogo className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight">ClawOS</h1>
            <p className="text-sm text-text-muted mt-1">Your multi-skill AI platform</p>
          </div>
        </div>

        {submitState === 'sent' ? (
          /* ── Success state ─────────────────────────────────────────────── */
          <div className="text-center space-y-4">
            <div
              className="inline-flex items-center justify-center w-12 h-12 rounded-2xl"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            >
              {/* Envelope icon */}
              <svg
                className="w-6 h-6 text-accent"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <rect
                  x="2"
                  y="4"
                  width="20"
                  height="16"
                  rx="2"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M2 8l10 6 10-6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="space-y-1.5">
              <p className="font-semibold text-text">Check your inbox</p>
              <p className="text-sm text-text-muted leading-relaxed">
                We sent a sign-in link to <span className="text-text font-medium">{email}</span>.
                <br />
                The link expires in 10 minutes.
              </p>
            </div>
            <button
              onClick={() => {
                setSubmitState('idle')
                setEmail('')
              }}
              className="text-xs text-text-muted hover:text-text transition-colors cursor-pointer"
            >
              Use a different email
            </button>
          </div>
        ) : (
          /* ── Form state ────────────────────────────────────────────────── */
          <form
            onSubmit={(e) => {
              void handleSubmit(e)
            }}
            className="space-y-3"
            aria-label="Sign in or create account"
          >
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-text-muted mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2.5 rounded-xl text-sm bg-surface border border-border text-text placeholder:text-text-muted focus:outline-none focus:border-accent-border transition-colors"
              />
            </div>

            {submitState === 'error' && errorMsg && (
              <p className="text-sm text-danger" role="alert">
                {errorMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={submitState === 'loading'}
              className="w-full py-2.5 rounded-xl bg-accent text-bg text-sm font-bold hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              {submitState === 'loading' ? 'Sending…' : 'Continue with email'}
            </button>

            <p className="text-center text-xs text-text-muted pt-1">
              New or returning — works either way.
            </p>
          </form>
        )}

        <p className="text-center text-[11px] font-mono text-text-muted/40 select-none">
          ClawOS · security-first · no ads · no tracking
        </p>
      </div>
    </div>
  )
}
