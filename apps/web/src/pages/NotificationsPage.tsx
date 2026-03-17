/**
 * NotificationsPage.tsx — platform notifications.
 *
 * Phase 3 stub: renders an empty state.
 * No backend required. No polling. No fake data.
 *
 * Future: platform-level events (billing renewals, skill updates,
 * Telegram link confirmations) will push rows to a notifications table
 * and surface here.
 */

import type { JSX } from 'react'
import { IconBell } from '../shell/icons.tsx'

export function NotificationsPage(): JSX.Element {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Notifications</h1>
          <p className="text-sm text-text-muted mt-1">Platform events and updates.</p>
        </div>

        {/* Empty state */}
        <div
          className="rounded-2xl p-12 flex flex-col items-center text-center"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <div
            className="flex items-center justify-center w-12 h-12 rounded-2xl mb-4"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            aria-hidden="true"
          >
            <IconBell className="w-5 h-5 text-text-muted" />
          </div>
          <p className="text-sm font-medium text-text">No notifications yet</p>
          <p className="text-xs text-text-muted mt-1.5 leading-relaxed max-w-xs">
            Platform events — billing, skill updates, channel connections — will appear here.
          </p>
        </div>
      </div>
    </div>
  )
}
