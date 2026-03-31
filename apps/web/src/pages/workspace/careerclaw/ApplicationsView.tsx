/**
 * ApplicationsView.tsx — CareerClaw job application tracker.
 *
 * Fixes vs previous iteration:
 *   - ActionMenu popover uses position:fixed + getBoundingClientRect so it
 *     escapes the table's overflow:hidden container and never clips.
 *   - Delete confirmation uses an in-theme modal (matches SkillSwitcher's
 *     RemoveConfirmModal pattern) — window.confirm() removed entirely.
 */

import type { JSX, ChangeEvent } from 'react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../../lib/supabase.ts'
import { useAuth } from '../../../context/AuthContext.tsx'
import { IconPlus, IconEllipsis, IconX } from '../../../shell/icons.tsx'

// ── Types ──────────────────────────────────────────────────────────────────

type AppStatus = 'saved' | 'applied' | 'interviewing' | 'offer' | 'rejected'

interface AppRow {
  id: string
  job_id: string
  title: string
  company: string
  status: AppStatus
  url: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

type LoadState = 'loading' | 'loaded' | 'error'

// ── Status config ──────────────────────────────────────────────────────────

const STATUS_OPTIONS: AppStatus[] = ['saved', 'applied', 'interviewing', 'offer', 'rejected']

const STATUS_COLORS: Record<AppStatus, string> = {
  saved: 'var(--text-muted)',
  applied: 'var(--accent)',
  interviewing: 'var(--warning)',
  offer: 'var(--success)',
  rejected: 'var(--danger)',
}

const STATUS_LABELS: Record<AppStatus, string> = {
  saved: 'Saved',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
}

// ── StatusPill ─────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: AppStatus }): JSX.Element {
  const color = STATUS_COLORS[status] ?? 'var(--text-muted)'
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold whitespace-nowrap"
      style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

// ── Field helpers — match SettingsPage exactly ─────────────────────────────

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

const inputClass =
  'w-full px-3 py-2 rounded-xl text-sm bg-bg border border-border text-text placeholder:text-text-muted focus:outline-none focus:border-accent-border transition-colors'

// ── Delete confirmation modal — matches RemoveConfirmModal in SkillSwitcher ─

interface DeleteConfirmModalProps {
  title: string
  company: string
  onConfirm: () => void
  onCancel: () => void
}

function DeleteConfirmModal({
  title,
  company,
  onConfirm,
  onCancel,
}: DeleteConfirmModalProps): JSX.Element {
  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" aria-hidden="true" onClick={onCancel} />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-app-title"
      >
        <div
          className="w-full max-w-sm rounded-2xl border border-border bg-surface shadow-xl p-6 space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="space-y-1.5">
            <h2
              id="delete-app-title"
              className="font-display font-bold text-base text-text leading-tight"
            >
              Delete this application?
            </h2>
            <p className="text-sm text-text-muted leading-relaxed">
              <span className="text-text font-medium">{title}</span> at{' '}
              <span className="text-text font-medium">{company}</span> will be permanently removed.
              This cannot be undone.
            </p>
          </div>

          <div className="flex gap-2.5 pt-1">
            <button
              onClick={onCancel}
              className="flex-1 py-2 rounded-xl border border-border text-sm font-medium text-text-muted hover:text-text hover:bg-surface-2 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-2 rounded-xl bg-danger text-bg text-sm font-semibold hover:brightness-110 active:scale-95 transition-all cursor-pointer"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Application modal (Add + Edit) ─────────────────────────────────────────

interface AppModalProps {
  initial: AppRow | null
  userId: string
  onClose: () => void
  onSaved: (row: AppRow) => void
}

function AppModal({ initial, userId, onClose, onSaved }: AppModalProps): JSX.Element {
  const isEdit = initial !== null

  const [title, setTitle] = useState(initial?.title ?? '')
  const [company, setCompany] = useState(initial?.company ?? '')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [status, setStatus] = useState<AppStatus>(initial?.status ?? 'saved')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSave(): Promise<void> {
    if (!title.trim() || !company.trim()) return
    setSaving(true)
    setError(null)

    if (isEdit) {
      const { data, error: err } = await supabase
        .from('careerclaw_job_tracking')
        .update({
          title: title.trim(),
          company: company.trim(),
          url: url.trim() || null,
          status,
          notes: notes.trim() || null,
        })
        .eq('id', initial.id)
        .select('id, job_id, title, company, status, url, notes, created_at, updated_at')
        .single()

      setSaving(false)
      if (err || !data) {
        setError('Failed to save. Please try again.')
        return
      }
      onSaved(data as AppRow)
    } else {
      const { data, error: err } = await supabase
        .from('careerclaw_job_tracking')
        .insert({
          user_id: userId,
          job_id: crypto.randomUUID(),
          title: title.trim(),
          company: company.trim(),
          url: url.trim() || null,
          status,
          notes: notes.trim() || null,
        })
        .select('id, job_id, title, company, status, url, notes, created_at, updated_at')
        .single()

      setSaving(false)
      if (err || !data) {
        setError('Failed to add. Please try again.')
        return
      }
      onSaved(data as AppRow)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'Edit application' : 'Add application'}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="w-full max-w-md rounded-2xl shadow-2xl flex flex-col bg-surface border border-border">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 shrink-0 border-b border-border">
            <h2 className="font-display font-semibold text-base tracking-tight">
              {isEdit ? 'Edit application' : 'Add application'}
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <IconX />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-5 space-y-4 overflow-y-auto">
            <div>
              <FieldLabel htmlFor="app-title">
                Job title <span className="text-danger">*</span>
              </FieldLabel>
              <input
                id="app-title"
                type="text"
                value={title}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
                placeholder="Senior Frontend Engineer"
                maxLength={300}
                className={inputClass}
              />
            </div>

            <div>
              <FieldLabel htmlFor="app-company">
                Company <span className="text-danger">*</span>
              </FieldLabel>
              <input
                id="app-company"
                type="text"
                value={company}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setCompany(e.target.value)}
                placeholder="Acme Corp"
                maxLength={300}
                className={inputClass}
              />
            </div>

            <div>
              <FieldLabel htmlFor="app-url">Job URL</FieldLabel>
              <input
                id="app-url"
                type="url"
                value={url}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
                placeholder="https://..."
                maxLength={2000}
                className={inputClass}
              />
            </div>

            <div>
              <FieldLabel htmlFor="app-status">Status</FieldLabel>
              <select
                id="app-status"
                value={status}
                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                  setStatus(e.target.value as AppStatus)
                }
                className={`${inputClass} appearance-none`}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <FieldLabel htmlFor="app-notes">Notes</FieldLabel>
              <textarea
                id="app-notes"
                value={notes}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                placeholder="Interview notes, recruiter name, next steps…"
                rows={4}
                maxLength={2000}
                className={`${inputClass} resize-none`}
              />
              <p className="text-[11px] text-text-muted mt-1 text-right font-mono">
                {notes.length}/2000
              </p>
            </div>

            {error && (
              <p className="text-xs text-danger" role="alert">
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 px-5 py-4 flex items-center justify-end gap-2 border-t border-border">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm text-text-muted hover:text-text transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={saving || !title.trim() || !company.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-bg text-sm font-semibold hover:brightness-110 active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
            >
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── ActionMenu — fixed-position popover to escape overflow:hidden ───────────
//
// On open, getBoundingClientRect() on the trigger button gives viewport
// coordinates. The popover is rendered with position:fixed so it sits above
// the table's overflow:hidden container without clipping.

interface PopoverPos {
  top: number
  right: number
}

interface ActionMenuProps {
  onDetails: () => void
  onDelete: () => void
}

function ActionMenu({ onDetails, onDelete }: ActionMenuProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<PopoverPos | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent): void {
      if (
        popRef.current &&
        !popRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on scroll (repositioning on scroll is not worth the complexity at MVP)
  useEffect(() => {
    if (!open) return
    function handler() {
      setOpen(false)
    }
    window.addEventListener('scroll', handler, true)
    return () => window.removeEventListener('scroll', handler, true)
  }, [open])

  function handleOpen(e: React.MouseEvent): void {
    e.stopPropagation()
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    setPos({
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    })
    setOpen((v) => !v)
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors cursor-pointer"
        aria-label="Row actions"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <IconEllipsis />
      </button>

      {open && pos && (
        <div
          ref={popRef}
          className="fixed z-30 w-36 rounded-xl overflow-hidden shadow-xl bg-surface border border-border"
          style={{ top: pos.top, right: pos.right }}
          role="menu"
        >
          <button
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation()
              setOpen(false)
              onDetails()
            }}
            className="w-full text-left px-4 py-2.5 text-sm text-text hover:bg-surface-2 transition-colors cursor-pointer"
          >
            Details
          </button>
          <div className="border-t border-border" />
          <button
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation()
              setOpen(false)
              onDelete()
            }}
            className="w-full text-left px-4 py-2.5 text-sm text-danger hover:bg-surface-2 transition-colors cursor-pointer"
          >
            Delete
          </button>
        </div>
      )}
    </>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function ApplicationsView(): JSX.Element {
  const { user } = useAuth()
  const [apps, setApps] = useState<AppRow[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<{ open: boolean; row: AppRow | null }>({
    open: false,
    row: null,
  })
  // deleteTarget: set when the user clicks Delete in the action menu
  const [deleteTarget, setDeleteTarget] = useState<AppRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ── Fetch ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user?.id) return
    void supabase
      .from('careerclaw_job_tracking')
      .select('id, job_id, title, company, status, url, notes, created_at, updated_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          setLoadState('error')
          return
        }
        setApps((data ?? []) as AppRow[])
        setLoadState('loaded')
      })
  }, [user?.id])

  // ── Client-side search ───────────────────────────────────────────────────

  const filtered = apps.filter((app) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      app.title.toLowerCase().includes(q) ||
      app.company.toLowerCase().includes(q) ||
      app.status.toLowerCase().includes(q) ||
      new Date(app.created_at).toLocaleDateString().toLowerCase().includes(q)
    )
  })

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleModalSaved = useCallback((row: AppRow): void => {
    setApps((prev) => {
      const exists = prev.some((a) => a.id === row.id)
      return exists ? prev.map((a) => (a.id === row.id ? row : a)) : [row, ...prev]
    })
    setModal({ open: false, row: null })
  }, [])

  async function handleConfirmDelete(): Promise<void> {
    if (!deleteTarget) return
    setDeleting(true)
    const { error } = await supabase
      .from('careerclaw_job_tracking')
      .delete()
      .eq('id', deleteTarget.id)
    setDeleting(false)
    if (!error) setApps((prev) => prev.filter((a) => a.id !== deleteTarget.id))
    setDeleteTarget(null)
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Applications</h1>
          <p className="text-sm text-text-muted mt-1">
            Track every role you've saved, applied to, or are interviewing for.
          </p>
        </div>

        {/* Add button */}
        <div className="flex items-center justify-end">
          <button
            onClick={() => setModal({ open: true, row: null })}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-bg text-sm font-semibold hover:brightness-110 active:scale-95 transition-all cursor-pointer"
          >
            <IconPlus />
            Add application
          </button>
        </div>

        {/* Search */}
        <input
          type="search"
          value={search}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          placeholder="Search by title, company, status, or date…"
          className="w-full px-4 py-2 rounded-xl text-sm bg-bg border border-border text-text placeholder:text-text-muted focus:outline-none focus:border-accent-border transition-colors"
        />

        {/* Loading */}
        {loadState === 'loading' && (
          <div className="flex justify-center py-12">
            <span
              className="w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin"
              aria-label="Loading…"
            />
          </div>
        )}

        {/* Error */}
        {loadState === 'error' && (
          <p className="text-sm text-danger py-8 text-center">
            Could not load applications. Please refresh.
          </p>
        )}

        {/* Empty state */}
        {loadState === 'loaded' && apps.length === 0 && (
          <div className="text-center py-16 space-y-2">
            <p className="text-sm text-text-muted">No applications tracked yet.</p>
            <p className="text-xs text-text-dim">
              Run a job briefing and save roles you're interested in, or add one manually.
            </p>
          </div>
        )}

        {/* No search results */}
        {loadState === 'loaded' && apps.length > 0 && filtered.length === 0 && (
          <p className="text-sm text-text-muted py-8 text-center">
            No applications match "{search}".
          </p>
        )}

        {/* Table — no overflow-hidden so the fixed popover is never clipped */}
        {loadState === 'loaded' && filtered.length > 0 && (
          <div className="rounded-2xl border border-border" style={{ overflow: 'visible' }}>
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  <th
                    className="px-4 py-3 text-left text-xs font-mono font-semibold text-text-muted uppercase tracking-wider"
                    style={{ borderRadius: '16px 0 0 0' }}
                  >
                    Position
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-text-muted uppercase tracking-wider">
                    Company
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-text-muted uppercase tracking-wider hidden sm:table-cell">
                    Added
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-text-muted uppercase tracking-wider">
                    Status
                  </th>
                  <th
                    className="px-4 py-3 w-12"
                    aria-label="Actions"
                    style={{ borderRadius: '0 16px 0 0' }}
                  />
                </tr>
              </thead>
              <tbody>
                {filtered.map((app, i) => {
                  const isLast = i === filtered.length - 1
                  return (
                    <tr
                      key={app.id}
                      style={{
                        background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                        borderTop: '1px solid var(--border-subtle)',
                        opacity: deleting && deleteTarget?.id === app.id ? 0.4 : 1,
                      }}
                    >
                      <td
                        className="px-4 py-3 font-medium text-text max-w-[200px]"
                        style={isLast ? { borderRadius: '0 0 0 16px' } : undefined}
                      >
                        <span className="block truncate">{app.title}</span>
                      </td>
                      <td className="px-4 py-3 text-text-muted max-w-[160px]">
                        <span className="block truncate">{app.company}</span>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-text-dim hidden sm:table-cell whitespace-nowrap">
                        {new Date(app.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={app.status} />
                      </td>
                      <td
                        className="px-3 py-3"
                        style={isLast ? { borderRadius: '0 0 16px 0' } : undefined}
                      >
                        <ActionMenu
                          onDetails={() => setModal({ open: true, row: app })}
                          onDelete={() => setDeleteTarget(app)}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Row count */}
        {loadState === 'loaded' && apps.length > 0 && (
          <p className="text-xs text-text-dim font-mono text-right">
            {filtered.length} of {apps.length} application{apps.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Add / Edit modal */}
      {modal.open && user?.id && (
        <AppModal
          initial={modal.row}
          userId={user.id}
          onClose={() => setModal({ open: false, row: null })}
          onSaved={handleModalSaved}
        />
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          title={deleteTarget.title}
          company={deleteTarget.company}
          onConfirm={() => void handleConfirmDelete()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
