/**
 * ChatSessionContext.tsx — platform-wide chat session state.
 *
 * Provides:
 *   messages     — ordered thread entries for the active skill
 *   isStreaming  — true while an SSE request is in flight
 *   sessionId    — persisted across sends within a workspace session
 *   send(text)   — add user message, open SSE stream
 *   abort()      — cancel the current stream
 *   reset()      — clear the thread (new conversation)
 *
 * Mounted once above AppShell — survives navigation between workspace tabs.
 * One thread is held per skillKey so switching CareerClaw → ScrapeClaw →
 * back to CareerClaw restores the CareerClaw thread exactly as left.
 *
 * ChatView reads from this context instead of owning its own useSSEChat
 * instance, which was the root cause of BUG-005 (history lost on tab switch).
 */

import type { JSX } from 'react'
import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react'
import { chatSSE } from '../lib/api.ts'
import { supabase } from '../lib/supabase.ts'
import type {
  ThreadMessage,
  UserMessage,
  AssistantMessage,
  ProgressMessage,
  ErrorMessage,
  ApiProgressEvent,
} from '../hooks/useSSEChat.ts'
import type { SkillKey } from '../skills'

// ── Thread state per skill ─────────────────────────────────────────────────

interface SkillThread {
  messages: ThreadMessage[]
  sessionId: string | undefined
}

function emptyThread(): SkillThread {
  return { messages: [], sessionId: undefined }
}

// ── Context shape ──────────────────────────────────────────────────────────

interface ChatSessionContextValue {
  messages: ThreadMessage[]
  isStreaming: boolean
  sessionId: string | undefined
  send: (text: string, skillKey: SkillKey) => void
  abort: () => void
  reset: (skillKey: SkillKey) => void
}

const ChatSessionContext = createContext<ChatSessionContextValue | null>(null)

// ── ID generator ───────────────────────────────────────────────────────────

let msgCounter = 0
function nextId(): string {
  return `msg-${Date.now()}-${++msgCounter}`
}

// ── Provider ───────────────────────────────────────────────────────────────

interface ChatSessionProviderProps {
  jwt: string
  userId: string
  children: React.ReactNode
}

