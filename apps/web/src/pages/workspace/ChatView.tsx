/**
 * ChatView.tsx — skill chat workspace.
 *
 * Renders:
 *   - Hero + quick actions when the thread is empty
 *   - Chat thread with user / assistant / progress / error messages
 *   - Composer with resume upload (PDF dropzone) and send button
 *   - Inline ProUpsell when a 429 error is detected
 *   - SSE streaming via useSSEChat
 *
 * The active skill is derived from the URL path segment, not hardcoded.
 * This component is currently only registered under /careerclaw/* routes;
 * the pattern is in place for when additional skills have their own views.
 */

import type { JSX } from 'react'
import { useRef, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useSSEChat } from '../../hooks/useSSEChat'
import { MessageBubble } from '../../components/MessageBubble'
import { ProgressEvent } from '../../components/ProgressEvent'
import { ResumeDropzone } from '../../components/ResumeDropzone'
import { ProUpsell } from '../../components/ProUpsell'

import { useState } from 'react'
import { SKILL_MAP } from '../../skills'
import type { SkillKey } from '../../skills'
import { ClawLogo, IconSend, IconX } from '../../shell/icons.tsx'

// ── Empty state hero ───────────────────────────────────────────────────────

interface HeroProps {
  skill: (typeof SKILL_MAP)[SkillKey]
  onSuggestion: (text: string) => void
  isPro: boolean
}

function Hero({ skill, onSuggestion, isPro }: HeroProps): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 sm:px-8 py-12">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center space-y-4">
          <div
            className="inline-flex items-center justify-center w-20 h-20 rounded-3xl text-accent mb-1"
            style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-border)' }}
            aria-hidden="true"
          >
            <ClawLogo className="w-11 h-11" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-display font-bold tracking-tight leading-none">
            {skill.heroTitle}
          </h1>
          <p className="text-text-muted leading-relaxed max-w-md mx-auto text-sm sm:text-base">
            {skill.heroBody}
          </p>
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-2 border border-border text-xs font-mono text-text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden="true" />
            {skill.trustSignal}
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid sm:grid-cols-2 gap-2.5" role="list" aria-label="Suggested actions">
          {skill.quickActions.map((action) => {
            const locked = action.pro && !isPro
            return (
              <button
                key={action.label}
                role="listitem"
                onClick={() => {
                  if (!locked) onSuggestion(action.label)
                }}
                disabled={locked}
                aria-disabled={locked}
                className={[
                  'group p-4 rounded-xl text-left transition-all duration-150 bg-surface border',
                  locked
                    ? 'border-border opacity-60 cursor-default'
                    : 'border-border hover:border-accent-border hover:bg-surface-2 cursor-pointer',
                ].join(' ')}
              >
                <div
                  className={[
                    'text-sm font-medium mb-0.5 transition-colors',
                    locked ? 'text-text-muted' : 'text-text group-hover:text-accent',
                  ].join(' ')}
                >
                  {action.label}
                </div>
                <div className="text-xs text-text-muted flex items-center gap-1.5">
                  {action.description}
                  {action.pro && (
                    <span
                      className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                      style={{ background: 'var(--accent-2-dim)', color: 'var(--accent-2)' }}
                    >
                      Pro
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Channel status */}
        <div className="flex items-center justify-center gap-6 text-[11px] font-mono text-text-muted">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-success" aria-hidden="true" />
            Web · active
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden="true" />
            Telegram · active
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-border" aria-hidden="true" />
            WhatsApp · Phase 2
          </span>
        </div>
      </div>
    </div>
  )
}

// ── ChatView ───────────────────────────────────────────────────────────────

export function ChatView(): JSX.Element {
  const { user, session, tier } = useAuth()
  const { pathname } = useLocation()
  const isPro = tier === 'pro'

  // Derive skill from route — fallback to careerclaw as a safe default.
  const skillKey = (pathname.split('/')[1] ?? 'careerclaw') as SkillKey
  const skill = SKILL_MAP[skillKey] ?? SKILL_MAP['careerclaw']

  const jwt = session?.access_token ?? ''
  const userId = user?.id ?? ''

  const { messages, isStreaming, send, abort, reset } = useSSEChat({ jwt, userId })
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const threadRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight
    }
  }, [messages])

  const handleSubmit = useCallback(() => {
    const text = input.trim()
    if (!text || isStreaming) return
    send(text)
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [input, isStreaming, send])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  const hasRateLimitError = messages.some(
    (m) => m.role === 'error' && (m.code === 'HTTP_429' || m.code === 'RATE_LIMITED'),
  )

  const isEmpty = messages.length === 0

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Thread */}
      <div
        ref={threadRef}
        className="flex-1 overflow-y-auto"
        role="log"
        aria-label="Chat thread"
        aria-live="polite"
      >
        {isEmpty ? (
          <Hero
            skill={skill}
            onSuggestion={(text) => {
              setInput(text)
              textareaRef.current?.focus()
            }}
            isPro={isPro}
          />
        ) : (
          <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
            {messages.map((msg) => {
              if (msg.role === 'progress') {
                return <ProgressEvent key={msg.id} message={msg} />
              }
              return <MessageBubble key={msg.id} message={msg} />
            })}

            {/* Inline Pro upsell after a rate limit error */}
            {hasRateLimitError && !isPro && (
              <ProUpsell reason="You have reached the free tier daily limit." />
            )}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-border bg-surface px-4 py-3">
        <div className="max-w-3xl mx-auto">
          {/* Reset thread link */}
          {!isEmpty && (
            <div className="flex justify-end mb-2">
              <button
                onClick={reset}
                className="text-[11px] font-mono text-text-muted hover:text-text transition-colors flex items-center gap-1"
                aria-label="Start new conversation"
              >
                <IconX className="w-3 h-3" />
                New conversation
              </button>
            </div>
          )}

          <div
            className="flex items-end gap-2 p-2 rounded-2xl transition-all duration-150"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
          >
            {/* Resume upload */}
            <ResumeDropzone jwt={jwt} userId={userId} />

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder={isStreaming ? `${skill.name} is thinking…` : skill.composerPlaceholder}
              rows={1}
              disabled={isStreaming}
              className="flex-1 bg-transparent text-sm text-text placeholder:text-text-muted resize-none focus:outline-none py-2 leading-relaxed disabled:opacity-50"
              style={{ minHeight: '36px', maxHeight: '160px' }}
              aria-label="Message input"
            />

            {/* Abort / send */}
            {isStreaming ? (
              <button
                onClick={abort}
                className="p-2.5 rounded-xl bg-surface-2 text-text-muted hover:text-text transition-all shrink-0 mb-0.5"
                aria-label="Stop generation"
              >
                <IconX />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!input.trim()}
                className="p-2.5 rounded-xl bg-accent text-bg disabled:opacity-25 disabled:cursor-not-allowed hover:brightness-110 active:scale-95 transition-all shrink-0 mb-0.5"
                aria-label="Send message"
              >
                <IconSend />
              </button>
            )}
          </div>

          <p className="text-center text-[10px] font-mono text-text-muted/40 mt-2 select-none">
            ClawOS · {isPro ? 'Pro' : 'Free'} · {skill.name} {skill.version ?? ''} · SSE transport
          </p>
        </div>
      </div>
    </div>
  )
}
