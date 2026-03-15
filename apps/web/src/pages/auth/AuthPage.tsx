/**
 * AuthPage.tsx — ClawOS authentication page.
 *
 * Three tabs:
 *   Sign in    — email + password
 *   Sign up    — email + password (Supabase creates users row via trigger)
 *   Magic link — passwordless email link
 *
 * On success the AuthContext listener picks up the new session
 * and App.tsx redirects to /careerclaw/chat.
 */

import type { JSX } from 'react'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { ClawLogo } from '../../shell/icons.tsx'

type Tab = 'signin' | 'signup' | 'magic'

interface FormState {
  email: string
  password: string
}

type SubmitState = 'idle' | 'loading' | 'success' | 'error'

export function AuthPage(): JSX.Element {
  const [tab, setTab] = useState<Tab>('signin')
  const [form, setForm] = useState<FormState>({ email: '', password: '' })
  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const setField = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }))

  const reset = () => {
    setSubmitState('idle')
    setErrorMsg('')
    setSuccessMsg('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    reset()
    setSubmitState('loading')

    try {
      if (tab === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        })
        if (error) throw error
        // AuthContext onAuthStateChange handles redirect
      } else if (tab === 'signup') {
        const { error } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
        })
        if (error) throw error
        setSubmitState('success')
        setSuccessMsg('Check your email to confirm your account, then sign in.')
        return
      } else {
        // Magic link
        const { error } = await supabase.auth.signInWithOtp({
          email: form.email,
          options: { shouldCreateUser: true },
        })
        if (error) throw error
        setSubmitState('success')
        setSuccessMsg('Magic link sent! Check your email.')
        return
      }
      setSubmitState('idle')
    } catch (err) {
      setSubmitState('error')
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  }

  const TAB_LABELS: { id: Tab; label: string }[] = [
    { id: 'signin', label: 'Sign in' },
    { id: 'signup', label: 'Sign up' },
    { id: 'magic', label: 'Magic link' },
  ]

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-4">
      {/* Card */}
      <div className="w-full max-w-sm space-y-6">
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

        {/* Tab bar */}
        <div
          className="flex rounded-xl p-1 gap-1"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
          role="tablist"
          aria-label="Authentication options"
        >
          {TAB_LABELS.map(({ id, label }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => {
                setTab(id)
                reset()
              }}
              className={[
                'flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                tab === id ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Form */}
        <form
          onSubmit={(e) => {
            void handleSubmit(e)
          }}
          className="space-y-3"
          aria-label={TAB_LABELS.find((t) => t.id === tab)?.label}
        >
          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-xs font-medium text-text-muted mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={setField('email')}
              placeholder="you@example.com"
              className="w-full px-3 py-2.5 rounded-xl text-sm bg-surface border border-border text-text placeholder:text-text-muted focus:outline-none focus:border-accent-border transition-colors"
            />
          </div>

          {/* Password — hidden for magic link */}
          {tab !== 'magic' && (
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium text-text-muted mb-1.5"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
                required
                minLength={8}
                value={form.password}
                onChange={setField('password')}
                placeholder="••••••••"
                className="w-full px-3 py-2.5 rounded-xl text-sm bg-surface border border-border text-text placeholder:text-text-muted focus:outline-none focus:border-accent-border transition-colors"
              />
            </div>
          )}

          {/* Error / success messages */}
          {submitState === 'error' && errorMsg && (
            <p className="text-sm text-danger" role="alert">
              {errorMsg}
            </p>
          )}
          {submitState === 'success' && successMsg && (
            <p className="text-sm text-success" role="status">
              {successMsg}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitState === 'loading'}
            className="w-full py-2.5 rounded-xl bg-accent text-bg text-sm font-bold hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {submitState === 'loading'
              ? 'Please wait…'
              : tab === 'signin'
                ? 'Sign in'
                : tab === 'signup'
                  ? 'Create account'
                  : 'Send magic link'}
          </button>
        </form>

        <p className="text-center text-[11px] font-mono text-text-muted/40 select-none">
          ClawOS · security-first · no ads · no tracking
        </p>
      </div>
    </div>
  )
}
