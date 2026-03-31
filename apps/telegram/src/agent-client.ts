/**
 * agent-client.ts -- HTTP client for the ClawOS Agent API.
 *
 * Sends an authenticated POST to /chat and consumes the SSE stream.
 * Progress events are ignored here -- callers handle typing indicators
 * separately via sendChatAction before calling this function.
 *
 * Auth: X-Service-Secret + X-Service-Name + X-User-Id (service path).
 * The Agent API validates the secret and looks up the user's tier.
 *
 * Returns the final 'done' event message and sessionId.
 * Throws AgentApiError on network failure, timeout, or error events.
 */

import { ENV } from './env.js'

const AGENT_TIMEOUT_MS = 45_000 // 45s -- skill invocation can take up to ~30s + buffer

export class AgentApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus?: number,
  ) {
    super(message)
    this.name = 'AgentApiError'
  }
}

export interface AgentResponse {
  text: string
  sessionId: string
}

/**
 * Call the Agent API and return the final response.
 *
 * @param userId    Supabase UUID (resolved by identity.ts).
 * @param message   User's text message.
 * @param sessionId Optional: continue an existing session.
 */
export async function callAgentApi(
  userId: string,
  message: string,
  sessionId?: string,
): Promise<AgentResponse> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(`${ENV.AGENT_API_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Secret': ENV.SERVICE_SECRET,
        'X-Service-Name': 'telegram',
        'X-User-Id': userId,
      },
      body: JSON.stringify({ userId, channel: 'telegram', message, sessionId }),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timeoutId)
    const isAbort = err instanceof Error && err.name === 'AbortError'
    throw new AgentApiError(
      isAbort ? 'Agent API timeout' : `Agent API network error: ${String(err)}`,
      isAbort ? 'TIMEOUT' : 'NETWORK_ERROR',
    )
  }

  if (!response.ok) {
    clearTimeout(timeoutId)
    throw new AgentApiError(
      `Agent API HTTP error: ${response.status}`,
      'HTTP_ERROR',
      response.status,
    )
  }

  if (!response.body) {
    clearTimeout(timeoutId)
    throw new AgentApiError('Agent API returned no body', 'NO_BODY')
  }

  // Consume the SSE stream.
  try {
    return await consumeSseStream(response.body)
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Read an SSE stream until a 'done' or 'error' event is received.
 * Progress events are intentionally ignored.
 */
async function consumeSseStream(body: ReadableStream<Uint8Array>): Promise<AgentResponse> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Process all complete lines in the buffer.
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? '' // Keep the incomplete trailing chunk.

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const raw = line.slice(6).trim()
        if (!raw || raw === '[DONE]') continue

        let event: Record<string, unknown>
        try {
          event = JSON.parse(raw) as Record<string, unknown>
        } catch {
          // Malformed event -- skip.
          continue
        }

        if (event['type'] === 'done') {
          return {
            text: String(event['message'] ?? ''),
            sessionId: String(event['sessionId'] ?? ''),
          }
        }

        if (event['type'] === 'error') {
          throw new AgentApiError(
            String(event['message'] ?? 'Unknown agent error'),
            String(event['code'] ?? 'AGENT_ERROR'),
          )
        }

        // 'progress' events: ignored. Caller sends typing indicator separately.
      }
    }
  } finally {
    reader.releaseLock()
  }

  throw new AgentApiError('SSE stream ended without a done event', 'INCOMPLETE_STREAM')
}
