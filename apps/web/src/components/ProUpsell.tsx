/**
 * ProUpsell.tsx — inline upgrade prompt.
 *
 * Rendered inside the chat thread when the API returns a 429 or the
 * free tier limit is reached. Links to the Settings billing section.
 */

import type { JSX } from 'react'
import { useNavigate } from 'react-router-dom'

interface ProUpsellProps {
  reason?: string
}

export function ProUpsell({ reason }: ProUpsellProps): JSX.Element {
  const navigate = useNavigate()

  return (
    <div
      className="rounded-2xl p-5 space-y-3 mx-auto w-full max-w-md"
      style={{
        background: 'linear-gradient(135deg, var(--accent-2-dim), var(--accent-dim))',
        border: '1px solid var(--accent-border)',
      }}
      role="region"
      aria-label="Upgrade to Pro"
    >
      <div>
        <p className="font-display font-bold text-base">Upgrade to Pro · $9/mo</p>
        <p className="text-xs text-text-muted mt-1 leading-relaxed">
          {reason ?? 'You have reached the free tier limit for this session.'} Pro unlocks
          LLM-crafted outreach, cover letters, and resume gap analysis.
        </p>
      </div>
      <button
        onClick={() => navigate('/settings')}
        className="px-4 py-2 rounded-xl bg-accent text-bg text-sm font-bold hover:brightness-110 active:scale-95 transition-all"
      >
        Upgrade now
      </button>
    </div>
  )
}
