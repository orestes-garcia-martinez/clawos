/**
 * JobCard.tsx — renders a single job match result.
 *
 * Data comes from careerclaw_runs joined with any job metadata available
 * in the session context. The card is intentionally simple for MVP;
 * richer data will come when job tracking is wired in Chat 7+.
 */

import type { JSX } from 'react'

export interface JobMatch {
  title: string
  company: string
  score: number           // 0–1
  skills?: string[]       // matched skill keywords
  salary?: string         // formatted string if available
  outreachPreview?: string
  url?: string
}

interface JobCardProps {
  job: JobMatch
  isPro: boolean
}

function ScoreBadge({ score }: { score: number }): JSX.Element {
  const pct = Math.round(score * 100)
  const color =
    pct >= 80 ? 'var(--success)' : pct >= 60 ? 'var(--accent)' : 'var(--warning)'

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold shrink-0"
      style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}
      aria-label={`Match score: ${pct}%`}
    >
      {pct}%
    </div>
  )
}

export function JobCard({ job, isPro }: JobCardProps): JSX.Element {
  return (
    <article
      className="p-4 rounded-2xl space-y-3 transition-colors"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-sm text-text truncate">{job.title}</h3>
          <p className="text-xs text-text-muted mt-0.5">{job.company}</p>
        </div>
        <ScoreBadge score={job.score} />
      </div>

      {/* Skill chips */}
      {job.skills && job.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {job.skills.slice(0, 6).map((s) => (
            <span
              key={s}
              className="px-2 py-0.5 rounded-full text-[11px] font-mono"
              style={{
                background: 'var(--accent-dim)',
                color: 'var(--accent)',
                border: '1px solid var(--accent-border)',
              }}
            >
              {s}
            </span>
          ))}
          {job.skills.length > 6 && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono text-text-muted">
              +{job.skills.length - 6} more
            </span>
          )}
        </div>
      )}

      {/* Salary */}
      {job.salary && (
        <p className="text-xs font-mono text-text-dim">{job.salary}</p>
      )}

      {/* Outreach preview — Pro only */}
      {job.outreachPreview && isPro && (
        <div
          className="text-xs text-text-dim leading-relaxed p-3 rounded-xl"
          style={{ background: 'var(--surface-2)' }}
        >
          <p className="font-semibold text-text-muted mb-1 uppercase tracking-wider text-[10px] font-mono">
            Outreach draft
          </p>
          <p className="line-clamp-3">{job.outreachPreview}</p>
        </div>
      )}

      {!isPro && job.outreachPreview && (
        <div
          className="text-xs p-3 rounded-xl flex items-center justify-between gap-2"
          style={{
            background: 'var(--accent-2-dim)',
            border: '1px solid rgba(99,102,241,0.2)',
          }}
        >
          <span className="text-text-muted">Outreach draft available with Pro</span>
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-semibold font-mono"
            style={{ background: 'var(--accent-2-dim)', color: 'var(--accent-2)' }}
          >
            Pro
          </span>
        </div>
      )}

      {/* View job link */}
      {job.url && (
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-xs font-medium text-accent hover:underline"
        >
          View posting →
        </a>
      )}
    </article>
  )
}
