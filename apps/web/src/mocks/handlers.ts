// apps/web/src/mocks/handlers.ts
import { http, HttpResponse } from 'msw'
import { getMockTier } from './supabase.mock.ts'
import type { MockPersona } from './supabase.mock.ts'

const encoder = new TextEncoder()

const persona: MockPersona =
  (import.meta.env['VITE_MOCK_PERSONA'] as MockPersona | undefined) === 'new' ? 'new' : 'returning'

// Log test credentials on startup for the new-user persona
if (persona === 'new') {
  console.info(
    '%c[ClawOS mock] New-user persona active.\n' +
      '  Sign in with:  test@clawos.local / clawos123\n' +
      '  Flow: /auth → sign in → /home (pick skill) → workspace',
    'color: #22c55e; font-weight: bold',
  )
}

function sseStream(events: Array<{ type: string; [k: string]: unknown }>) {
  const stream = new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })
  return new HttpResponse(stream, {
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

// Track free-tier message count to simulate rate limits
let freeMessageCount = 0

export const handlers = [
  // Chat SSE endpoint — skill-aware: reads the optional `skill` field from body
  http.post('/api/chat', async ({ request }) => {
    const body = (await request.json()) as { message: string; skill?: string }

    // Simulate 429 rate limit for free-tier users every 3rd message
    if (getMockTier() === 'free') {
      freeMessageCount++
      if (freeMessageCount % 3 === 0) {
        return new HttpResponse(null, { status: 429 })
      }
    }

    const tierLabel = getMockTier() === 'pro' ? '🟢 Pro' : '⚪ Free'
    const skillLabel = body.skill ?? 'unknown'

    return sseStream([
      { type: 'progress', step: 'thinking', message: 'Analysing your request…' },
      { type: 'progress', step: 'searching', message: `Searching via ${skillLabel}…` },
      {
        type: 'done',
        sessionId: 'mock-session-001',
        message: `**Mock response** (${tierLabel} · ${skillLabel}) to: "${body.message}"\n\nThis is a local dev mock. No real API was called.`,
      },
    ])
  }),

  // Resume extraction
  http.post('/api/resume/extract', () => {
    return HttpResponse.json({ text: 'Mock resume text: 5 years TypeScript, React, Node.js…' })
  }),

  // Link token
  http.post('/api/link-token', () => {
    return HttpResponse.json({ token: 'mock-link-token-abc123' })
  }),
]
