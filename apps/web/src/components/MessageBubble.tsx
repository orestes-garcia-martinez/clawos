/**
 * MessageBubble.tsx — renders a single thread message.
 *
 * User messages: right-aligned, accent background.
 * Assistant messages: left-aligned, surface background, basic text formatting.
 * Error messages: full-width warning strip.
 */

import type { JSX } from 'react'
import type { ThreadMessage } from '../hooks/useSSEChat.ts'
import { IconWarning } from '../shell/icons.tsx'

// Very minimal inline markdown: **bold**, `code`, https:// URLs → <a>, newlines → <br>
function renderText(text: string): JSX.Element {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s]+|\n)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i}>{part.slice(2, -2)}</strong>
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code
              key={i}
              className="font-mono text-xs px-1 py-0.5 rounded bg-surface-3 text-accent"
            >
              {part.slice(1, -1)}
            </code>
          )
        }
        if (part.startsWith('http://') || part.startsWith('https://')) {
          // Strip trailing punctuation that prose may append after a URL.
          // .,;:!? are never legitimate URL endings.
          // ) is only stripped when unmatched — preserves wiki-style paths like /wiki/Foo_(bar).
          // The stripped suffix is rendered as plain text so no characters are lost.
          let href = part.replace(/[.,;:!?]+$/, '')
          let suffix = part.slice(href.length)
          while (
            href.endsWith(')') &&
            (href.match(/\)/g) ?? []).length > (href.match(/\(/g) ?? []).length
          ) {
            suffix = ')' + suffix
            href = href.slice(0, -1)
          }
          return (
            <span key={i}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline underline-offset-2 break-all hover:opacity-75"
              >
                {href}
              </a>
              {suffix}
            </span>
          )
        }
        if (part === '\n') return <br key={i} />
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

interface MessageBubbleProps {
  message: ThreadMessage
}

export function MessageBubble({ message }: MessageBubbleProps): JSX.Element {
  if (message.role === 'error') {
    return (
      <div
        className="flex items-start gap-2.5 px-4 py-3 rounded-xl mx-auto w-full max-w-2xl"
        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
        role="alert"
      >
        <span className="text-danger mt-0.5 shrink-0">
          <IconWarning />
        </span>
        <div>
          <p className="text-sm text-danger font-medium">{message.content}</p>
          {message.code === 'HTTP_429' || message.code === 'RATE_LIMITED' ? (
            <p className="text-xs text-text-muted mt-1">Upgrade to Pro for higher limits.</p>
          ) : null}
        </div>
      </div>
    )
  }

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-tr-md text-sm leading-relaxed"
          style={{ background: 'var(--accent)', color: 'var(--bg)' }}
        >
          {message.content}
        </div>
      </div>
    )
  }

  // Assistant message
  return (
    <div className="flex justify-start">
      <div
        className="max-w-[88%] px-4 py-3 rounded-2xl rounded-tl-md text-sm leading-relaxed"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="text-text">{renderText(message.content)}</div>
      </div>
    </div>
  )
}
