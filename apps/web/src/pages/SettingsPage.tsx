/**
 * SettingsPage.tsx — ClawOS user settings.
 *
 * Sections:
 *   1. Profile        — name, work mode, salary min, location
 *   2. Resume         — view extracted text, clear button
 *   3. Link Telegram  — generate link token, display /link <token> instruction
 *   4. Billing        — Polar portal link (static URL for MVP)
 */

import type { JSX } from 'react'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { createLinkToken } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { IconCheck, IconLink, IconWarning } from '../shell/icons.tsx'

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

// ── Field helpers ──────────────────────────────────────────────────────────

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-medium text-text-muted mb-1">
      {children}
    </label>
  )
}

function TextInput({
  id,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  id: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}): JSX.Element {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 rounded-xl text-sm bg-bg border border-border text-text placeholder:text-text-muted focus:outline-none focus:border-accent-border transition-colors"
    />
  )
}

// ── Profile form ───────────────────────────────────────────────────────────

interface ProfileData {
  name: string
  work_mode: string
  salary_min: string
  location_pref: string
}

function ProfileSection({ userId }: { userId: string }): JSX.Element {
  const [form, setForm] = useState<ProfileData>({
    name: '',
    work_mode: '',
    salary_min: '',
    location_pref: '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // Load existing profile
  useEffect(() => {
    void Promise.all([
      supabase.from('users').select('name').eq('id', userId).single(),
      supabase
        .from('careerclaw_profiles')
        .select('work_mode, salary_min, location_pref')
        .eq('user_id', userId)
        .maybeSingle(),
    ]).then(([{ data: user }, { data: profile }]) => {
      setForm({
        name: user?.name ?? '',
        work_mode: profile?.work_mode ?? '',
        salary_min: profile?.salary_min != null ? String(profile.salary_min) : '',
        location_pref: profile?.location_pref ?? '',
      })
    })
  }, [userId])

  const setField = (key: keyof ProfileData) => (val: string) =>
    setForm((f) => ({ ...f, [key]: val }))

  async function handleSave() {
    setSaving(true)
    setError('')
    setSaved(false)

    const salaryNum = form.salary_min ? parseInt(form.salary_min, 10) : null

    const [userRes, profileRes] = await Promise.all([
      supabase
        .from('users')
        .update({ name: form.name || null })
        .eq('id', userId),
      supabase.from('careerclaw_profiles').upsert(
        {
          user_id: userId,
          work_mode: (form.work_mode as 'remote' | 'hybrid' | 'onsite') || null,
          salary_min: salaryNum,
          location_pref: form.location_pref || null,
        },
        { onConflict: 'user_id' },
      ),
    ])

    setSaving(false)
    if (userRes.error || profileRes.error) {
      setError('Could not save. Please try again.')
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    }
  }

  return (
    <Section
      title="Profile"
      description="Used by CareerClaw to personalise job searches and outreach."
    >
      <div className="space-y-3">
        <div>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <TextInput
            id="name"
            value={form.name}
            onChange={setField('name')}
            placeholder="Your name"
          />
        </div>

        <div>
          <FieldLabel htmlFor="work_mode">Work mode</FieldLabel>
          <select
            id="work_mode"
            value={form.work_mode}
            onChange={(e) => setField('work_mode')(e.target.value)}
            className="w-full px-3 py-2 rounded-xl text-sm bg-bg border border-border text-text focus:outline-none focus:border-accent-border transition-colors appearance-none"
          >
            <option value="">Not specified</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">On-site</option>
          </select>
        </div>

        <div>
          <FieldLabel htmlFor="salary_min">Minimum salary (USD/year)</FieldLabel>
          <TextInput
            id="salary_min"
            type="number"
            value={form.salary_min}
            onChange={setField('salary_min')}
            placeholder="e.g. 80000"
          />
        </div>

        <div>
          <FieldLabel htmlFor="location_pref">Location preference</FieldLabel>
          <TextInput
            id="location_pref"
            value={form.location_pref}
            onChange={setField('location_pref')}
            placeholder="e.g. New York, NY or Remote US"
          />
        </div>

        {error && (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        )}

        <button
          onClick={() => {
            void handleSave()
          }}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-bg text-sm font-semibold hover:brightness-110 active:scale-95 disabled:opacity-50 transition-all"
        >
          {saved ? (
            <>
              <IconCheck className="w-4 h-4" /> Saved
            </>
          ) : saving ? (
            'Saving…'
          ) : (
            'Save profile'
          )}
        </button>
      </div>
    </Section>
  )
}

// ── Resume section ─────────────────────────────────────────────────────────

function ResumeSection({ userId }: { userId: string }): JSX.Element {
  const [resumeText, setResumeText] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState(false)
  const [cleared, setCleared] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    void supabase
      .from('careerclaw_profiles')
      .select('resume_text')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        setResumeText(data?.resume_text ?? null)
        setLoading(false)
      })
  }, [userId])

  useEffect(() => {
    load()
  }, [load])

  async function handleClear() {
    setClearing(true)
    await supabase.from('careerclaw_profiles').update({ resume_text: null }).eq('user_id', userId)
    setResumeText(null)
    setClearing(false)
    setCleared(true)
    setTimeout(() => setCleared(false), 2500)
  }

  return (
    <Section
      title="Resume"
      description="Only extracted plain text is stored. Your raw PDF is never saved."
    >
      {loading ? (
        <p className="text-xs text-text-muted">Loading…</p>
      ) : resumeText ? (
        <div className="space-y-3">
          <div
            className="rounded-xl p-3 text-xs font-mono text-text-dim leading-relaxed overflow-y-auto max-h-40 whitespace-pre-wrap"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
            aria-label="Extracted resume text"
          >
            {resumeText.slice(0, 1200)}
            {resumeText.length > 1200 ? '…' : ''}
          </div>
          <p className="text-[11px] font-mono text-text-muted">
            {resumeText.length.toLocaleString()} characters stored
          </p>
          <button
            onClick={() => {
              void handleClear()
            }}
            disabled={clearing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: 'rgba(239,68,68,0.08)',
              color: 'var(--danger)',
              border: '1px solid rgba(239,68,68,0.2)',
            }}
          >
            {cleared ? (
              <>
                <IconCheck className="w-4 h-4" /> Cleared
              </>
            ) : clearing ? (
              'Clearing…'
            ) : (
              'Clear resume text'
            )}
          </button>
        </div>
      ) : (
        <p className="text-sm text-text-muted">
          No resume stored yet. Upload a PDF from the Chat tab.
        </p>
      )}
    </Section>
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
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-accent text-bg hover:brightness-110 active:scale-95 disabled:opacity-50 transition-all"
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
              className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
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

