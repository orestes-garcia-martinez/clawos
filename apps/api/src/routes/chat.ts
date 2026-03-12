/**
 * routes/chat.ts — POST /chat endpoint.
 *
 * Full request lifecycle:
 *   1. Validate input (Zod — ChatRequestSchema from @clawos/security).
 *   2. Load session context from Supabase; prune to 20 msgs / 8k tokens.
 *   3. Open SSE stream to caller — first event within ~100ms.
 *   4. Call Claude with CareerClaw system prompt + run_careerclaw tool.
 *   5a. Direct text response → stream final event, save session, done.
 *   5b. Tool use → stream progress events → invoke Lightsail worker →
 *       second Claude call to format results → stream final event.
 *   6. Save updated session (summary of skill output, never raw payloads).
 *   7. Write audit log (metadata only — no message bodies).
 *
 * SSE event format:
 *   data: {"type":"progress","step":"fetching","message":"Fetching jobs..."}
 *   data: {"type":"progress","step":"scoring","message":"Scoring matches..."}
 *   data: {"type":"done","sessionId":"<uuid>","message":"<formatted response>"}
 *   data: {"type":"error","code":"<CODE>","message":"<user-safe message>"}
 *
 * The stream is always terminated with a "done" or "error" event followed
 * by the SSE [done] sentinel. Callers must handle both.
 */

import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { ChatRequestSchema, buildAuditEntry, TOP_K_LIMITS } from '@clawos/security'
import {
  CAREERCLAW_SYSTEM_PROMPT,
  RUN_CAREERCLAW_TOOL,
  createServerClient,
} from '@clawos/shared'
import type { Channel, Message } from '@clawos/shared'
import type { RunCareerClawInput } from '@clawos/shared'
import { callLLM, callLLMWithToolResult } from '../llm.js'
import { runWorkerCareerclaw, WorkerError } from '../worker-client.js'
import { loadSession, pruneMessages, saveSession, summariseSkillOutput } from '../session.js'

// ── Handler ───────────────────────────────────────────────────────────────────

