/**
 * JobsView.tsx — CareerClaw run history from careerclaw_runs.
 *
 * Reads the user's last 20 run records directly from Supabase
 * (anon key + RLS — users can only see their own rows).
 * Displays a table with run timestamp, job count, top score, and status.
 */

import type { JSX } from 'react'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

interface RunRow {
  id: string
  run_at: string
  job_count: number
  top_score: number | null
  status: string
  duration_ms: number | null
}

type LoadState = 'loading' | 'loaded' | 'error'

function StatusPill({ status }: { status: string }): JSX.Element {
  const colors: Record<string, string> = {
    success: 'var(--success)',
    no_matches: 'var(--warning)',
    error: 'var(--danger)',
  }
  const color = colors[status] ?? 'var(--text-muted)'
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold"
      style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}
    >
      {status.replace('_', ' ')}
    </span>
  )
}

export function JobsView(): JSX.Element {
  const { user } = useAuth()
  const [runs, setRuns] = useState<RunRow[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')

  useEffect(() => {
    if (!user?.id) return

    void supabase
      .from('careerclaw_runs')
      .select('id, run_at, job_count, top_score, status, duration_ms')
      .eq('user_id', user.id)
      .order('run_at', { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (error) {
          setLoadState('error')
          return
        }
        setRuns((data ?? []) as RunRow[])
        setLoadState('loaded')
      })
  }, [user?.id])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h2 className="text-xl font-display font-bold tracking-tight">Job Search History</h2>
          <p className="text-sm text-text-muted mt-1">
            Your last 20 CareerClaw runs — metadata only, no raw payloads stored.
          </p>
        </div>

        {loadState === 'loading' && (
          <div className="flex justify-center py-12">
            <span
              className="w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin"
              aria-label="Loading..."
            />
          </div>
        )}

        {loadState === 'error' && (
          <p className="text-sm text-danger py-8 text-center">
            Could not load run history. Please refresh.
          </p>
        )}

        {loadState === 'loaded' && runs.length === 0 && (
          <div className="text-center py-12 space-y-2">
            <p className="text-text-muted text-sm">No runs yet.</p>
            <p className="text-text-dim text-xs">
              Run a job briefing from the Chat tab to see results here.
            </p>
          </div>
        )}

        {loadState === 'loaded' && runs.length > 0 && (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ border: '1px solid var(--border)' }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-text-muted uppercase tracking-wider">
                    Run at
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-text-muted uppercase tracking-wider">
                    Jobs
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-text-muted uppercase tracking-wider">
                    Top score
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-text-muted uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-mono font-semibold text-text-muted uppercase tracking-wider hidden sm:table-cell">
                    Duration
                  </th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run, i) => (
                  <tr
                    key={run.id}
                    style={{
                      background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                      borderTop: '1px solid var(--border-subtle)',
                    }}
                  >
                    <td className="px-4 py-3 text-xs font-mono text-text-dim">
                      {new Date(run.run_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-text">{run.job_count}</td>
                    <td className="px-4 py-3 font-mono text-text">
                      {run.top_score != null
                        ? `${Math.round(run.top_score * 100)}%`
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={run.status} />
                    </td>
                    <td className="px-4 py-3 font-mono text-text-dim hidden sm:table-cell">
                      {run.duration_ms != null ? `${run.duration_ms} ms` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