export function ChatSessionProvider({
  jwt,
  userId,
  children,
}: ChatSessionProviderProps): JSX.Element {
  // Map of skillKey → thread state
  const [threads, setThreads] = useState<Partial<Record<SkillKey, SkillThread>>>({})
  const [isStreaming, setIsStreaming] = useState(false)
  // Track which skill is currently streaming so abort/reset targets the right thread
  const activeSkillRef = useRef<SkillKey | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const progressIdRef = useRef<string | null>(null)

  // Helper: update a specific skill's thread
  const updateThread = useCallback(
    (skillKey: SkillKey, updater: (prev: SkillThread) => SkillThread) => {
      setThreads((prev) => ({
        ...prev,
        [skillKey]: updater(prev[skillKey] ?? emptyThread()),
      }))
    },
    [],
  )

  // ── Session re-hydration on mount ─────────────────────────────────────────
  // On first mount (or when userId becomes available), fetch the existing web
  // session row from Supabase and populate the careerclaw thread. This restores
  // the UI after a hard reload without waiting for the user to send a message.
  // Guard: only runs once per provider lifetime via hydratedRef.
  const hydratedRef = useRef(false)

  useEffect(() => {
    if (!userId || hydratedRef.current) return
    hydratedRef.current = true

    void (async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('id, messages')
        .eq('user_id', userId)
        .eq('channel', 'web')
        .is('deleted_at', null)
        .maybeSingle()

      if (error || !data) return

      const raw = Array.isArray(data.messages) ? data.messages : []

      // Filter to persisted roles only — progress and error are ephemeral
      const messages = raw
        .filter(
          (m): m is { role: 'user' | 'assistant'; content: string; timestamp: string } =>
            typeof m === 'object' &&
            m !== null &&
            !Array.isArray(m) &&
            ((m as Record<string, unknown>)['role'] === 'user' ||
              (m as Record<string, unknown>)['role'] === 'assistant') &&
            typeof (m as Record<string, unknown>)['content'] === 'string',
        )
        .map((m) => ({
          id: nextId(),
          role: m.role,
          content: m.content,
          timestamp: m.timestamp ?? new Date().toISOString(),
        }))

      if (messages.length === 0) return

      updateThread('careerclaw', () => ({
        messages,
        sessionId: data.id,
      }))
    })()
  }, [userId, updateThread])

  const send = useCallback(
    (text: string, skillKey: SkillKey) => {
      if (!text.trim() || isStreaming) return

      activeSkillRef.current = skillKey

      const userMsg: UserMessage = {
        id: nextId(),
        role: 'user',
        content: text.trim(),
        timestamp: new Date().toISOString(),
      }

      const currentSessionId = threads[skillKey]?.sessionId

      updateThread(skillKey, (prev) => ({
        ...prev,
        messages: [...prev.messages, userMsg],
      }))

      setIsStreaming(true)

      abortRef.current = chatSSE(
        jwt,
        userId,
        { channel: 'web', message: text.trim(), sessionId: currentSessionId },
        {
          onProgress: (event: ApiProgressEvent) => {
            updateThread(skillKey, (prev) => {
              if (progressIdRef.current) {
                return {
                  ...prev,
                  messages: prev.messages.map((m) =>
                    m.id === progressIdRef.current
                      ? ({ ...m, step: event.step, content: event.message } as ProgressMessage)
                      : m,
                  ),
                }
              }
              const progressMsg: ProgressMessage = {
                id: nextId(),
                role: 'progress',
                step: event.step,
                content: event.message,
              }
              progressIdRef.current = progressMsg.id
              return { ...prev, messages: [...prev.messages, progressMsg] }
            })
          },

          onDone: (event) => {
            setIsStreaming(false)
            progressIdRef.current = null
            const assistantMsg: AssistantMessage = {
              id: nextId(),
              role: 'assistant',
              content: event.message,
              timestamp: new Date().toISOString(),
            }
            updateThread(skillKey, (prev) => ({
              sessionId: event.sessionId,
              messages: [...prev.messages.filter((m) => m.role !== 'progress'), assistantMsg],
            }))
          },

          onError: (event) => {
            setIsStreaming(false)
            progressIdRef.current = null
            const errMsg: ErrorMessage = {
              id: nextId(),
              role: 'error',
              code: event.code,
              content: event.message,
            }
            updateThread(skillKey, (prev) => ({
              ...prev,
              messages: [...prev.messages.filter((m) => m.role !== 'progress'), errMsg],
            }))
          },

          onNetworkError: () => {
            setIsStreaming(false)
            progressIdRef.current = null
            const errMsg: ErrorMessage = {
              id: nextId(),
              role: 'error',
              code: 'NETWORK_ERROR',
              content: 'Connection lost. Check your network and try again.',
            }
            updateThread(skillKey, (prev) => ({
              ...prev,
              messages: [...prev.messages.filter((m) => m.role !== 'progress'), errMsg],
            }))
          },
        },
      )
    },
    [jwt, userId, isStreaming, threads, updateThread],
  )

  const abort = useCallback(() => {
    abortRef.current?.abort()
    setIsStreaming(false)
    progressIdRef.current = null
    const skill = activeSkillRef.current
    if (skill) {
      updateThread(skill, (prev) => ({
        ...prev,
        messages: prev.messages.filter((m) => m.role !== 'progress'),
      }))
    }
  }, [updateThread])

  const reset = useCallback(
    (skillKey: SkillKey) => {
      abort()
      setThreads((prev) => ({ ...prev, [skillKey]: emptyThread() }))
    },
    [abort],
  )

  // Expose the active skill's thread at the top level for convenience
  // ChatView passes its skillKey to send/reset; messages/sessionId are
  // derived from the active skill at render time via useChatSession(skillKey).
  const value: ChatSessionContextValue = {
    messages: [], // placeholder — consumers use useChatSession(skillKey)
    isStreaming,
    sessionId: undefined,
    send,
    abort,
    reset,
  }

  return (
    <ChatSessionContext.Provider value={value}>
      {/* Expose threads map via a separate ref-like mechanism via child hook */}
      <ThreadsContext.Provider value={threads}>{children}</ThreadsContext.Provider>
    </ChatSessionContext.Provider>
  )
}

// ── Internal threads context ───────────────────────────────────────────────
// Separated so updates to one skill's thread don't re-render siblings.

const ThreadsContext = createContext<Partial<Record<SkillKey, SkillThread>>>({})

// ── Consumer hook ──────────────────────────────────────────────────────────

/**
 * useChatSession(skillKey) — used by ChatView to read and write the thread
 * for a specific skill. Returns messages, sessionId, isStreaming, send,
 * abort, reset — same shape as the old useSSEChat return value.
 */
export function useChatSession(skillKey: SkillKey) {
  const ctx = useContext(ChatSessionContext)
  const threads = useContext(ThreadsContext)

  if (!ctx) {
    throw new Error('useChatSession must be used inside ChatSessionProvider')
  }

  const thread = threads[skillKey] ?? emptyThread()

  return {
    messages: thread.messages,
    isStreaming: ctx.isStreaming,
    sessionId: thread.sessionId,
    send: (text: string) => ctx.send(text, skillKey),
    abort: ctx.abort,
    reset: () => ctx.reset(skillKey),
  }
}