export async function chatHandler(c: Context): Promise<Response> {
  const startMs = Date.now()
  const userId = c.get('userId') as string
  const tier = c.get('userTier') as 'free' | 'pro'

  // ── 1. Input validation ────────────────────────────────────────────────────
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ code: 'BAD_REQUEST', message: 'Invalid JSON body' }, 400)
  }

  const parseResult = ChatRequestSchema.safeParse(body)
  if (!parseResult.success) {
    return c.json(
      { code: 'BAD_REQUEST', message: 'Invalid request', details: parseResult.error.flatten() },
      400,
    )
  }

  const { channel, message, sessionId } = parseResult.data

  // ── 2. SSE stream ──────────────────────────────────────────────────────────
  return streamSSE(c, async (stream) => {
    const sendProgress = async (step: string, message: string) => {
      await stream.writeSSE({
        data: JSON.stringify({ type: 'progress', step, message }),
      })
    }

    const sendDone = async (sessionId: string, message: string) => {
      await stream.writeSSE({
        data: JSON.stringify({ type: 'done', sessionId, message }),
      })
    }

    const sendError = async (code: string, message: string) => {
      await stream.writeSSE({
        data: JSON.stringify({ type: 'error', code, message }),
      })
    }

    try {
      // ── 3. Load session ──────────────────────────────────────────────────
      await sendProgress('session', 'Loading context...')

      const session = await loadSession(userId, channel as Channel, sessionId)
      const history: Message[] = session ? pruneMessages(session.messages) : []
      const activeSessionId = session?.id

      // Append the new user message to history for Claude
      const messagesForClaude: Message[] = [
        ...history,
        { role: 'user', content: message, timestamp: new Date().toISOString() },
      ]

      // ── 4. First Claude call ─────────────────────────────────────────────
      await sendProgress('thinking', 'Thinking...')

      const llmResult = await callLLM(
        CAREERCLAW_SYSTEM_PROMPT,
        messagesForClaude,
        [RUN_CAREERCLAW_TOOL],
      )

      // ── 5a. Direct text response ─────────────────────────────────────────
      if (llmResult.type === 'text') {
        const updatedMessages: Message[] = [
          ...history,
          { role: 'user', content: message, timestamp: new Date().toISOString() },
          { role: 'assistant', content: llmResult.content, timestamp: new Date().toISOString() },
        ]

        const savedId = await saveSession(userId, channel as Channel, updatedMessages, activeSessionId)

        logAudit({
          userId,
          skill: 'none',
          channel,
          status: 'success',
          statusCode: 200,
          durationMs: Date.now() - startMs,
        })

        await sendDone(savedId, llmResult.content)
        return
      }

      // ── 5b. Tool use path ────────────────────────────────────────────────
      const toolInput = llmResult.toolInput as RunCareerClawInput

      // Enforce tier limits — Claude may have requested more than allowed
      const maxTopK = TOP_K_LIMITS[tier]
      const topK = Math.min(toolInput.topK ?? maxTopK, maxTopK)
      const isPro = tier === 'pro'

      // Load CareerClaw profile from Supabase
      const supabase = createServerClient()
      const { data: profileRow } = await supabase
        .from('careerclaw_profiles')
        .select('resume_text, work_mode, salary_min, location_pref')
        .eq('user_id', userId)
        .maybeSingle()

      await sendProgress('fetching', 'Fetching jobs...')

      let workerResult
      try {
        workerResult = await runWorkerCareerclaw({
          userId,
          profile: {
            workMode: profileRow?.work_mode ?? undefined,
            salaryMin: profileRow?.salary_min ?? undefined,
            locationPref: profileRow?.location_pref ?? undefined,
          },
          resumeText: profileRow?.resume_text ?? undefined,
          topK,
        })
      } catch (err) {
        const isTimeout = err instanceof WorkerError && err.isTimeout
        logAudit({
          userId,
          skill: 'careerclaw',
          channel,
          status: 'error',
          statusCode: isTimeout ? 504 : 500,
          durationMs: Date.now() - startMs,
        })
        await sendError(
          isTimeout ? 'WORKER_TIMEOUT' : 'WORKER_ERROR',
          isTimeout
            ? 'The job search timed out. Please try again in a moment.'
            : 'The job search encountered an error. Please try again.',
        )
        return
      }

      await sendProgress('scoring', 'Scoring matches...')

      // Log the run to careerclaw_runs (fire and forget — don't block SSE)
      const briefing = workerResult.briefing
      const jobCount = (briefing['matches'] as unknown[])?.length ?? 0
      const topMatch = (briefing['matches'] as Array<{ score?: number }>)?.[0]
      const topScore = topMatch?.score ?? null

      supabase
        .from('careerclaw_runs')
        .insert({
          user_id: userId,
          job_count: jobCount,
          top_score: topScore,
          status: jobCount > 0 ? 'success' : 'no_matches',
          duration_ms: workerResult.durationMs,
        })
        .then(({ error }) => {
          if (error) console.error('[chat] Failed to log careerclaw run:', error.message)
        })

      await sendProgress('drafting', 'Drafting outreach...')

      // ── Second Claude call: format the tool result ───────────────────────
      let formattedResponse: string
      try {
        const formatResult = await callLLMWithToolResult(
          CAREERCLAW_SYSTEM_PROMPT,
          messagesForClaude,
          llmResult.toolUseId,
          llmResult.toolName,
          toolInput,
          {
            ...workerResult.briefing,
            _meta: {
              tier,
              isPro,
              topK,
              includeOutreach: isPro && toolInput.includeOutreach,
              includeCoverLetter: isPro && toolInput.includeCoverLetter,
              includeGapAnalysis: isPro && toolInput.includeGapAnalysis,
            },
          },
        )
        formattedResponse = formatResult.content
      } catch (err) {
        logAudit({
          userId,
          skill: 'careerclaw',
          channel,
          status: 'error',
          statusCode: 500,
          durationMs: Date.now() - startMs,
        })
        await sendError('LLM_ERROR', 'Failed to format job results. Please try again.')
        return
      }

      // ── Save session (summary only) ──────────────────────────────────────
      const sessionSummary = summariseSkillOutput('careerclaw', formattedResponse, {
        jobCount,
        topScore: topScore ?? undefined,
      })

      const updatedMessages: Message[] = [
        ...history,
        { role: 'user', content: message, timestamp: new Date().toISOString() },
        { role: 'assistant', content: sessionSummary, timestamp: new Date().toISOString() },
      ]

      const savedId = await saveSession(userId, channel as Channel, updatedMessages, activeSessionId)

      logAudit({
        userId,
        skill: 'careerclaw',
        channel,
        status: 'success',
        statusCode: 200,
        durationMs: Date.now() - startMs,
      })

      await sendDone(savedId, formattedResponse)
    } catch (err) {
      // Unexpected error — log and send generic error event
      console.error('[chat] Unhandled error:', err instanceof Error ? err.message : String(err))
      logAudit({
        userId,
        skill: 'unknown',
        channel,
        status: 'error',
        statusCode: 500,
        durationMs: Date.now() - startMs,
      })
      await stream.writeSSE({
        data: JSON.stringify({
          type: 'error',
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred. Please try again.',
        }),
      })
    }
  })
}

// ── Audit helper ──────────────────────────────────────────────────────────────

function logAudit(params: {
  userId: string
  skill: string
  channel: string
  status: 'success' | 'error' | 'rate_limited'
  statusCode: number
  durationMs: number
}) {
  const entry = buildAuditEntry(params)
  console.log(JSON.stringify(entry))
}
