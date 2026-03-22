/**
 * routes/chat.ts — POST /chat endpoint.
 *
 * Full request lifecycle:
 *   1. Validate input (Zod — ChatRequestSchema from @clawos/security).
 *   2. Load session context from Supabase; prune to 20 msgs / 8k tokens.
 *   3. Load CareerClaw profile from Supabase.
 *   4. Profile gate — if required fields are missing, return block message
 *      immediately. Claude and the worker are never invoked.
 *   5. Open SSE stream to caller — first event within ~100ms.
 *   6. Call Claude with CareerClaw system prompt + both tools.
 *   7a. Direct text response → stream final event, save session, done.
 *   7b. run_careerclaw tool → stream progress events → invoke Lightsail worker →
 *       second Claude call to format results → stream final event.
 *   7c. track_application tool → direct Supabase upsert/update →
 *       second Claude call to format confirmation → stream final event.
 *   8. Save updated session (summary of skill output, never raw payloads).
 *   9. Write audit log (metadata only — no message bodies).
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
  TRACK_APPLICATION_TOOL,
  createServerClient,
} from '@clawos/shared'
import type { Channel, Message } from '@clawos/shared'
import type { RunCareerClawInput, TrackApplicationInput } from '@clawos/shared'
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

      // ── 4. Load CareerClaw profile ───────────────────────────────────────
      const supabase = createServerClient()
      const { data: profileRow } = await supabase
        .from('careerclaw_profiles')
        .select(
          'resume_text, work_mode, salary_min, location_pref, skills, target_roles, experience_years, resume_summary',
        )
        .eq('user_id', userId)
        .maybeSingle()

      // ── 5. Profile gate ──────────────────────────────────────────────────
      const profileSkills = (profileRow?.skills as string[] | null) ?? []
      const missingFields: string[] = []

      if (profileSkills.length === 0) {
        missingFields.push('a resume (so I can match your skills and experience)')
      }
      if (!profileRow?.work_mode) {
        missingFields.push('your preferred work mode (Remote, Hybrid, or On-site)')
      }
      if (profileRow?.work_mode === 'onsite' && !profileRow?.location_pref) {
        missingFields.push('your location preference (required for On-site searches)')
      }

      // Profile gate only blocks job searches, not tracking requests.
      // Claude will decide whether to run_careerclaw or track_application;
      // if the user is just tracking something, the gate must not fire.
      // We therefore only apply the gate when the message appears to be a
      // search intent — Claude's first call will handle routing cleanly.
      const isSearchIntent =
        missingFields.length > 0 &&
        /briefing|find jobs|job search|search|openings|matches|what.s out there/i.test(message)

      if (isSearchIntent) {
        const list = missingFields.map((f, i) => `${i + 1}. ${f}`).join('\n')
        const gateMessage =
          `Before I can run your job search, I still need a few things from you.\n\n` +
          `Please head to **Settings** and provide the following:\n\n${list}\n\n` +
          `Once those are saved, come back and I'll run your search right away.`

        const savedId = await saveSession(
          userId,
          channel as Channel,
          [
            ...history,
            { role: 'user', content: message, timestamp: new Date().toISOString() },
            { role: 'assistant', content: gateMessage, timestamp: new Date().toISOString() },
          ],
          activeSessionId,
        )

        logAudit({
          userId,
          skill: 'careerclaw',
          channel,
          status: 'success',
          statusCode: 200,
          durationMs: Date.now() - startMs,
        })

        await sendDone(savedId, gateMessage)
        return
      }

      // Append the new user message to history for Claude
      const messagesForClaude: Message[] = [
        ...history,
        { role: 'user', content: message, timestamp: new Date().toISOString() },
      ]

      // ── 6. First Claude call — both tools available ───────────────────────
      await sendProgress('thinking', 'Thinking...')

      const llmResult = await callLLM(CAREERCLAW_SYSTEM_PROMPT, messagesForClaude, [
        RUN_CAREERCLAW_TOOL,
        TRACK_APPLICATION_TOOL,
      ])

      // ── 7a. Direct text response ─────────────────────────────────────────
      if (llmResult.type === 'text') {
        const updatedMessages: Message[] = [
          ...history,
          { role: 'user', content: message, timestamp: new Date().toISOString() },
          { role: 'assistant', content: llmResult.content, timestamp: new Date().toISOString() },
        ]

        const savedId = await saveSession(
          userId,
          channel as Channel,
          updatedMessages,
          activeSessionId,
        )

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

      // ── 7b. run_careerclaw tool ──────────────────────────────────────────
      if (llmResult.toolName === 'run_careerclaw') {
        const toolInput = llmResult.toolInput as RunCareerClawInput

        const maxTopK = TOP_K_LIMITS[tier]
        const topK = Math.min(toolInput.topK ?? maxTopK, maxTopK)
        const isPro = tier === 'pro'

        await sendProgress('fetching', 'Fetching jobs...')

        let workerResult
        try {
          workerResult = await runWorkerCareerclaw({
            userId,
            profile: {
              skills: (profileRow?.skills as string[] | null) ?? undefined,
              targetRoles: (profileRow?.target_roles as string[] | null) ?? undefined,
              experienceYears: profileRow?.experience_years ?? undefined,
              resumeSummary: (profileRow?.resume_summary as string | null) ?? undefined,
              workMode:
                (profileRow?.work_mode as 'remote' | 'hybrid' | 'onsite' | null) ?? undefined,
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

        const briefing = workerResult.briefing
        const jobCount = (briefing['matches'] as unknown[])?.length ?? 0
        const topMatch = (briefing['matches'] as Array<{ score?: number }>)?.[0]
        const topScore = topMatch?.score ?? null

        // Log run (fire and forget — don't block SSE)
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
          console.error(
            '[chat] Second Claude call (run_careerclaw format) error:',
            err instanceof Error ? err.message : String(err),
          )
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

        const sessionSummary = summariseSkillOutput('careerclaw', formattedResponse, {
          jobCount,
          topScore: topScore ?? undefined,
        })

        const updatedMessages: Message[] = [
          ...history,
          { role: 'user', content: message, timestamp: new Date().toISOString() },
          { role: 'assistant', content: sessionSummary, timestamp: new Date().toISOString() },
        ]

        const savedId = await saveSession(
          userId,
          channel as Channel,
          updatedMessages,
          activeSessionId,
        )

        logAudit({
          userId,
          skill: 'careerclaw',
          channel,
          status: 'success',
          statusCode: 200,
          durationMs: Date.now() - startMs,
        })

        await sendDone(savedId, formattedResponse)
        return
      }

      // ── 7c. track_application tool ───────────────────────────────────────
      // Direct Supabase write — no worker involved. Fast path.
      if (llmResult.toolName === 'track_application') {
        const trackInput = llmResult.toolInput as TrackApplicationInput

        await sendProgress('tracking', 'Updating your tracker...')

        type TrackResult = {
          success: boolean
          action: string
          title: string
          company: string
          status: string
          message: string
        }

        let trackResult: TrackResult

        try {
          if (trackInput.action === 'save') {
            // Upsert — safe to call even if the job was already saved
            const { error } = await supabase.from('careerclaw_job_tracking').upsert(
              {
                user_id: userId,
                job_id: trackInput.job_id,
                title: trackInput.title,
                company: trackInput.company,
                status: trackInput.status,
                url: trackInput.url ?? null,
              },
              { onConflict: 'user_id,job_id' },
            )

            trackResult = error
              ? {
                  success: false,
                  action: 'save',
                  title: trackInput.title,
                  company: trackInput.company,
                  status: trackInput.status,
                  message: 'Database write failed.',
                }
              : {
                  success: true,
                  action: 'save',
                  title: trackInput.title,
                  company: trackInput.company,
                  status: trackInput.status,
                  message: `Saved "${trackInput.title}" at ${trackInput.company} with status "${trackInput.status}".`,
                }
          } else {
            // update_status — find by (user_id, job_id) and update status
            const { error } = await supabase
              .from('careerclaw_job_tracking')
              .update({ status: trackInput.status })
              .eq('user_id', userId)
              .eq('job_id', trackInput.job_id)

            trackResult = error
              ? {
                  success: false,
                  action: 'update_status',
                  title: trackInput.title,
                  company: trackInput.company,
                  status: trackInput.status,
                  message: 'Database update failed.',
                }
              : {
                  success: true,
                  action: 'update_status',
                  title: trackInput.title,
                  company: trackInput.company,
                  status: trackInput.status,
                  message: `Updated "${trackInput.title}" at ${trackInput.company} to status "${trackInput.status}".`,
                }
          }
        } catch (err) {
          console.error(
            '[chat] track_application Supabase error:',
            err instanceof Error ? err.message : String(err),
          )
          trackResult = {
            success: false,
            action: trackInput.action,
            title: trackInput.title,
            company: trackInput.company,
            status: trackInput.status,
            message: 'An unexpected error occurred during tracking.',
          }
        }

        // Second Claude call to format the confirmation naturally
        let formattedResponse: string
        try {
          const formatResult = await callLLMWithToolResult(
            CAREERCLAW_SYSTEM_PROMPT,
            messagesForClaude,
            llmResult.toolUseId,
            llmResult.toolName,
            trackInput,
            trackResult,
          )
          formattedResponse = formatResult.content
        } catch (err) {
          console.error(
            '[chat] Second Claude call (track_application format) error:',
            err instanceof Error ? err.message : String(err),
          )
          // Fallback: surface the raw result message rather than a generic error
          formattedResponse = trackResult.success
            ? trackResult.message
            : "I wasn't able to update your tracker right now — please try adding it manually in your Applications tab."
        }

        // Save session with a brief summary (audit only — no job details in session)
        const sessionSummary = trackResult.success
          ? `Tracker ${trackInput.action === 'save' ? 'save' : 'status update'}: ${trackInput.title} at ${trackInput.company} → ${trackInput.status}.`
          : `Tracker action failed for ${trackInput.title} at ${trackInput.company}.`

        const updatedMessages: Message[] = [
          ...history,
          { role: 'user', content: message, timestamp: new Date().toISOString() },
          { role: 'assistant', content: sessionSummary, timestamp: new Date().toISOString() },
        ]

        const savedId = await saveSession(
          userId,
          channel as Channel,
          updatedMessages,
          activeSessionId,
        )

        logAudit({
          userId,
          skill: 'careerclaw',
          channel,
          status: trackResult.success ? 'success' : 'error',
          statusCode: trackResult.success ? 200 : 500,
          durationMs: Date.now() - startMs,
        })

        await sendDone(savedId, formattedResponse)
        return
      }

      // ── Unknown tool — should not happen but guard defensively ────────────
      console.error('[chat] Claude invoked unknown tool:', llmResult.toolName)
      await sendError('UNKNOWN_TOOL', 'An unexpected error occurred. Please try again.')
    } catch (err) {
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
