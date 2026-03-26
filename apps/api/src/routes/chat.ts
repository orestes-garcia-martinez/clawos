/**
 * routes/chat.ts — POST /chat endpoint.
 *
 * Full request lifecycle:
 *   1. Validate input (Zod — ChatRequestSchema from @clawos/security).
 *   2. Load session context from Supabase; prune to 20 msgs / 8k tokens.
 *   3. Load CareerClaw profile from Supabase.
 *   4. Open SSE stream to caller — first event within ~100ms.
 *   5. Call Claude with CareerClaw system prompt + both tools.
 *   6. Profile gate — if Claude decided to run_careerclaw and required fields
 *      are missing, return block message immediately. The worker is never invoked.
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
import { ChatRequestSchema, buildAuditEntry } from '@clawos/security'
import {
  CAREERCLAW_SYSTEM_PROMPT,
  RUN_CAREERCLAW_TOOL,
  TRACK_APPLICATION_TOOL,
  createServerClient,
} from '@clawos/shared'
import type { Channel, Message } from '@clawos/shared'
import type { RunCareerClawInput, TrackApplicationInput } from '@clawos/shared'
import { callLLM, callLLMWithToolResult } from '../llm.js'
import { resolveCareerClawEntitlements } from '../entitlements.js'
import { issueSkillAssertion } from '../skill-assertions.js'
import { runWorkerCareerclaw, WorkerError } from '../worker-client.js'
import { loadSession, pruneMessages, saveSession, summariseSkillOutput } from '../session.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Validate that required fields are present for save/update_status actions. */
function validateTrackFields(
  input: Record<string, unknown>,
): input is { job_id: string; title: string; company: string; status: string } {
  return (
    typeof input['job_id'] === 'string' &&
    typeof input['title'] === 'string' &&
    typeof input['company'] === 'string' &&
    typeof input['status'] === 'string'
  )
}

/** Build the profile-gate block message shown when required fields are missing. */
function buildProfileGateMessage(missingFields: string[]): string {
  const list = missingFields.map((f, i) => `${i + 1}. ${f}`).join('\n')
  return (
    `Before I can run your job search, I still need a few things from you.\n\n` +
    `Please head to **Settings** and provide the following:\n\n${list}\n\n` +
    `Once those are saved, come back and I'll run your search right away.`
  )
}

/**
 * Handle the profile gate: save session with the block message, write audit
 * log, and stream the done event. Returns true if the gate fired (caller
 * should `return`), false if profile is complete.
 */
