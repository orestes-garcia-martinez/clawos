/**
 * ProgressEvent.tsx — animated step indicator shown during SSE streaming.
 *
 * Displays the current step label with a pulsing accent dot.
 * Replaces itself in-place as steps update (parent swaps the message).
 */

import type { JSX } from 'react'
import type { ProgressMessage } from './useSSEChat.ts'

interface ProgressEventProps {
  message: ProgressMessage
}

export function ProgressEvent({ message }: ProgressEventProps): JSX.Element {
  return (
    <div className="flex justify-start">
      <div
        className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl rounded-tl-md text-sm"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
        aria-live="polite"
        aria-label={`Status: ${message.content}`}
      >
        {/* Pulsing dot */}
        <span
          className="w-2 h-2 rounded-full bg-accent shrink-0"
          style={{ animation: 'pulse 1.2s cubic-bezier(0.4,0,0.6,1) infinite' }}
          aria-hidden="true"
        />
        <span className="text-text-dim font-mono text-xs">{message.content}</span>
      </div>
    </div>
  )
}
