/**
 * HistoryView.tsx — cross-skill session history (MVP placeholder).
 *
 * Full session history browse is planned for Chat 7+.
 * This stub keeps the nav item functional and sets expectations.
 */

import type { JSX } from 'react'

export function HistoryView(): JSX.Element {
  return (
    <div className="flex-1 flex items-center justify-center px-6 py-12">
      <div className="text-center space-y-3 max-w-sm">
        <div
          className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mx-auto"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
          aria-hidden="true"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-text-muted">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <h2 className="font-display font-bold text-lg">Session History</h2>
        <p className="text-sm text-text-muted leading-relaxed">
          Full cross-session history browse is coming in the next release.
          Your conversation context is already being persisted — it will
          surface here soon.
        </p>
      </div>
    </div>
  )
}