async function handleProfileGate(opts: {
  missingFields: string[]
  userId: string
  channel: string
  message: string
  history: Message[]
  activeSessionId: string | undefined
  startMs: number
  sendDone: (sessionId: string, message: string) => Promise<void>
}): Promise<boolean> {
  if (opts.missingFields.length === 0) return false

  const gateMessage = buildProfileGateMessage(opts.missingFields)

  const savedId = await saveSession(
    opts.userId,
    opts.channel as Channel,
    [
      ...opts.history,
      { role: 'user', content: opts.message, timestamp: new Date().toISOString() },
      { role: 'assistant', content: gateMessage, timestamp: new Date().toISOString() },
    ],
    opts.activeSessionId,
  )

  logAudit({
    userId: opts.userId,
    skill: 'careerclaw',
    channel: opts.channel,
    status: 'success',
    statusCode: 200,
    durationMs: Date.now() - opts.startMs,
  })

  await opts.sendDone(savedId, gateMessage)
  return true
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function chatHandler(c: Context): Promise<Response> {
  const startMs = Date.now()
  const userId = c.get('userId') as string

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

      const entitlements = await resolveCareerClawEntitlements(userId, supabase)
      const featureSet = new Set(entitlements.features)

      // Compute missing required fields up front — used by the profile gate below.
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

      // Append the new user message to history for Claude
      const messagesForClaude: Message[] = [
        ...history,
        { role: 'user', content: message, timestamp: new Date().toISOString() },
      ]

      // ── 5. First Claude call — both tools available ───────────────────────
      await sendProgress('thinking', 'Thinking...')

      const llmResult = await callLLM(CAREERCLAW_SYSTEM_PROMPT, messagesForClaude, [
        RUN_CAREERCLAW_TOOL,
        TRACK_APPLICATION_TOOL,
      ])

      // ── 6. Profile gate — keyed on Claude's tool decision ────────────────
      if (
        llmResult.type === 'tool_use' &&
        llmResult.toolName === 'run_careerclaw' &&
        (await handleProfileGate({
          missingFields,
          userId,
          channel,
          message,
          history,
          activeSessionId,
          startMs,
          sendDone,
        }))
      ) {
        return
      }

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
        // Defense-in-depth: reject if required profile fields are still
        // missing (should have been caught by the gate above, but guards
        // against future code paths that might skip it).
        if (
          await handleProfileGate({
            missingFields,
            userId,
            channel,
            message,
            history,
            activeSessionId,
            startMs,
            sendDone,
          })
        ) {
          return
        }

        const toolInput = llmResult.toolInput as RunCareerClawInput

        const effectiveTier = entitlements.effectiveTier
        const maxTopK = featureSet.has('careerclaw.topk_extended') ? 10 : 3
        const topK = Math.min(toolInput.topK ?? maxTopK, maxTopK)

        const assertion = issueSkillAssertion({
          userId,
          skill: 'careerclaw',
          tier: effectiveTier,
          features: entitlements.features,
        })

        await sendProgress('fetching', 'Fetching jobs...')

        let workerResult
        try {
          workerResult = await runWorkerCareerclaw({
            assertion,
            input: {
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
            },
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

        const briefing = workerResult.result
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
              ...workerResult.result,
              _meta: {
                tier: effectiveTier,
                topK,
                includeOutreach:
                  featureSet.has('careerclaw.llm_outreach_draft') && !!toolInput.includeOutreach,
                includeCoverLetter:
                  featureSet.has('careerclaw.tailored_cover_letter') &&
                  !!toolInput.includeCoverLetter,
                includeGapAnalysis:
                  featureSet.has('careerclaw.resume_gap_analysis') &&
                  !!toolInput.includeGapAnalysis,
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
        // Read action as a plain string to avoid discriminated-union narrowing
        // conflicts between the try branches and the catch/summary blocks.
        const trackAction = llmResult.toolInput['action'] as string

        await sendProgress(
          'tracking',
          trackAction === 'list' ? 'Checking your tracker...' : 'Updating your tracker...',
        )

        type TrackResult = {
          success: boolean
          action: string
          title?: string
          company?: string
          status?: string
          count?: number
          applications?: Array<{
            job_id: string
            title: string
            company: string
            status: string
            created_at: string
          }>
          message: string
        }

        let trackResult: TrackResult

        try {
          if (trackAction === 'list') {
            // Read path — query the full tracker for this user
            const { data: rows, error } = await supabase
              .from('careerclaw_job_tracking')
              .select('job_id, title, company, status, created_at')
              .eq('user_id', userId)
              .order('created_at', { ascending: false })

            if (error) {
              trackResult = {
                success: false,
                action: 'list',
                count: 0,
                applications: [],
                message: 'Failed to load your Applications tracker.',
              }
            } else if (!rows || rows.length === 0) {
              trackResult = {
                success: true,
                action: 'list',
                count: 0,
                applications: [],
                message: 'No applications found. Your tracker is empty.',
              }
            } else {
              trackResult = {
                success: true,
                action: 'list',
                count: rows.length,
                applications: rows as TrackResult['applications'],
                message: `Found ${rows.length} tracked application${rows.length === 1 ? '' : 's'}.`,
              }
            }
          } else if (trackInput.action === 'save') {
            // Validate required fields — defense-in-depth against incomplete LLM tool calls.
            if (!validateTrackFields(llmResult.toolInput)) {
              trackResult = {
                success: false,
                action: 'save',
                message: 'Missing required fields for save (job_id, title, company, status).',
              }
            } else {
              // Insert if new; on conflict, update title/company (metadata may
              // have been corrected) but preserve the existing status and url
              // so a duplicate save never downgrades progress or clears data.
              const { error } = await supabase.from('careerclaw_job_tracking').upsert(
                {
                  user_id: userId,
                  job_id: trackInput.job_id,
                  title: trackInput.title,
                  company: trackInput.company,
                  status: trackInput.status,
                  url: trackInput.url ?? null,
                },
                {
                  onConflict: 'user_id,job_id',
                  ignoreDuplicates: true,
                },
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
            }
          } else if (trackAction === 'update_status') {
            // Validate required fields — defense-in-depth against incomplete LLM tool calls.
            if (!validateTrackFields(llmResult.toolInput)) {
              trackResult = {
                success: false,
                action: 'update_status',
                message:
                  'Missing required fields for update_status (job_id, title, company, status).',
              }
            } else {
              // update_status — find by (user_id, job_id) and update status.
              // If job_id produces 0 rows (agent invented a slug after a list turn),
              // fall back to a case-insensitive company name match so cross-turn
              // follow-ups like "change the Stripe one to rejected" still work.
              const updateInput = trackInput as Exclude<
                TrackApplicationInput,
                { action: 'list' | 'save' }
              >

              // Primary: exact job_id match
              const { data: updatedRows, error } = await supabase
                .from('careerclaw_job_tracking')
                .update({ status: updateInput.status })
                .eq('user_id', userId)
                .eq('job_id', updateInput.job_id)
                .select()

              const rowsAffected = updatedRows?.length ?? 0

              if (error) {
                trackResult = {
                  success: false,
                  action: 'update_status',
                  title: updateInput.title,
                  company: updateInput.company,
                  status: updateInput.status,
                  message: 'Database update failed.',
                }
              } else if (rowsAffected > 0) {
                trackResult = {
                  success: true,
                  action: 'update_status',
                  title: updateInput.title,
                  company: updateInput.company,
                  status: updateInput.status,
                  message: `Updated "${updateInput.title}" at ${updateInput.company} to status "${updateInput.status}".`,
                }
              } else {
                // Fallback: match by company name (case-insensitive).
                // Covers the pattern where the agent calls list in one turn then
                // update_status in the next — the real job_id is not in session,
                // so the agent constructs a slug that never matches.
                const { data: fallbackRows, error: fallbackError } = await supabase
                  .from('careerclaw_job_tracking')
                  .update({ status: updateInput.status })
                  .eq('user_id', userId)
                  .ilike('company', updateInput.company)
                  .select()

                const fallbackAffected = fallbackRows?.length ?? 0

                trackResult = fallbackError
                  ? {
                      success: false,
                      action: 'update_status',
                      title: updateInput.title,
                      company: updateInput.company,
                      status: updateInput.status,
                      message: 'Database update failed.',
                    }
                  : fallbackAffected === 0
                    ? {
                        success: false,
                        action: 'update_status',
                        title: updateInput.title,
                        company: updateInput.company,
                        status: updateInput.status,
                        message: `No tracked application found for "${updateInput.company}". Save it first before updating its status.`,
                      }
                    : {
                        success: true,
                        action: 'update_status',
                        title: fallbackRows![0]!.title ?? updateInput.title,
                        company: updateInput.company,
                        status: updateInput.status,
                        message: `Updated "${fallbackRows![0]!.title ?? updateInput.title}" at ${updateInput.company} to status "${updateInput.status}".`,
                      }
              }
            }
          } else {
            // Unknown action — should not happen but guard defensively
            trackResult = {
              success: false,
              action: trackAction,
              message: `Unknown track_application action: "${trackAction}".`,
            }
          }
        } catch (err) {
          console.error(
            '[chat] track_application Supabase error:',
            err instanceof Error ? err.message : String(err),
          )
          if (trackAction === 'list') {
            trackResult = {
              success: false,
              action: 'list',
              count: 0,
              applications: [],
              message: 'An unexpected error occurred loading your tracker.',
            }
          } else if (trackInput.action === 'save' || trackInput.action === 'update_status') {
            trackResult = {
              success: false,
              action: trackInput.action,
              title: trackInput.title,
              company: trackInput.company,
              status: trackInput.status,
              message: 'An unexpected error occurred during tracking.',
            }
          } else {
            trackResult = {
              success: false,
              action: trackAction,
              message: 'An unexpected error occurred during tracking.',
            }
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
        const sessionSummary =
          trackAction === 'list'
            ? trackResult.success
              ? `Listed ${trackResult.count ?? 0} tracked application${(trackResult.count ?? 0) === 1 ? '' : 's'}.`
              : 'Tracker list failed.'
            : trackResult.success
              ? `Tracker ${trackInput.action === 'save' ? 'save' : 'status update'}: ${trackResult.title} at ${trackResult.company} → ${trackResult.status}.`
              : `Tracker action failed for ${trackResult.title} at ${trackResult.company}.`

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
