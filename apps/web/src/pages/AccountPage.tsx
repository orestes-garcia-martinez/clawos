/**
 * AccountPage.tsx — ClawOS platform account settings.
 *
 * Platform-owned content only:
 *   1. Email display
 *   2. Link Telegram Account
 *   3. Billing
 *
 * CareerClaw-specific content (profile, resume) lives at /careerclaw/settings.
 */

import type { JSX } from 'react'
import { useState } from 'react'
import { createBillingCheckout, createBillingPortal, createLinkToken } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { IconLink, IconWarning } from '../shell/icons.tsx'

// ── Section wrapper ────────────────────────────────────────────────────────

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <section
      className="space-y-4"
      aria-labelledby={`section-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div>
        <h2
          id={`section-${title.toLowerCase().replace(/\s+/g, '-')}`}
          className="text-base font-display font-semibold tracking-tight"
        >
          {title}
        </h2>
        {description && <p className="text-xs text-text-muted mt-0.5">{description}</p>}
      </div>
      <div
        className="rounded-2xl p-5 space-y-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {children}
      </div>
    </section>
  )
}

// ── Telegram link section ──────────────────────────────────────────────────

function TelegramLinkSection({ jwt }: { jwt: string }): JSX.Element {
  const [token, setToken] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function handleGenerate() {
    setGenerating(true)
    setError('')
    setToken(null)
    try {
      const result = await createLinkToken(jwt)
      setToken(result.token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate token.')
    } finally {
      setGenerating(false)
    }
  }

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  return (
    <Section
      title="Link Telegram Account"
      description="Connect your Telegram account to continue conversations across channels."
    >
      {!token ? (
        <div className="space-y-3">
          <p className="text-sm text-text-muted leading-relaxed">
            Generate a single-use token, then send the command below to the ClawOS Telegram bot. The
            token expires in 10 minutes.
          </p>
          {error && (
            <p className="text-xs text-danger flex items-center gap-1.5" role="alert">
              <IconWarning className="w-3.5 h-3.5" />
              {error}
            </p>
          )}
          <button
            onClick={() => {
              void handleGenerate()
            }}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-accent text-bg hover:brightness-110 active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
          >
            <IconLink className="w-4 h-4" />
            {generating ? 'Generating…' : 'Generate link token'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            Send this command to the <strong className="text-text">@ClawOS_bot</strong> on Telegram:
          </p>
          <div
            className="flex items-center gap-3 p-3 rounded-xl"
            style={{ background: 'var(--bg)', border: '1px solid var(--accent-border)' }}
          >
            <code className="flex-1 text-sm font-mono text-accent break-all">/link {token}</code>
            <button
              onClick={() => {
                void handleCopy(`/link ${token}`)
              }}
              className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer"
              style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
              aria-label="Copy link command"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-xs font-mono text-text-muted">
            Token expires in 10 minutes · single use
          </p>
          <button
            onClick={() => setToken(null)}
            className="text-xs text-text-muted hover:text-text transition-colors"
          >
            Generate a new token
          </button>
        </div>
      )}
    </Section>
  )
}

// ── Billing section ────────────────────────────────────────────────────────

function BillingSection({ tier, jwt }: { tier: string; jwt: string }): JSX.Element {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleBillingClick() {
    if (!jwt) {
      setError('You must be signed in to manage billing.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const result =
        tier === 'pro' ? await createBillingPortal(jwt) : await createBillingCheckout(jwt)

      window.location.assign(result.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open billing.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Section
      title="Billing"
      description="Polar.sh is the authoritative source for your subscription. Supabase stores a cached snapshot."
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">
              {tier === 'pro' ? 'Pro Plan — $9/mo' : 'Free Plan'}
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              {tier === 'pro'
                ? 'All features unlocked.'
                : 'Upgrade to Pro for LLM outreach, cover letters, and gap analysis.'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              void handleBillingClick()
            }}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 cursor-pointer"
            style={{
              background: tier === 'pro' ? 'var(--surface-2)' : 'var(--accent)',
              color: tier === 'pro' ? 'var(--text-muted)' : 'var(--bg)',
              border: tier === 'pro' ? '1px solid var(--border)' : 'none',
            }}
          >
            {loading
              ? tier === 'pro'
                ? 'Opening…'
                : 'Redirecting…'
              : tier === 'pro'
                ? 'Manage billing'
                : 'Upgrade to Pro'}
          </button>
        </div>

        {error && (
          <p className="text-xs text-danger flex items-center gap-1.5" role="alert">
            <IconWarning className="w-3.5 h-3.5" />
            {error}
          </p>
        )}
      </div>
    </Section>
  )
}

// ── AccountPage ────────────────────────────────────────────────────────────

export function AccountPage(): JSX.Element {
  const { user, session, tier } = useAuth()
  const jwt = session?.access_token ?? ''

  if (!user) return <></>

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Account Settings</h1>
          <p className="text-sm text-text-muted mt-1">{user.email}</p>
        </div>

        <TelegramLinkSection jwt={jwt} />
        <BillingSection tier={tier} jwt={jwt} />
      </div>
    </div>
  )
}
