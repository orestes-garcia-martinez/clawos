/**
 * SessionsPage.tsx — connected channels view.
 *
 * Reads the sessions table (one row per channel per user).
 * Displays: channel name, message count, last_active relative time.
 * "Clear conversation" wipes messages = [] for that channel after confirmation.
 *
 * Data policy: message *count* is shown, never message *content*.
 * This is consistent with the audit-log rule (metadata only).
 *
 * The sessions table has at most one active row per channel (unique constraint
 * on user_id, channel). Soft-deleted rows (deleted_at != null) are excluded.
 */

import type { JSX } from 'react'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// ── Types ──────────────────────────────────────────────────────────────────

interface SessionRow {
  id: string
  channel: 'web' | 'telegram' | 'whatsapp'
  messageCount: number
  lastActive: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

const CHANNEL_LABELS: Record<string, string> = {
  web: 'Web',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
}

const CHANNEL_STATUS: Record<string, { label: string; color: string }> = {
  web: { label: 'Active', color: 'var(--success)' },
  telegram: { label: 'Active', color: 'var(--success)' },
  whatsapp: { label: 'Phase 2', color: 'var(--text-muted)' },
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// ── Confirmation modal ─────────────────────────────────────────────────────

interface ClearConfirmModalProps {
  channelLabel: string
  onConfirm: () => void
  onCancel: () => void
}

function ClearConfirmModal({
  channelLabel,
  onConfirm,
  onCancel,
}: ClearConfirmModalProps): JSX.Element {
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" aria-hidden="true" />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="clear-session-title"
        onClick={onCancel}
      >
        <div
          className="w-full max-w-sm rounded-2xl border border-border bg-surface shadow-xl p-6 space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="space-y-1.5">
            <h2
              id="clear-session-title"
              className="font-display font-bold text-base text-text leading-tight"
            >
              Clear {channelLabel} conversation?
            </h2>
            <p className="text-sm text-text-muted leading-relaxed">
              This will erase the message history for this channel. Your skills and profile data
              will remain intact.
            </p>
          </div>
          <div className="flex gap-2.5 pt-1">
            <button
              onClick={onCancel}
              className="flex-1 py-2 rounded-xl border border-border text-sm font-medium text-text-muted hover:text-text hover:bg-surface-2 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-2 rounded-xl bg-danger text-bg text-sm font-semibold hover:brightness-110 active:scale-95 transition-all"
            >
              Clear
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── SessionsPage ───────────────────────────────────────────────────────────

export function SessionsPage(): JSX.Element {
  const { user } = useAuth()
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [clearingId, setClearingId] = useState<string | null>(null)
  const [confirmSession, setConfirmSession] = useState<SessionRow | null>(null)

  const load = useCallback(() => {
    if (!user) return
    setLoading(true)
    void supabase
      .from('sessions')
      .select('id, channel, messages, last_active')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('last_active', { ascending: false })
      .then(({ data }) => {
        setSessions(
          (data ?? []).map((row) => ({
            id: row.id as string,
            channel: row.channel as SessionRow['channel'],
            messageCount: Array.isArray(row.messages) ? (row.messages as unknown[]).length : 0,
            lastActive: row.last_active as string,
          })),
        )
        setLoading(false)
      })
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  async function handleClear(sessionId: string): Promise<void> {
    setClearingId(sessionId)
    const { error } = await supabase.from('sessions').update({ messages: [] }).eq('id', sessionId)

    if (error) {
      console.error('[sessions] Failed to clear conversation:', error.message)
      // TODO: surface a toast / inline error so the user knows it failed
    } else {
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, messageCount: 0 } : s)))
    }
    setClearingId(null)
  }

  if (!user) return <></>

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Sessions</h1>
          <p className="text-sm text-text-muted mt-1">
            Connected channels and their conversation history.
          </p>
        </div>

        {/* Confirmation modal */}
        {confirmSession && (
          <ClearConfirmModal
            channelLabel={CHANNEL_LABELS[confirmSession.channel] ?? confirmSession.channel}
            onConfirm={() => {
              const id = confirmSession.id
              setConfirmSession(null)
              void handleClear(id)
            }}
            onCancel={() => setConfirmSession(null)}
          />
        )}

        {/* Session cards */}
        {loading ? (
          <div className="space-y-3">
            {['web', 'telegram'].map((ch) => (
              <div
                key={ch}
                className="rounded-2xl p-5 animate-pulse"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <div className="h-4 w-24 rounded bg-surface-3" />
                <div className="h-3 w-40 rounded bg-surface-3 mt-2" />
              </div>
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <p className="text-sm font-medium text-text">No active sessions</p>
            <p className="text-xs text-text-muted mt-1">
              Start a conversation in any channel and it will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => {
              const channelStatus = CHANNEL_STATUS[session.channel]
              const isClearing = clearingId === session.id

              return (
                <div
                  key={session.id}
                  className="rounded-2xl p-5"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      {/* Channel name + status */}
                      <div className="flex items-center gap-2">
                        <span className="font-display font-semibold text-sm text-text">
                          {CHANNEL_LABELS[session.channel] ?? session.channel}
                        </span>
                        {channelStatus && (
                          <span
                            className="flex items-center gap-1 text-[10px] font-mono"
                            style={{ color: channelStatus.color }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ background: channelStatus.color }}
                              aria-hidden="true"
                            />
                            {channelStatus.label}
                          </span>
                        )}
                      </div>

                      {/* Metadata — never message content */}
                      <p className="text-xs text-text-muted font-mono">
                        {session.messageCount} message{session.messageCount !== 1 ? 's' : ''} · last
                        active {relativeTime(session.lastActive)}
                      </p>
                    </div>

                    {/* Clear button — only when there are messages */}
                    {session.messageCount > 0 && (
                      <button
                        onClick={() => setConfirmSession(session)}
                        disabled={isClearing}
                        className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          background: 'rgba(239,68,68,0.08)',
                          color: 'var(--danger)',
                          border: '1px solid rgba(239,68,68,0.2)',
                        }}
                      >
                        {isClearing ? 'Clearing…' : 'Clear'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Platform note */}
        <div className="flex justify-center pt-2">
          <p className="text-[11px] font-mono text-text-muted">
            Message content is never displayed here · metadata only
          </p>
        </div>
      </div>
    </div>
  )
}
