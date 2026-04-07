/**
 * CareerClawSettingsPage.tsx — CareerClaw skill profile and resume.
 *
 * Skill-owned content only:
 *   1. Profile form — name, work mode, salary min, location
 *   2. Resume — ResumeUploadZone + extracted text viewer + clear button
 *
 * Platform content (Telegram linking, billing) lives at /account.
 * Accessible from the CareerClaw skill nav: /careerclaw/settings.
 */

import type { JSX } from 'react'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../lib/supabase.ts'
import { useAuth } from '../../../context/AuthContext.tsx'
import { ResumeUploadZone } from '../../../components/ResumeUploadZone.tsx'
import { IconCheck } from '../../../shell/icons.tsx'

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
  location_radius_mi: string
}

function ProfileSection({ userId }: { userId: string }): JSX.Element {
  const [form, setForm] = useState<ProfileData>({
    name: '',
    work_mode: '',
    salary_min: '',
    location_pref: '',
    location_radius_mi: '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void Promise.all([
      supabase.from('users').select('name').eq('id', userId).single(),
      supabase
        .from('careerclaw_profiles')
        .select('work_mode, salary_min, location_pref, location_radius_mi')
        .eq('user_id', userId)
        .maybeSingle(),
    ]).then(([{ data: user }, { data: profile }]) => {
      setForm({
        name: user?.name ?? '',
        work_mode: profile?.work_mode ?? '',
        salary_min: profile?.salary_min != null ? String(profile.salary_min) : '',
        location_pref: profile?.location_pref ?? '',
        location_radius_mi:
          (profile as { location_radius_mi?: number | null } | null)?.location_radius_mi != null
            ? String((profile as { location_radius_mi?: number | null }).location_radius_mi)
            : '',
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
    const radiusNum = form.location_radius_mi ? parseInt(form.location_radius_mi, 10) : null
    const isLocationBased = form.work_mode === 'onsite' || form.work_mode === 'hybrid'

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
          // Only persist radius for location-based modes; clear it for remote.
          location_radius_mi: isLocationBased ? radiusNum : null,
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
          <p className="text-[11px] text-text-muted mt-1">
            Required when work mode is On-site. You can list multiple locations, e.g. "Miami, FL or
            Tampa, FL".
          </p>
        </div>

        {(form.work_mode === 'onsite' || form.work_mode === 'hybrid') && (
          <div>
            <FieldLabel htmlFor="location_radius_mi">Search radius</FieldLabel>
            <select
              id="location_radius_mi"
              value={form.location_radius_mi}
              onChange={(e) => setField('location_radius_mi')(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm bg-bg border border-border text-text focus:outline-none focus:border-accent-border transition-colors appearance-none"
            >
              <option value="">Default (25 mi)</option>
              <option value="10">10 miles</option>
              <option value="25">25 miles</option>
              <option value="50">50 miles</option>
              <option value="100">100 miles</option>
            </select>
            <p className="text-[11px] text-text-muted mt-1">
              How far from your location to search for jobs.
            </p>
          </div>
        )}

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

interface ResumeState {
  resumeText: string | null
  resumeUploadedAt: string | null
  loading: boolean
}

function ResumeSection({ userId, jwt }: { userId: string; jwt: string }): JSX.Element {
  const [state, setState] = useState<ResumeState>({
    resumeText: null,
    resumeUploadedAt: null,
    loading: true,
  })
  const [clearing, setClearing] = useState(false)
  const [cleared, setCleared] = useState(false)
  const [clearError, setClearError] = useState('')

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }))
    void supabase
      .from('careerclaw_profiles')
      .select('resume_text, resume_uploaded_at')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        setState({
          resumeText: data?.resume_text ?? null,
          resumeUploadedAt:
            (data as { resume_uploaded_at?: string | null } | null)?.resume_uploaded_at ?? null,
          loading: false,
        })
      })
  }, [userId])

  useEffect(() => {
    load()
  }, [load])

  function handleUploaded(text: string, uploadedAt: string) {
    setState({ resumeText: text, resumeUploadedAt: uploadedAt, loading: false })
  }

  async function handleClear() {
    setClearing(true)
    setClearError('')
    const { error } = await supabase
      .from('careerclaw_profiles')
      .update({
        resume_text: null,
        skills: null,
        target_roles: null,
        experience_years: null,
        resume_summary: null,
        resume_uploaded_at: null,
      } as Record<string, null>)
      .eq('user_id', userId)

    setClearing(false)

    if (error) {
      setClearError('Could not clear resume. Please try again.')
      return
    }

    setState({ resumeText: null, resumeUploadedAt: null, loading: false })
    setCleared(true)
    setTimeout(() => setCleared(false), 2500)
  }

  return (
    <Section
      title="Resume"
      description="Only extracted plain text is stored. Your raw PDF is never saved."
    >
      {state.loading ? (
        <p className="text-xs text-text-muted">Loading…</p>
      ) : (
        <div className="space-y-4">
          <ResumeUploadZone
            jwt={jwt}
            userId={userId}
            uploadedAt={state.resumeUploadedAt}
            onUploaded={handleUploaded}
          />

          {/* Extracted text preview */}
          {state.resumeText && (
            <div className="space-y-2">
              <p className="text-[11px] font-mono text-text-muted">
                {state.resumeText.length.toLocaleString()} characters stored
              </p>
              <div
                className="rounded-xl p-3 text-xs font-mono text-text-dim leading-relaxed overflow-y-auto max-h-40 whitespace-pre-wrap"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                aria-label="Extracted resume text"
              >
                {state.resumeText.slice(0, 1200)}
                {state.resumeText.length > 1200 ? '…' : ''}
              </div>

              {clearError && (
                <p className="text-xs text-danger" role="alert">
                  {clearError}
                </p>
              )}

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
          )}
        </div>
      )}
    </Section>
  )
}

// ── CareerClawSettingsPage ─────────────────────────────────────────────────

export function SettingsView(): JSX.Element {
  const { user, session } = useAuth()
  const jwt = session?.access_token ?? ''

  if (!user) return <></>

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">CareerClaw Profile</h1>
          <p className="text-sm text-text-muted mt-1">
            Used to match jobs, score results, and personalise outreach.
          </p>
        </div>

        <ProfileSection userId={user.id} />
        <ResumeSection userId={user.id} jwt={jwt} />
      </div>
    </div>
  )
}
