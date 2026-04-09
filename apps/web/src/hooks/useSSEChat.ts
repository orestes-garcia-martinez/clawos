/**
 * useSSEChat.ts — manages the SSE chat session for a single skill workspace.
 *
 * State:
 *   messages     — ordered list of thread entries
 *   isStreaming  — true while an SSE request is in flight
 *   sessionId    — persisted across sends within a workspace session
 *
 * Actions:
 *   send(text)   — add user message, open SSE stream
 *   abort()      — cancel the current stream
 *   reset()      — clear the thread (new conversation)
 */

import { useState, useRef, useCallback } from 'react'
import { chatSSE } from '../lib/api.ts'
import type { ChunkEvent } from '../lib/api.ts'

// ── Message types ──────────────────────────────────────────────────────────

export interface UserMessage {
  id: string
  role: 'user'
  content: string
  timestamp: string
}

export interface AssistantMessage {
  id: string
  role: 'assistant'
  content: string
  timestamp: string
  /** True while the message is still being streamed token-by-token. */
  streaming?: boolean
}

export interface ApiProgressEvent {
  type: 'progress'
  step: string
  message: string
}

export interface ProgressMessage {
  id: string
  role: 'progress'
  step: string
  content: string
}

export interface ErrorMessage {
  id: string
  role: 'error'
  code: string
  content: string
}

export type ThreadMessage = UserMessage | AssistantMessage | ProgressMessage | ErrorMessage

// ── Hook ──────────────────────────────────────────────────────────────────

interface UseSSEChatOptions {
  jwt: string
  userId: string
}

interface UseSSEChatReturn {
  messages: ThreadMessage[]
  isStreaming: boolean
  sessionId: string | undefined
  send: (text: string) => void
  abort: () => void
  reset: () => void
}

let msgCounter = 0
function nextId(): string {
  return `msg-${Date.now()}-${++msgCounter}`
}

export function useSSEChat({ jwt, userId }: UseSSEChatOptions): UseSSEChatReturn {
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [sessionId, setSessionId] = useState<string | undefined>(undefined)
  const abortRef = useRef<AbortController | null>(null)
  // Track the id of the current progress message so we can remove it on done
  const progressIdRef = useRef<string | null>(null)
  // Track the id of the streaming assistant message so onDone can replace it
  const streamingMsgIdRef = useRef<string | null>(null)

  const send = useCallback(
    (text: string) => {
      if (!text.trim() || isStreaming) return

      const userMsg: UserMessage = {
        id: nextId(),
        role: 'user',
        content: text.trim(),
        timestamp: new Date().toISOString(),
      }

      setMessages((prev) => [...prev, userMsg])
      setIsStreaming(true)

      abortRef.current = chatSSE(
        jwt,
        userId,
        { channel: 'web', message: text.trim(), sessionId },
        {
          onProgress: (event: ApiProgressEvent) => {
            setMessages((prev) => {
              // Replace existing progress message or append a new one
              if (progressIdRef.current) {
                return prev.map((m) =>
                  m.id === progressIdRef.current
                    ? ({ ...m, step: event.step, content: event.message } as ProgressMessage)
                    : m,
                )
              }
              const progressMsg: ProgressMessage = {
                id: nextId(),
                role: 'progress',
                step: event.step,
                content: event.message,
              }
              progressIdRef.current = progressMsg.id
              return [...prev, progressMsg]
            })
          },

          onChunk: (event: ChunkEvent) => {
            setMessages((prev) => {
              // Append to existing streaming message or create one (removing progress first)
              if (streamingMsgIdRef.current) {
                return prev.map((m) =>
                  m.id === streamingMsgIdRef.current && m.role === 'assistant'
                    ? ({ ...m, content: m.content + event.text } as AssistantMessage)
                    : m,
                )
              }
              const streamMsg: AssistantMessage = {
                id: nextId(),
                role: 'assistant',
                content: event.text,
                timestamp: new Date().toISOString(),
                streaming: true,
              }
              streamingMsgIdRef.current = streamMsg.id
              return [...prev.filter((m) => m.role !== 'progress'), streamMsg]
            })
          },

          onDone: (event) => {
            setSessionId(event.sessionId)
            setIsStreaming(false)
            progressIdRef.current = null
            const prevStreamingId = streamingMsgIdRef.current
            streamingMsgIdRef.current = null

            const normalized = event.message.trim()
            if (!normalized) {
              const errMsg: ErrorMessage = {
                id: nextId(),
                role: 'error',
                code: 'EMPTY_RESPONSE',
                content: 'The assistant returned an empty response. Please try again.',
              }
              setMessages((prev) => {
                return [
                  ...prev.filter((m) => m.role !== 'progress' && m.id !== prevStreamingId),
                  errMsg,
                ]
              })
              return
            }

            const assistantMsg: AssistantMessage = {
              id: nextId(),
              role: 'assistant',
              content: normalized,
              timestamp: new Date().toISOString(),
            }

            setMessages((prev) => {
              return [
                ...prev.filter((m) => m.role !== 'progress' && m.id !== prevStreamingId),
                assistantMsg,
              ]
            })
          },

          onError: (event) => {
            setIsStreaming(false)
            progressIdRef.current = null
            const prevStreamingId = streamingMsgIdRef.current
            streamingMsgIdRef.current = null
            const errMsg: ErrorMessage = {
              id: nextId(),
              role: 'error',
              code: event.code,
              content: event.message,
            }
            setMessages((prev) => {
              return [
                ...prev.filter((m) => m.role !== 'progress' && m.id !== prevStreamingId),
                errMsg,
              ]
            })
          },

          onNetworkError: () => {
            setIsStreaming(false)
            progressIdRef.current = null
            const prevStreamingId = streamingMsgIdRef.current
            streamingMsgIdRef.current = null
            const errMsg: ErrorMessage = {
              id: nextId(),
              role: 'error',
              code: 'NETWORK_ERROR',
              content: 'Connection lost. Check your network and try again.',
            }
            setMessages((prev) => {
              return [
                ...prev.filter((m) => m.role !== 'progress' && m.id !== prevStreamingId),
                errMsg,
              ]
            })
          },
        },
      )
    },
    [jwt, userId, isStreaming, sessionId],
  )

  const abort = useCallback(() => {
    abortRef.current?.abort()
    setIsStreaming(false)
    progressIdRef.current = null
    const prevStreamingId = streamingMsgIdRef.current
    streamingMsgIdRef.current = null
    setMessages((prev) => prev.filter((m) => m.role !== 'progress' && m.id !== prevStreamingId))
  }, [])

  const reset = useCallback(() => {
    abort()
    setMessages([])
    setSessionId(undefined)
  }, [abort])

  return { messages, isStreaming, sessionId, send, abort, reset }
}