function BillingSection({ tier }: { tier: string }): JSX.Element {
  // Polar.sh portal — static URL for MVP. Billing webhook is Chat 7.
  const POLAR_PORTAL = 'https://polar.sh'

  return (
    <Section
      title="Billing"
      description="Polar.sh is the authoritative source for your subscription. Supabase stores a cached snapshot."
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{tier === 'pro' ? 'Pro Plan — $9/mo' : 'Free Plan'}</p>
          <p className="text-xs text-text-muted mt-0.5">
            {tier === 'pro'
              ? 'All features unlocked.'
              : 'Upgrade to Pro for LLM outreach, cover letters, and gap analysis.'}
          </p>
        </div>
        <a
          href={POLAR_PORTAL}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
          style={{
            background: tier === 'pro' ? 'var(--surface-2)' : 'var(--accent)',
            color: tier === 'pro' ? 'var(--text-muted)' : 'var(--bg)',
            border: tier === 'pro' ? '1px solid var(--border)' : 'none',
          }}
        >
          {tier === 'pro' ? 'Manage billing' : 'Upgrade to Pro'}
        </a>
      </div>
    </Section>
  )
}

// ── SettingsPage ───────────────────────────────────────────────────────────

export function SettingsPage(): JSX.Element {
  const { user, session, tier } = useAuth()
  const jwt = session?.access_token ?? ''

  if (!user) return <></>

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-text-muted mt-1">{user.email}</p>
        </div>

        <ProfileSection userId={user.id} />
        <ResumeSection userId={user.id} />
        <TelegramLinkSection jwt={jwt} />
        <BillingSection tier={tier} />
      </div>
    </div>
  )
}
