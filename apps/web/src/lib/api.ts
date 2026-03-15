/**
 * api.ts — ClawOS Agent API client for the web frontend.
 *
 * Three exports:
 *   chatSSE()        — POST /chat, reads the SSE stream, fires callbacks.
 *   extractResume()  — POST /resume/extract, multipart PDF upload.
 *   createLinkToken() — POST /link-token, returns token for Telegram linking.
 *
 * URL strategy:
 *   Dev  → calls go to /api/* which Vite proxies to VITE_API_URL (raw IP fine).
 *   Prod → calls go directly to VITE_API_URL (must be HTTPS once SSL is ready).
 */

// In dev, Vite's server.proxy rewrites /api/* → VITE_API_URL.
// In prod, the browser calls VITE_API_URL directly (requires HTTPS).
const BASE: string = import.meta.env.DEV
  ? '/api'
  : (import.meta.env['VITE_API_URL'] as string)

// ── SSE event types (mirror the API's chat.ts) ─────────────────────────────

export interface ProgressEvent {
  type: 'progress'
  step: string
  message: string
}

export interface DoneEvent {
  type: 'done'
  sessionId: string
  message: string
}

export interface ErrorEvent {
  type: 'error'
  code: string
  message: string
}

export type SSEEvent = ProgressEvent | DoneEvent | ErrorEvent

export interface ChatSSEHandlers {
  onProgress: (event: ProgressEvent) => void
  onDone: (event: DoneEvent) => void
  onError: (event: ErrorEvent) => void
  onNetworkError: (err: unknown) => void
}

// ── chatSSE ────────────────────────────────────────────────────────────────

/**
 * Send a chat message and consume the SSE stream.
 * Returns an AbortController — call .abort() to cancel mid-stream.
 */
export function chatSSE(
  jwt: string,
  userId: string,
  body: { channel: 'web'; message: string; sessionId?: string },
  handlers: ChatSSEHandlers,
): AbortController {
  const controller = new AbortController()

  void (async () => {
    let response: Response
    try {
      response = await fetch(`${BASE}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ ...body, userId }),
        signal: controller.signal,
      })
    } catch (err) {
      if ((err as { name?: string }).name !== 'AbortError') {
        handlers.onNetworkError(err)
      }
      return
    }

    if (!response.ok) {
      handlers.onError({
        type: 'error',
        code: `HTTP_${response.status}`,
        message:
          response.status === 429
            ? 'Rate limit reached. Upgrade to Pro for higher limits.'
            : 'Could not reach the ClawOS API. Please try again.',
      })
      return
    }

    if (!response.body) {
      handlers.onNetworkError(new Error('Empty response body'))
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // SSE lines end with \n\n; split on newlines and process
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (!data || data === '[DONE]') continue

          let event: SSEEvent
          try {
            event = JSON.parse(data) as SSEEvent
          } catch {
            continue
          }

          if (event.type === 'progress') handlers.onProgress(event)
          else if (event.type === 'done') handlers.onDone(event)
          else if (event.type === 'error') handlers.onError(event)
        }
      }
    } catch (err) {
      if ((err as { name?: string }).name !== 'AbortError') {
        handlers.onNetworkError(err)
      }
    } finally {
      reader.releaseLock()
    }
  })()

  return controller
}

// ── extractResume ──────────────────────────────────────────────────────────

export interface ExtractResumeResult {
  text: string
}

/**
 * Upload a PDF to the API and receive extracted plain text.
 * Raw PDF is discarded server-side — never stored.
 */
export async function extractResume(
  jwt: string,
  file: File,
): Promise<ExtractResumeResult> {
  const form = new FormData()
  form.append('file', file)

  const response = await fetch(`${BASE}/resume/extract`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(
      (body as { message?: string }).message ??
        `Resume extraction failed (HTTP ${response.status})`,
    )
  }

  return response.json() as Promise<ExtractResumeResult>
}

// ── createLinkToken ────────────────────────────────────────────────────────

export interface LinkTokenResult {
  token: string
}

/**
 * Generate a single-use 10-minute Telegram link token.
 * The raw token is returned for display only — the hash is stored server-side.
 */
export async function createLinkToken(jwt: string): Promise<LinkTokenResult> {
  const response = await fetch(`${BASE}/link-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Could not generate link token (HTTP ${response.status})`)
  }

  return response.json() as Promise<LinkTokenResult>
}
