/**
 * routes/chat.ts — POST /chat endpoint.
 *
 * Full request lifecycle:
 *   1. Validate input (Zod — ChatRequestSchema from @clawos/security).
 *   2. Load session context from Supabase; prune to 20 msgs / 8k tokens.
 *   3. Load CareerClaw profile from Supabase.
 *   4. Open SSE stream to caller — first event within ~100ms.
 *   5. Call Claude with CareerClaw system prompt + all tools.
 *   6. Profile gate — if Claude decided to invoke a skill tool and required
 *      fields are missing, return block message immediately.
 *   7a. Direct text response → stream final event, save session, done.
 *   7b. run_careerclaw tool → stream progress → invoke worker → save briefing
 *       to session state → second Claude call to format results → stream.
 *   7c. run_gap_analysis tool (Pro) → look up match from session state →
 *       invoke worker → save gap result to session state → format → stream.
 *   7d. run_cover_letter tool (Pro) → look up match + gap from session state →
 *       invoke worker (with precomputedGap if available) → format → stream.
 *   7e. track_application tool → direct Supabase upsert/update →
 *       second Claude call to format confirmation → stream final event.
 *   8. Save updated session (messages + state written atomically).
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
  RUN_GAP_ANALYSIS_TOOL,
  RUN_COVER_LETTER_TOOL,
  TRACK_APPLICATION_TOOL,
  createServerClient,
} from '@clawos/shared'
import type { Channel, Message, SessionState } from '@clawos/shared'
import type {
  RunCareerClawInput,
  RunGapAnalysisInput,
  RunCoverLetterInput,
  TrackApplicationInput,
} from '@clawos/shared'
import { callLLM, callLLMWithToolResult } from '../llm.js'
import { resolveCareerClawEntitlements } from '../entitlements.js'
import { issueSkillAssertion } from '../skill-assertions.js'
import {
  generateRequestId,
  detectUserIntents,
  logIntentAudit,
  logWorkerSignal,
  detectFalseActionClaims,
  filterFalseClaims,
  sanitizeHallucinatedClaims,
  logTextAudit,
} from '../forensic-logger.js'
import {
  runWorkerCareerclaw,
  runWorkerGapAnalysis,
  runWorkerCoverLetter,
  WorkerError,
} from '../worker-client.js'
import {
  loadSession,
  pruneMessages,
  saveSession,
  getMatchFromState,
  getGapResultFromState,
  mergeSessionState,
} from '../session.js'
import {
  buildActiveBriefingGroundingMessage,
  buildReferencedMatchesHint,
} from '../briefing-grounding.js'
import { buildResolvedIntentMessage } from '../intent-resolver.js'
import { enforceSingleMatchToolTarget } from '../tool-target-enforcer.js'
import {
  shouldForceWorkerCoverLetter,
  formatCoverLetterResponse,
} from '../cover-letter-enforcer.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract _meta and is_template from a cover letter worker result.
 * Returns a normalized structure for logging and retry decisions.
 */
function extractCoverLetterSignals(result: Record<string, unknown>): {
  isTemplate: boolean
  generationMeta?: {
    provider?: string
    model?: string
    attempts?: number
    fallback_reason?: string | null
    latency_ms?: number
  }
} {
  const isTemplate = (result as { is_template?: boolean }).is_template ?? false
  const meta = (result as { _meta?: Record<string, unknown> })._meta
  if (!meta) return { isTemplate }
  return {
    isTemplate,
    generationMeta: {
      provider: meta['provider'] as string | undefined,
      model: meta['model'] as string | undefined,
      attempts: meta['attempts'] as number | undefined,
      fallback_reason: meta['fallback_reason'] as string | null | undefined,
      latency_ms: meta['latency_ms'] as number | undefined,
    },
  }
}

function requireNonEmptyAssistantMessage(content: string, context: string): string {
  const normalized = content.trim()
  if (!normalized) {
    throw new Error(`[chat] Empty assistant response (${context})`)
  }
  return normalized
}

/**
 * Strip any [Active briefing ground truth ...] block that Claude incorrectly
 * outputs, despite the system prompt prohibition. These blocks are injected
 * exclusively by platform infrastructure and must never appear in user-facing
 * responses. This is a last-resort defensive filter.
 */
function stripGroundingBlock(text: string): string {
  return text.replace(/\[Active briefing ground truth[\s\S]*$/, '').trim()
}

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

/**
 * Parse title and company from a raw careerclaw-js job object.
 *
 * HN job listings don't always have a separate title field — careerclaw-js often
 * returns an empty `title` and puts the full "Company — Role — Stack" string in
 * `company`. When that happens, split on ` — ` and use the first segment as
 * company and the second as the job title so the tracker row is clean.
 */
function parseJobFields(job: Record<string, unknown>): { title: string; company: string } {
  const rawTitle = (job['title'] as string) || ''
  const rawCompany = (job['company'] as string) || 'Unknown'
  if (!rawTitle && rawCompany.includes(' — ')) {
    const parts = rawCompany.split(' — ')
    return { company: (parts[0] ?? rawCompany).trim(), title: parts[1]?.trim() ?? 'Unknown' }
  }
  return { title: rawTitle || 'Unknown', company: rawCompany }
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

/**
 * Detect, filter, and strip false action claims from a format call output.
 * Returns the (possibly sanitized) text. Logs when claims are stripped.
 */
function sanitizeFormatOutput(
  text: string,
  toolsInvoked: string[],
  rid: string,
  callLabel: string,
): string {
  const rawClaims = detectFalseActionClaims(text)
  const falseClaims = filterFalseClaims(rawClaims, toolsInvoked)
  if (falseClaims.length === 0) return text

  logTextAudit({ rid, claims: falseClaims, toolsInvoked })
  const { sanitized, stripped } = sanitizeHallucinatedClaims(text, falseClaims)
  if (stripped) {
    console.warn(
      `[chat] P0: stripped ${falseClaims.length} false claim(s) from ${callLabel}`,
      JSON.stringify({ rid, claims: falseClaims }),
    )
  }
  return stripped ? sanitized : text
}

// ── Pending-action FIFO queue ─────────────────────────────────────────────────

type PendingAction =
  | { action: 'run_briefing' }
  | { action: 'run_gap_analysis'; jobId: string }
  | { action: 'run_cover_letter'; jobId: string }
  | { action: 'track_save'; jobId: string }

/**
 * Map unfulfilled intent labels to a FIFO pending-action queue.
 *
 * All queued actions target the same job as the primary tool invocation.
 * This is safe because `enforceSingleMatchToolTarget` — which runs before every
 * tool path — already blocks requests that reference more than one job
 * (returning `{ kind: 'clarify' }`). So if we reach queue-building, exactly one
 * job was active in the user's message and primaryJobId is authoritative.
 *
 * Ordering follows INTENT_PATTERNS priority: gap_analysis → cover_letter →
 * track_save — the correct execution sequence (gap feeds the cover letter;
 * save is always last).
 *
 * Returns an empty queue when primaryJobId is null (e.g. after a briefing
 * where no single job has been selected yet).
 */
function buildPendingQueue(unfulfilled: string[], primaryJobId: string | null): PendingAction[] {
  const queue: PendingAction[] = []
  for (const intent of unfulfilled) {
    if (intent === 'briefing') {
      // Briefing needs no jobId — always runs fresh against the user's profile
      queue.push({ action: 'run_briefing' })
    } else if (primaryJobId) {
      if (intent === 'gap_analysis') queue.push({ action: 'run_gap_analysis', jobId: primaryJobId })
      else if (intent === 'cover_letter')
        queue.push({ action: 'run_cover_letter', jobId: primaryJobId })
      else if (intent === 'track_save') queue.push({ action: 'track_save', jobId: primaryJobId })
    }
    // track_update and track_list require interactive parameters — not actionable as pending
  }
  return queue
}

/**
 * Execute the pending-action queue in FIFO order.
 *
 * State accumulates within the queue so later actions see results from
 * earlier ones — enabling the 3-action chain gap_analysis → cover_letter →
 * track_save in a single turn where the cover letter receives the gap result
 * computed just moments before.
 *
 * Pro-gated actions are silently skipped when the feature is absent — no
 * upgrade prompt mid-response; the user can ask explicitly.
 *
 * Returns the text to append to the primary response and a merged
 * Partial<SessionState> to persist alongside the primary state update.
 */
async function executePendingActions(
  queue: PendingAction[],
  opts: {
    sessionState: SessionState
    featureSet: Set<string>
    userId: string
    tier: 'free' | 'pro'
    features: string[]
    rid: string
    supabase: ReturnType<typeof createServerClient>
    sendProgress: (step: string, message: string) => Promise<void>
    /** Conversation context for LLM format calls on pending results. */
    baseMessages: Message[]
    /** Profile row from careerclaw_profiles — required for run_briefing pending actions. */
    profileRow: Record<string, unknown> | null
  },
): Promise<{ appendedText: string; stateUpdate: Partial<SessionState> }> {
  if (queue.length === 0) return { appendedText: '', stateUpdate: {} }

  await opts.sendProgress('working', 'Working on the rest of your request…')

  const textParts: string[] = []
  // Accumulate within this queue run so later items see earlier results
  const pendingGapResults: Record<string, Record<string, unknown>> = {}
  const pendingCoverLetterResults: Record<string, Record<string, unknown>> = {}
  let pendingBriefingState: Partial<SessionState> | null = null

  // Observability counters for queue-level summary
  let executed = 0
  let skipped = 0
  let failed = 0

  for (const item of queue) {
    const { action } = item

    if (action === 'run_briefing') {
      try {
        await opts.sendProgress('fetching', 'Fetching jobs…')
        const maxTopK = opts.featureSet.has('careerclaw.topk_extended') ? 10 : 3
        const workerResult = await runWorkerCareerclaw({
          assertion: issueSkillAssertion({
            userId: opts.userId,
            skill: 'careerclaw',
            tier: opts.tier,
            features: opts.features,
          }),
          input: {
            profile: {
              skills: (opts.profileRow?.['skills'] as string[] | null) ?? undefined,
              targetRoles: (opts.profileRow?.['target_roles'] as string[] | null) ?? undefined,
              experienceYears: opts.profileRow?.['experience_years'] as number | undefined,
              resumeSummary: (opts.profileRow?.['resume_summary'] as string | null) ?? undefined,
              workMode:
                (opts.profileRow?.['work_mode'] as
                  | 'remote'
                  | 'hybrid'
                  | 'onsite'
                  | null
                  | undefined) ?? undefined,
              salaryMin: opts.profileRow?.['salary_min'] as number | undefined,
              locationPref: opts.profileRow?.['location_pref'] as string | undefined,
            },
            resumeText: opts.profileRow?.['resume_text'] as string | undefined,
            topK: maxTopK,
          },
        })

        logWorkerSignal({
          rid: opts.rid,
          skill: 'careerclaw',
          action: 'briefing_pending',
          durationMs: workerResult.durationMs,
        })

        const briefing = workerResult.result
        const matches = (briefing['matches'] ?? []) as Array<Record<string, unknown>>

        // Build briefing session state — mirrors 7b path
        const briefingUpdate: Partial<SessionState> = {
          briefing: {
            cachedAt: new Date().toISOString(),
            matches: matches.map((m) => {
              const job = (m['job'] ?? {}) as Record<string, unknown>
              return {
                job_id: (job['job_id'] as string) ?? '',
                ...parseJobFields(job),
                score: (m['score'] as number) ?? 0,
                url: (job['url'] as string | null) ?? null,
              }
            }),
            matchData: matches.map((m) => ({
              job: (m['job'] ?? {}) as Record<string, unknown>,
              score: (m['score'] ?? 0) as number,
              breakdown: (m['breakdown'] ?? {}) as Record<string, number>,
              matched_keywords: (m['matched_keywords'] ?? []) as string[],
              gap_keywords: (m['gap_keywords'] ?? []) as string[],
            })),
            resumeIntel: briefing['resume_intel']
              ? (briefing['resume_intel'] as Record<string, unknown>)
              : opts.profileRow
                ? {
                    extracted_keywords: (opts.profileRow['skills'] as string[] | null) ?? [],
                    extracted_phrases: [],
                    keyword_stream: (opts.profileRow['skills'] as string[] | null) ?? [],
                    phrase_stream: [],
                    impact_signals: (opts.profileRow['skills'] as string[] | null) ?? [],
                    keyword_weights: Object.fromEntries(
                      ((opts.profileRow['skills'] as string[] | null) ?? []).map((s: string) => [
                        s,
                        1.0,
                      ]),
                    ),
                    phrase_weights: {},
                    source: 'skills_injected',
                  }
                : {},
            profile: opts.profileRow
              ? {
                  skills: (opts.profileRow['skills'] as string[] | null) ?? [],
                  targetRoles: (opts.profileRow['target_roles'] as string[] | null) ?? [],
                  experienceYears: opts.profileRow['experience_years'] as number | undefined,
                  resumeSummary: (opts.profileRow['resume_summary'] as string | null) ?? undefined,
                  workMode:
                    (opts.profileRow['work_mode'] as
                      | 'remote'
                      | 'hybrid'
                      | 'onsite'
                      | null
                      | undefined) ?? undefined,
                  salaryMin: opts.profileRow['salary_min'] as number | undefined,
                  locationPref: opts.profileRow['location_pref'] as string | undefined,
                }
              : {},
            resumeText: opts.profileRow
              ? ((opts.profileRow['resume_text'] as string | null) ?? null)
              : null,
          },
        }
        pendingBriefingState = briefingUpdate

        await opts.sendProgress('scoring', 'Scoring matches…')

        // Format via LLM
        let formattedSection: string
        try {
          const formatResult = await callLLMWithToolResult(
            CAREERCLAW_SYSTEM_PROMPT,
            opts.baseMessages,
            `pending-briefing-${opts.rid}`,
            'run_careerclaw',
            { topK: maxTopK },
            {
              ...workerResult.result,
              _meta: {
                tier: opts.tier,
                topK: maxTopK,
                includeOutreach: opts.tier === 'free',
                includeCoverLetter: opts.featureSet.has('careerclaw.tailored_cover_letter'),
                includeGapAnalysis: opts.featureSet.has('careerclaw.resume_gap_analysis'),
              },
            },
            opts.rid,
            'briefing_pending_format',
          )
          formattedSection = sanitizeFormatOutput(
            requireNonEmptyAssistantMessage(formatResult.content, 'briefing_pending_format'),
            ['run_careerclaw'],
            opts.rid,
            'briefing_pending_format',
          )
        } catch (formatErr) {
          console.error(
            '[chat] Pending briefing format call failed:',
            formatErr instanceof Error ? formatErr.message : String(formatErr),
          )
          formattedSection = `**Job Search Results:** Found ${matches.length} match${matches.length === 1 ? '' : 'es'}.`
        }
        textParts.push(`\n\n---\n\n${formattedSection}`)

        console.log(
          JSON.stringify({
            event: 'forensic_pending_action',
            rid: opts.rid,
            action: 'run_briefing',
            status: 'success',
          }),
        )
        executed++
      } catch (err) {
        failed++
        console.error(
          '[chat] Pending briefing failed:',
          err instanceof Error ? err.message : String(err),
        )
        console.log(
          JSON.stringify({
            event: 'forensic_pending_action',
            rid: opts.rid,
            action: 'run_briefing',
            status: 'error',
          }),
        )
      }
    } else if (action === 'run_gap_analysis') {
      const jobId = (item as { action: 'run_gap_analysis'; jobId: string }).jobId
      if (!opts.featureSet.has('careerclaw.resume_gap_analysis')) {
        console.log(
          JSON.stringify({
            event: 'forensic_pending_action',
            rid: opts.rid,
            action,
            status: 'skipped',
            reason: 'pro_gate',
            jobId,
          }),
        )
        skipped++
        continue
      }
      const cached = getMatchFromState(opts.sessionState, jobId)
      if (!cached) {
        console.log(
          JSON.stringify({
            event: 'forensic_pending_action',
            rid: opts.rid,
            action,
            status: 'skipped',
            reason: 'no_match',
            jobId,
          }),
        )
        skipped++
        continue
      }

      try {
        await opts.sendProgress('analyzing', 'Running gap analysis...')
        const workerResult = await runWorkerGapAnalysis({
          assertion: issueSkillAssertion({
            userId: opts.userId,
            skill: 'careerclaw',
            tier: opts.tier,
            features: opts.features,
          }),
          input: { match: cached.matchData, resumeIntel: cached.resumeIntel },
        })
        logWorkerSignal({
          rid: opts.rid,
          skill: 'careerclaw',
          action: 'gap_analysis_pending',
          durationMs: workerResult.durationMs,
        })

        const gapResult = workerResult.result
        const gapAnalysis = (gapResult as { analysis?: Record<string, unknown> }).analysis
        if (gapAnalysis) pendingGapResults[jobId] = gapAnalysis

        // Inject briefing_match_score so Claude can label the two metrics distinctly
        const briefingMatchScore = opts.sessionState.briefing?.matches.find(
          (m) => m.job_id === jobId,
        )?.score
        const gapResultForFormat =
          briefingMatchScore != null
            ? { ...gapResult, briefing_match_score: briefingMatchScore }
            : gapResult

        // Format via LLM; fall back to a minimal markdown summary if the call fails
        let formattedSection: string
        try {
          const formatResult = await callLLMWithToolResult(
            CAREERCLAW_SYSTEM_PROMPT,
            opts.baseMessages,
            `pending-gap-${jobId}`,
            'run_gap_analysis',
            { job_id: jobId },
            gapResultForFormat,
            opts.rid,
            'gap_analysis_pending_format',
          )
          formattedSection = sanitizeFormatOutput(
            requireNonEmptyAssistantMessage(formatResult.content, 'gap_analysis_pending_format'),
            ['run_gap_analysis'],
            opts.rid,
            'gap_analysis_pending_format',
          )
        } catch (formatErr) {
          console.error(
            '[chat] Pending gap format call failed:',
            formatErr instanceof Error ? formatErr.message : String(formatErr),
          )
          const fitScore = gapAnalysis?.['fit_score'] as number | undefined
          const matched = (gapAnalysis?.['matched_keywords'] as string[] | undefined) ?? []
          const gaps = (gapAnalysis?.['gap_keywords'] as string[] | undefined) ?? []
          const lines = [`**Gap analysis for ${cached.entry.company}:**`]
          if (briefingMatchScore != null)
            lines.push(`- Overall match: ${Math.round(briefingMatchScore * 100)}%`)
          if (fitScore != null) lines.push(`- Keyword coverage: ${Math.round(fitScore * 100)}%`)
          if (matched.length > 0) lines.push(`- Matched: ${matched.slice(0, 8).join(', ')}`)
          if (gaps.length > 0) lines.push(`- Gaps: ${gaps.slice(0, 5).join(', ')}`)
          formattedSection = lines.join('\n')
        }
        textParts.push(`\n\n---\n\n${formattedSection}`)

        console.log(
          JSON.stringify({
            event: 'forensic_pending_action',
            rid: opts.rid,
            action: 'run_gap_analysis',
            status: 'success',
            jobId,
          }),
        )
        executed++
      } catch (err) {
        failed++
        console.error(
          '[chat] Pending gap analysis failed:',
          err instanceof Error ? err.message : String(err),
        )
        console.log(
          JSON.stringify({
            event: 'forensic_pending_action',
            rid: opts.rid,
            action: 'run_gap_analysis',
            status: 'error',
            jobId,
          }),
        )
      }
    } else if (action === 'run_cover_letter') {
      const jobId = (item as { action: 'run_cover_letter'; jobId: string }).jobId
      if (!opts.featureSet.has('careerclaw.tailored_cover_letter')) {
        console.log(
          JSON.stringify({
            event: 'forensic_pending_action',
            rid: opts.rid,
            action,
            status: 'skipped',
            reason: 'pro_gate',
            jobId,
          }),
        )
        skipped++
        continue
      }
      const cached = getMatchFromState(opts.sessionState, jobId)
      if (!cached) {
        console.log(
          JSON.stringify({
            event: 'forensic_pending_action',
            rid: opts.rid,
            action,
            status: 'skipped',
            reason: 'no_match',
            jobId,
          }),
        )
        skipped++
        continue
      }

      try {
        await opts.sendProgress('writing', 'Generating cover letter...')
        // Use gap result from earlier in this queue run, then fall back to session state
        const precomputedGap =
          pendingGapResults[jobId] ?? getGapResultFromState(opts.sessionState, jobId)

        const workerResult = await runWorkerCoverLetter({
          assertion: issueSkillAssertion({
            userId: opts.userId,
            skill: 'careerclaw',
            tier: opts.tier,
            features: opts.features,
          }),
          input: {
            match: cached.matchData,
            profile: cached.profile as Record<string, unknown> & {
              skills?: string[]
              targetRoles?: string[]
            },
            resumeIntel: cached.resumeIntel,
            ...(cached.resumeText ? { resumeText: cached.resumeText } : {}),
            ...(precomputedGap ? { precomputedGap } : {}),
          },
        })

        const coverLetterResult = workerResult.result
        const signals = extractCoverLetterSignals(coverLetterResult)
        pendingCoverLetterResults[jobId] = coverLetterResult

        logWorkerSignal({
          rid: opts.rid,
          skill: 'careerclaw',
          action: 'cover_letter_pending',
          isTemplate: signals.isTemplate,
          durationMs: workerResult.durationMs,
          generationMeta: signals.generationMeta,
        })

        // Format via LLM; fall back to raw body if the call fails
        let formattedSection: string
        try {
          const formatResult = await callLLMWithToolResult(
            CAREERCLAW_SYSTEM_PROMPT,
            opts.baseMessages,
            `pending-cl-${jobId}`,
            'run_cover_letter',
            { job_id: jobId },
            coverLetterResult,
            opts.rid,
            'cover_letter_pending_format',
          )
          formattedSection = sanitizeFormatOutput(
            requireNonEmptyAssistantMessage(formatResult.content, 'cover_letter_pending_format'),
            ['run_cover_letter'],
            opts.rid,
            'cover_letter_pending_format',
          )
        } catch (formatErr) {
          console.error(
            '[chat] Pending cover letter format call failed:',
            formatErr instanceof Error ? formatErr.message : String(formatErr),
          )
          const body = (coverLetterResult['body'] as string) ?? ''
          formattedSection =
            `**Cover letter for ${cached.entry.company}:**\n\n${body}` +
            (signals.isTemplate
              ? '\n\n*This is a template version — retry for a more personalized version.*'
              : '')
        }
        textParts.push(`\n\n---\n\n${formattedSection}`)

        console.log(
          JSON.stringify({
            event: 'forensic_pending_action',
            rid: opts.rid,
            action: 'run_cover_letter',
            status: 'success',
            jobId,
          }),
        )
        executed++
      } catch (err) {
        failed++
        console.error(
          '[chat] Pending cover letter failed:',
          err instanceof Error ? err.message : String(err),
        )
        console.log(
          JSON.stringify({
            event: 'forensic_pending_action',
            rid: opts.rid,
            action: 'run_cover_letter',
            status: 'error',
            jobId,
          }),
        )
      }
    } else if (action === 'track_save') {
      const jobId = (item as { action: 'track_save'; jobId: string }).jobId
      const cached = getMatchFromState(opts.sessionState, jobId)
      if (!cached) {
        console.log(
          JSON.stringify({
            event: 'forensic_pending_action',
            rid: opts.rid,
            action,
            status: 'skipped',
            reason: 'no_match',
            jobId,
          }),
        )
        skipped++
        continue
      }

      try {
        await opts.sendProgress('tracking', 'Saving to tracker...')
        const { error } = await opts.supabase.from('careerclaw_job_tracking').upsert(
          {
            user_id: opts.userId,
            job_id: cached.entry.job_id,
            title: cached.entry.title,
            company: cached.entry.company,
            status: 'saved',
            url: cached.entry.url ?? null,
          },
          { onConflict: 'user_id,job_id', ignoreDuplicates: true },
        )
        if (!error) {
          textParts.push(
            `\n\nDone — ${cached.entry.title} at ${cached.entry.company} is saved to your tracker.`,
          )
          console.log(
            JSON.stringify({
              event: 'forensic_pending_action',
              rid: opts.rid,
              action: 'track_save',
              status: 'success',
              jobId,
            }),
          )
          executed++
        } else {
          failed++
          console.error('[chat] Pending track_save Supabase error:', error.message)
          console.log(
            JSON.stringify({
              event: 'forensic_pending_action',
              rid: opts.rid,
              action: 'track_save',
              status: 'error',
              jobId,
              supabase_code: error.code,
            }),
          )
        }
      } catch (err) {
        failed++
        console.error(
          '[chat] Pending track_save failed:',
          err instanceof Error ? err.message : String(err),
        )
        console.log(
          JSON.stringify({
            event: 'forensic_pending_action',
            rid: opts.rid,
            action: 'track_save',
            status: 'error',
            jobId,
          }),
        )
      }
    }
  }

  // Queue-level summary — one log entry per request covering all pending items
  console.log(
    JSON.stringify({
      event: 'forensic_pending_queue',
      rid: opts.rid,
      queue_length: queue.length,
      executed,
      skipped,
      failed,
    }),
  )

  // Merge all pending state updates — briefing replaces, gap/cover results merge additively
  let stateUpdate: Partial<SessionState> = {
    ...(Object.keys(pendingGapResults).length > 0 ? { gapResults: pendingGapResults } : {}),
    ...(Object.keys(pendingCoverLetterResults).length > 0
      ? { coverLetterResults: pendingCoverLetterResults }
      : {}),
  }
  if (pendingBriefingState) {
    stateUpdate = mergeSessionState(stateUpdate as SessionState, pendingBriefingState)
  }
  return { appendedText: textParts.join(''), stateUpdate }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function chatHandler(c: Context): Promise<Response> {
  const startMs = Date.now()
  const userId = c.get('userId') as string
  const rid = generateRequestId()

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

  const { channel, message, sessionId, newSession } = parseResult.data

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

      // newSession: true means the user explicitly started a new conversation.
      // Skip loading any existing session so history and state don't bleed across.
      const session = newSession ? null : await loadSession(userId, channel as Channel, sessionId)
      const history: Message[] = session ? pruneMessages(session.messages) : []
      const activeSessionId = session?.id
      const sessionState: SessionState = session?.state ?? {}

      /** Save a short gate message and send it as the final SSE event. */
      const sendGatedResponse = async (gateMsg: string): Promise<void> => {
        const savedId = await saveSession(
          userId,
          channel as Channel,
          [
            ...history,
            { role: 'user', content: message, timestamp: new Date().toISOString() },
            { role: 'assistant', content: gateMsg, timestamp: new Date().toISOString() },
          ],
          activeSessionId,
          undefined,
          sessionState,
        )
        await sendDone(savedId, gateMsg)
      }

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

      // Single message list used by both the first-turn call and all second-turn
      // tool-result calls. Never contains injected grounding/hint content — those
      // are appended to the system prompt instead so they cannot be reproduced in
      // Claude's output or saved into session history.
      const baseMessages: Message[] = [
        ...history,
        { role: 'user', content: message, timestamp: new Date().toISOString() },
      ]

      // ── 4b. Build effective system prompt with grounded briefing context ──
      // Grounding, reference hints, and resolved-intent hints are appended to the
      // system prompt rather than injected as role:'assistant' messages. This
      // prevents Claude from treating them as prior output it should reproduce, and
      // ensures they are never persisted to session history.
      let effectiveSystemPrompt = CAREERCLAW_SYSTEM_PROMPT
      if (sessionState.briefing && sessionState.briefing.matches.length > 0) {
        const contextBlocks = [
          buildActiveBriefingGroundingMessage(sessionState),
          buildReferencedMatchesHint(message, sessionState),
          buildResolvedIntentMessage(message, sessionState),
        ].filter(Boolean) as string[]

        if (contextBlocks.length > 0) {
          effectiveSystemPrompt = CAREERCLAW_SYSTEM_PROMPT + '\n\n' + contextBlocks.join('\n\n')
        }
      }

      // ── 5. First Claude call — all tools available ────────────────────────
      await sendProgress('thinking', 'Thinking...')

      // Detect user intents before the LLM call for post-turn audit
      const detectedIntents = detectUserIntents(message)

      const llmResult = await callLLM(
        effectiveSystemPrompt,
        baseMessages,
        [RUN_CAREERCLAW_TOOL, RUN_GAP_ANALYSIS_TOOL, RUN_COVER_LETTER_TOOL, TRACK_APPLICATION_TOOL],
        rid,
        'first_turn',
      )

      // ── 6. Profile gate — keyed on Claude's tool decision ────────────────
      if (
        llmResult.type === 'tool_use' &&
        (llmResult.toolName === 'run_careerclaw' ||
          llmResult.toolName === 'run_gap_analysis' ||
          llmResult.toolName === 'run_cover_letter') &&
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

      // Forensic: intent audit — unified capture for ALL response paths.
      // The result is used downstream for hallucination detection (Part A)
      // and pending-action auto-execution (Part B).
      const intentAudit = logIntentAudit({
        rid,
        detectedIntents,
        toolsInvoked: llmResult.type === 'tool_use' ? [llmResult.toolName] : [],
        responseType: llmResult.type === 'tool_use' ? 'tool_use' : 'text',
      })

      // ── 7a. Direct text response ─────────────────────────────────────────
      if (llmResult.type === 'text') {
        let finalText: string
        try {
          finalText = requireNonEmptyAssistantMessage(
            stripGroundingBlock(llmResult.content),
            'direct_response',
          )
        } catch (err) {
          console.error(
            '[chat] Direct Claude response error:',
            err instanceof Error ? err.message : String(err),
          )
          logAudit({
            userId,
            skill: 'none',
            channel,
            status: 'error',
            statusCode: 500,
            durationMs: Date.now() - startMs,
          })
          await sendError('LLM_ERROR', 'Failed to generate a response. Please try again.')
          return
        }

        // P0 Part A — detect and strip hallucinated action claims.
        // No tools were invoked in the text path, so ALL detected claims are false.
        finalText = sanitizeFormatOutput(finalText, [], rid, 'text_response')

        // ── P1a: Cover letter worker bypass prevention ──────────────────────
        // If the user asked to rewrite/revise a cover letter AND a previous
        // cover letter exists in session state, reject the text response and
        // force the worker path. This prevents the LLM from generating cover
        // letters from memory instead of using the worker pipeline.
        const enforcer = shouldForceWorkerCoverLetter(message, sessionState)
        if (enforcer.shouldEnforce && enforcer.jobId) {
          console.log(
            JSON.stringify({
              event: 'forensic_cover_letter_enforced',
              rid,
              jobId: enforcer.jobId,
              company: enforcer.company,
              reason: 'text_response_rejected_rewrite_detected',
            }),
          )

          // Pro gate — same check as 7d
          if (!featureSet.has('careerclaw.tailored_cover_letter')) {
            await sendGatedResponse(
              'Tailored cover letters are a Pro feature. Upgrade in Settings > Billing to unlock them.',
            )
            return
          }

          const cached = getMatchFromState(sessionState, enforcer.jobId)
          if (!cached) {
            // Match data gone (shouldn't happen if coverLetterResults exists) — let text through
            console.warn(
              '[chat] P1a: enforcer fired but match data missing, falling through to text',
            )
          } else {
            await sendProgress('writing', 'Regenerating cover letter...')

            const assertion = issueSkillAssertion({
              userId,
              skill: 'careerclaw',
              tier: entitlements.effectiveTier,
              features: entitlements.features,
            })

            const precomputedGap = getGapResultFromState(sessionState, enforcer.jobId)

            try {
              const enforcerWorkerInput = {
                assertion,
                input: {
                  match: cached.matchData,
                  profile: cached.profile as Record<string, unknown> & {
                    skills?: string[]
                    targetRoles?: string[]
                  },
                  resumeIntel: cached.resumeIntel,
                  ...(cached.resumeText ? { resumeText: cached.resumeText } : {}),
                  ...(precomputedGap ? { precomputedGap } : {}),
                },
              }

              const workerResult = await runWorkerCoverLetter(enforcerWorkerInput)
              let effectiveResult = workerResult.result

              // Forensic: log worker quality signal with generation metadata
              const signals = extractCoverLetterSignals(effectiveResult)
              logWorkerSignal({
                rid,
                skill: 'careerclaw',
                action: 'cover_letter_enforced',
                isTemplate: signals.isTemplate,
                durationMs: workerResult.durationMs,
                generationMeta: signals.generationMeta,
              })

              // P1b: Template retry — same logic as 7d path.
              // The enforcer fires on rewrite requests, so template quality matters.
              if (signals.isTemplate && precomputedGap) {
                console.log(
                  JSON.stringify({
                    event: 'forensic_cover_letter_template_retry',
                    rid,
                    jobId: enforcer.jobId,
                    reason: 'is_template_with_precomputed_gap_enforced',
                  }),
                )

                await sendProgress('writing', 'Refining cover letter...')

                try {
                  const retryResult = await runWorkerCoverLetter({
                    assertion: issueSkillAssertion({
                      userId,
                      skill: 'careerclaw',
                      tier: entitlements.effectiveTier,
                      features: entitlements.features,
                    }),
                    input: enforcerWorkerInput.input,
                  })
                  const retrySignals = extractCoverLetterSignals(retryResult.result)

                  logWorkerSignal({
                    rid,
                    skill: 'careerclaw',
                    action: 'cover_letter_enforced_retry',
                    isTemplate: retrySignals.isTemplate,
                    durationMs: retryResult.durationMs,
                    generationMeta: retrySignals.generationMeta,
                  })

                  if (!retrySignals.isTemplate) {
                    effectiveResult = retryResult.result
                  }
                } catch (retryErr) {
                  console.warn(
                    '[chat] P1b: enforced cover letter retry failed, using original template',
                    retryErr instanceof Error ? retryErr.message : String(retryErr),
                  )
                }
              }

              // Format deterministically — no second LLM call
              const formattedResponse = formatCoverLetterResponse(
                effectiveResult,
                enforcer.company ?? cached.entry.company,
              )

              // P0 Part B — pending-action queue.
              // The enforcer fires on text responses (no toolInput.also_execute available),
              // so intent detection is the fallback here. This path only triggers for
              // cover-letter rewrites, which rarely combine with other actions.
              const enforcerQueue = buildPendingQueue(intentAudit.unfulfilled, enforcer.jobId)
              const { appendedText: enforcerPendingText, stateUpdate: enforcerPendingState } =
                await executePendingActions(enforcerQueue, {
                  sessionState,
                  featureSet,
                  userId,
                  tier: entitlements.effectiveTier,
                  features: entitlements.features,
                  rid,
                  supabase,
                  sendProgress,
                  baseMessages,
                  profileRow: profileRow as Record<string, unknown> | null,
                })
              const enforcerFinalOutput = formattedResponse + enforcerPendingText

              // Save session with updated cover letter results + any pending state
              const coverLetterStateUpdate: Partial<SessionState> = mergeSessionState(
                { coverLetterResults: { [enforcer.jobId]: effectiveResult } } as SessionState,
                enforcerPendingState,
              )
              const savedId = await saveSession(
                userId,
                channel as Channel,
                [
                  ...history,
                  { role: 'user', content: message, timestamp: new Date().toISOString() },
                  {
                    role: 'assistant',
                    content: enforcerFinalOutput,
                    timestamp: new Date().toISOString(),
                  },
                ],
                activeSessionId,
                coverLetterStateUpdate,
                sessionState,
              )

              logAudit({
                userId,
                skill: 'careerclaw',
                channel,
                status: 'success',
                statusCode: 200,
                durationMs: Date.now() - startMs,
              })

              await sendDone(savedId, enforcerFinalOutput)
              return
            } catch (err) {
              // Worker failed — log and fall through to the original text response
              console.error(
                '[chat] P1a: cover letter worker failed during enforcement, falling through to text',
                err instanceof Error ? err.message : String(err),
              )
            }
          }
        }
        // ── End P1a ─────────────────────────────────────────────────────────

        const updatedMessages: Message[] = [
          ...history,
          { role: 'user', content: message, timestamp: new Date().toISOString() },
          { role: 'assistant', content: finalText, timestamp: new Date().toISOString() },
        ]

        const savedId = await saveSession(
          userId,
          channel as Channel,
          updatedMessages,
          activeSessionId,
          undefined,
          sessionState,
        )

        logAudit({
          userId,
          skill: 'none',
          channel,
          status: 'success',
          statusCode: 200,
          durationMs: Date.now() - startMs,
        })

        await sendDone(savedId, finalText)
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

        // Forensic: log briefing worker signal
        logWorkerSignal({
          rid,
          skill: 'careerclaw',
          action: 'briefing',
          durationMs: workerResult.durationMs,
        })

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

        // Build session state update for post-briefing tools (gap analysis, cover letter).
        // Always define `briefing` so mergeSessionState unconditionally replaces the previous
        // briefing and clears stale gapResults — even on a zero-match run. Without this,
        // a no-match run leaves the old briefing intact and downstream tools can resolve
        // stale job_ids from an earlier search.
        const matches = (briefing['matches'] ?? []) as Array<Record<string, unknown>>
        const briefingStateUpdate: Partial<SessionState> = {
          briefing: {
            cachedAt: new Date().toISOString(),
            matches:
              matches.length > 0
                ? matches.map((m) => {
                    const job = (m['job'] ?? {}) as Record<string, unknown>
                    return {
                      job_id: (job['job_id'] as string) ?? '',
                      ...parseJobFields(job),
                      score: (m['score'] as number) ?? 0,
                      url: (job['url'] as string | null) ?? null,
                    }
                  })
                : [],
            matchData:
              matches.length > 0
                ? matches.map((m) => ({
                    job: (m['job'] ?? {}) as Record<string, unknown>,
                    score: (m['score'] ?? 0) as number,
                    breakdown: (m['breakdown'] ?? {}) as Record<string, number>,
                    matched_keywords: (m['matched_keywords'] ?? []) as string[],
                    gap_keywords: (m['gap_keywords'] ?? []) as string[],
                  }))
                : [],
            // Prefer resume_intel from the briefing result (careerclaw-js ≥1.5).
            // Fall back to synthesising from profileRow.skills for older worker versions
            // (e.g. during rolling deploys) so post-briefing tools always receive a
            // structurally valid ResumeIntelligence and pass ResumeIntelSchema validation.
            resumeIntel: briefing['resume_intel']
              ? (briefing['resume_intel'] as Record<string, unknown>)
              : profileRow
                ? {
                    extracted_keywords: (profileRow.skills as string[] | null) ?? [],
                    extracted_phrases: [],
                    keyword_stream: (profileRow.skills as string[] | null) ?? [],
                    phrase_stream: [],
                    impact_signals: (profileRow.skills as string[] | null) ?? [],
                    keyword_weights: Object.fromEntries(
                      ((profileRow.skills as string[] | null) ?? []).map((s: string) => [s, 1.0]),
                    ),
                    phrase_weights: {},
                    source: 'skills_injected',
                  }
                : {},
            profile: profileRow
              ? {
                  skills: (profileRow.skills as string[] | null) ?? [],
                  targetRoles: (profileRow.target_roles as string[] | null) ?? [],
                  experienceYears: profileRow.experience_years ?? undefined,
                  resumeSummary: (profileRow.resume_summary as string | null) ?? undefined,
                  workMode:
                    (profileRow.work_mode as 'remote' | 'hybrid' | 'onsite' | null) ?? undefined,
                  salaryMin: profileRow.salary_min ?? undefined,
                  locationPref: profileRow.location_pref ?? undefined,
                }
              : {},
            resumeText: profileRow ? ((profileRow.resume_text as string | null) ?? null) : null,
          },
        }

        await sendProgress(
          'drafting',
          effectiveTier === 'free' ? 'Drafting outreach...' : 'Formatting results...',
        )

        let formattedResponse: string
        try {
          const formatResult = await callLLMWithToolResult(
            CAREERCLAW_SYSTEM_PROMPT,
            baseMessages,
            llmResult.toolUseId,
            llmResult.toolName,
            toolInput,
            {
              ...workerResult.result,
              _meta: {
                tier: effectiveTier,
                topK,
                includeOutreach: effectiveTier === 'free',
                includeCoverLetter: featureSet.has('careerclaw.tailored_cover_letter'),
                includeGapAnalysis: featureSet.has('careerclaw.resume_gap_analysis'),
              },
            },
            rid,
            'run_careerclaw_format',
          )
          formattedResponse = requireNonEmptyAssistantMessage(
            stripGroundingBlock(formatResult.content),
            'run_careerclaw_format',
          )
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

        // P0 Part A — detect and strip hallucinated claims from format output
        formattedResponse = sanitizeFormatOutput(
          formattedResponse,
          ['run_careerclaw'],
          rid,
          'run_careerclaw_format',
        )

        // P0 Part B — pending-action queue driven by Claude's also_execute declaration.
        // primaryJobId is the top match so pending gap/cover/save target a concrete job.
        const briefingTopJobId = briefingStateUpdate.briefing?.matches[0]?.job_id ?? null
        const briefingAlsoExecute = (toolInput.also_execute as string[] | undefined) ?? []
        const briefingQueue = buildPendingQueue(briefingAlsoExecute, briefingTopJobId)
        const mergedStateForBriefingPending = mergeSessionState(sessionState, briefingStateUpdate)
        const { appendedText: briefingPendingText, stateUpdate: briefingPendingState } =
          await executePendingActions(briefingQueue, {
            sessionState: mergedStateForBriefingPending,
            featureSet,
            userId,
            tier: entitlements.effectiveTier,
            features: entitlements.features,
            rid,
            supabase,
            sendProgress,
            baseMessages,
            profileRow: profileRow as Record<string, unknown> | null,
          })
        const briefingFinalOutput = formattedResponse + briefingPendingText

        const mergedBriefingState: Partial<SessionState> = mergeSessionState(
          briefingStateUpdate as SessionState,
          briefingPendingState,
        )

        const updatedMessages: Message[] = [
          ...history,
          { role: 'user', content: message, timestamp: new Date().toISOString() },
          { role: 'assistant', content: briefingFinalOutput, timestamp: new Date().toISOString() },
        ]

        const savedId = await saveSession(
          userId,
          channel as Channel,
          updatedMessages,
          activeSessionId,
          mergedBriefingState,
          sessionState,
        )

        logAudit({
          userId,
          skill: 'careerclaw',
          channel,
          status: 'success',
          statusCode: 200,
          durationMs: Date.now() - startMs,
        })

        await sendDone(savedId, briefingFinalOutput)
        return
      }

      // ── 7c. run_gap_analysis tool (Pro only) ─────────────────────────────
      if (llmResult.toolName === 'run_gap_analysis') {
        const toolInput = llmResult.toolInput as RunGapAnalysisInput

        // Pro gate
        if (!featureSet.has('careerclaw.resume_gap_analysis')) {
          await sendGatedResponse(
            'Resume gap analysis is a Pro feature. Upgrade in Settings > Billing to unlock it.',
          )
          return
        }

        const enforcedTarget = enforceSingleMatchToolTarget({
          toolName: 'run_gap_analysis',
          message,
          state: sessionState,
          toolInput,
        })
        if (enforcedTarget.kind === 'clarify') {
          await sendGatedResponse(enforcedTarget.message)
          return
        }

        const jobId = enforcedTarget.jobId
        const effectiveToolInput: RunGapAnalysisInput = {
          job_id: jobId,
          // Signal pending actions via _server_handles instead of also_execute.
          // Carrying also_execute caused Claude to generate cover letter / tracker content
          // inside the gap format response (duplicate output). _server_handles tells Claude
          // "these are queued server-side — format only this tool's result", per the system
          // prompt's also_execute section, without triggering content generation.
          ...(toolInput.also_execute?.length ? { _server_handles: toolInput.also_execute } : {}),
        }

        // Look up match from session state
        const cached = getMatchFromState(sessionState, jobId)
        if (!cached) {
          await sendGatedResponse(
            "I couldn't match that to your current briefing. Tell me the company name or match number.",
          )
          return
        }

        await sendProgress('analyzing', 'Running gap analysis...')

        const assertion = issueSkillAssertion({
          userId,
          skill: 'careerclaw',
          tier: entitlements.effectiveTier,
          features: entitlements.features,
        })

        let gapResult: Record<string, unknown>
        try {
          const workerResult = await runWorkerGapAnalysis({
            assertion,
            input: {
              match: cached.matchData,
              resumeIntel: cached.resumeIntel,
            },
          })
          gapResult = workerResult.result

          // Forensic: log gap analysis worker signal
          logWorkerSignal({
            rid,
            skill: 'careerclaw',
            action: 'gap_analysis',
            durationMs: workerResult.durationMs,
          })
        } catch (err) {
          console.error(
            '[chat] Gap analysis worker error:',
            err instanceof Error ? err.message : String(err),
          )
          await sendError(
            'WORKER_ERROR',
            'The gap analysis encountered an error. Please try again.',
          )
          return
        }

        // Build state update — cache gap result for cover letter reuse
        const gapAnalysis = (gapResult as { analysis?: Record<string, unknown> }).analysis

        // Step 1 — augment the tool result with the briefing match score so
        // Claude can label the two metrics distinctly in its format response:
        // "Overall match" (multi-factor briefing score) vs "Keyword coverage"
        // (gap-analysis fit_score). Without this, Claude only sees fit_score.
        const briefingMatchScore = sessionState.briefing?.matches.find(
          (m) => m.job_id === jobId,
        )?.score
        const gapResultForFormat =
          briefingMatchScore != null
            ? { ...gapResult, briefing_match_score: briefingMatchScore }
            : gapResult

        // Format via second Claude call
        let formattedResponse: string
        try {
          const formatResult = await callLLMWithToolResult(
            CAREERCLAW_SYSTEM_PROMPT,
            baseMessages,
            llmResult.toolUseId,
            llmResult.toolName,
            effectiveToolInput,
            gapResultForFormat,
            rid,
            'gap_analysis_format',
          )
          formattedResponse = requireNonEmptyAssistantMessage(
            formatResult.content,
            'gap_analysis_format',
          )
        } catch (err) {
          console.error(
            '[chat] Second Claude call (gap analysis format) error:',
            err instanceof Error ? err.message : String(err),
          )
          await sendError('LLM_ERROR', 'Failed to format gap analysis. Please try again.')
          return
        }

        // P0 Part A — sanitize hallucinated claims from format output
        formattedResponse = sanitizeFormatOutput(
          formattedResponse,
          ['run_gap_analysis'],
          rid,
          'gap_analysis_format',
        )

        // P0 Part B — pending-action queue driven by Claude's also_execute declaration
        const gapAlsoExecute = toolInput.also_execute ?? []
        const gapQueue = buildPendingQueue(gapAlsoExecute, jobId)
        const { appendedText: gapPendingText, stateUpdate: gapPendingState } =
          await executePendingActions(gapQueue, {
            sessionState,
            featureSet,
            userId,
            tier: entitlements.effectiveTier,
            features: entitlements.features,
            rid,
            supabase,
            sendProgress,
            baseMessages,
            profileRow: profileRow as Record<string, unknown> | null,
          })
        const gapFinalOutput = formattedResponse + gapPendingText

        // Merge primary gap result with any state produced by pending actions
        const mergedGapState: Partial<SessionState> = mergeSessionState(
          gapAnalysis
            ? ({ gapResults: { [jobId]: gapAnalysis } } as SessionState)
            : ({} as SessionState),
          gapPendingState,
        )

        const updatedMessages: Message[] = [
          ...history,
          { role: 'user', content: message, timestamp: new Date().toISOString() },
          { role: 'assistant', content: gapFinalOutput, timestamp: new Date().toISOString() },
        ]
        const savedId = await saveSession(
          userId,
          channel as Channel,
          updatedMessages,
          activeSessionId,
          mergedGapState,
          sessionState,
        )

        logAudit({
          userId,
          skill: 'careerclaw',
          channel,
          status: 'success',
          statusCode: 200,
          durationMs: Date.now() - startMs,
        })

        await sendDone(savedId, gapFinalOutput)
        return
      }

      // ── 7d. run_cover_letter tool (Pro only) ─────────────────────────────
      if (llmResult.toolName === 'run_cover_letter') {
        const toolInput = llmResult.toolInput as RunCoverLetterInput

        // Pro gate
        if (!featureSet.has('careerclaw.tailored_cover_letter')) {
          await sendGatedResponse(
            'Tailored cover letters are a Pro feature. Upgrade in Settings > Billing to unlock them.',
          )
          return
        }

        const enforcedTarget = enforceSingleMatchToolTarget({
          toolName: 'run_cover_letter',
          message,
          state: sessionState,
          toolInput,
        })
        if (enforcedTarget.kind === 'clarify') {
          await sendGatedResponse(enforcedTarget.message)
          return
        }

        const jobId = enforcedTarget.jobId
        const effectiveToolInput: RunCoverLetterInput = {
          job_id: jobId,
          // Same as 7c: use _server_handles instead of also_execute to avoid Claude
          // generating pending-action content inside the cover letter format response.
          ...(toolInput.also_execute?.length ? { _server_handles: toolInput.also_execute } : {}),
        }

        // Look up match from session state
        const cached = getMatchFromState(sessionState, jobId)
        if (!cached) {
          await sendGatedResponse(
            "I couldn't match that to your current briefing. Tell me the company name or match number.",
          )
          return
        }

        await sendProgress('writing', 'Generating cover letter...')

        const assertion = issueSkillAssertion({
          userId,
          skill: 'careerclaw',
          tier: entitlements.effectiveTier,
          features: entitlements.features,
        })

        // Check for cached gap result in session state (single source of truth)
        const precomputedGap = getGapResultFromState(sessionState, jobId)

        let coverLetterResult: Record<string, unknown>
        try {
          const workerInput = {
            assertion,
            input: {
              match: cached.matchData,
              profile: cached.profile as Record<string, unknown> & {
                skills?: string[]
                targetRoles?: string[]
              },
              resumeIntel: cached.resumeIntel,
              ...(cached.resumeText ? { resumeText: cached.resumeText } : {}),
              ...(precomputedGap ? { precomputedGap } : {}),
            },
          }

          const workerResult = await runWorkerCoverLetter(workerInput)
          coverLetterResult = workerResult.result

          // Extract signals for logging and retry decisions
          const signals = extractCoverLetterSignals(coverLetterResult)

          // Forensic: log worker quality signal with generation metadata
          logWorkerSignal({
            rid,
            skill: 'careerclaw',
            action: 'cover_letter',
            isTemplate: signals.isTemplate,
            durationMs: workerResult.durationMs,
            generationMeta: signals.generationMeta,
          })

          // P1b: Template quality guard — retry once if template AND gap data exists.
          if (signals.isTemplate && precomputedGap) {
            console.log(
              JSON.stringify({
                event: 'forensic_cover_letter_template_retry',
                rid,
                jobId,
                reason: 'is_template_with_precomputed_gap',
              }),
            )

            // Note: this progress event fires after the first worker call completes.
            // The user sees "Generating cover letter..." → (first call, silent) →
            // "Refining cover letter..." → (retry) → done. Intentional — we need
            // the first result to decide whether retry is warranted.
            await sendProgress('writing', 'Refining cover letter...')

            try {
              const retryResult = await runWorkerCoverLetter({
                assertion: issueSkillAssertion({
                  userId,
                  skill: 'careerclaw',
                  tier: entitlements.effectiveTier,
                  features: entitlements.features,
                }),
                input: workerInput.input,
              })
              const retrySignals = extractCoverLetterSignals(retryResult.result)

              logWorkerSignal({
                rid,
                skill: 'careerclaw',
                action: 'cover_letter_retry',
                isTemplate: retrySignals.isTemplate,
                durationMs: retryResult.durationMs,
                generationMeta: retrySignals.generationMeta,
              })

              // Use retry result only if it's better (not template)
              if (!retrySignals.isTemplate) {
                coverLetterResult = retryResult.result
              }
            } catch (retryErr) {
              // Retry failed — proceed with the original template result
              console.warn(
                '[chat] P1b: cover letter retry failed, using original template',
                retryErr instanceof Error ? retryErr.message : String(retryErr),
              )
            }
          }
        } catch (err) {
          const isTimeout = err instanceof WorkerError && err.isTimeout
          console.error(
            '[chat] Cover letter worker error:',
            err instanceof Error ? err.message : String(err),
          )
          await sendError(
            isTimeout ? 'WORKER_TIMEOUT' : 'WORKER_ERROR',
            isTimeout
              ? 'The cover letter generation timed out. Please try again.'
              : 'The cover letter generation encountered an error. Please try again.',
          )
          return
        }

        // Format via second Claude call
        let formattedResponse: string
        try {
          const formatResult = await callLLMWithToolResult(
            CAREERCLAW_SYSTEM_PROMPT,
            baseMessages,
            llmResult.toolUseId,
            llmResult.toolName,
            effectiveToolInput,
            coverLetterResult,
            rid,
            'cover_letter_format',
          )
          formattedResponse = requireNonEmptyAssistantMessage(
            formatResult.content,
            'cover_letter_format',
          )
        } catch (err) {
          console.error(
            '[chat] Second Claude call (cover letter format) error:',
            err instanceof Error ? err.message : String(err),
          )
          await sendError('LLM_ERROR', 'Failed to format cover letter. Please try again.')
          return
        }

        // P0 Part A — sanitize hallucinated claims from format output
        formattedResponse = sanitizeFormatOutput(
          formattedResponse,
          ['run_cover_letter'],
          rid,
          'cover_letter_format',
        )

        // P0 Part B — pending-action queue driven by Claude's also_execute declaration
        const clAlsoExecute = toolInput.also_execute ?? []
        const clQueue = buildPendingQueue(clAlsoExecute, jobId)
        const { appendedText: clPendingText, stateUpdate: clPendingState } =
          await executePendingActions(clQueue, {
            sessionState,
            featureSet,
            userId,
            tier: entitlements.effectiveTier,
            features: entitlements.features,
            rid,
            supabase,
            sendProgress,
            baseMessages,
            profileRow: profileRow as Record<string, unknown> | null,
          })
        const clFinalOutput = formattedResponse + clPendingText

        const updatedMessages: Message[] = [
          ...history,
          { role: 'user', content: message, timestamp: new Date().toISOString() },
          { role: 'assistant', content: clFinalOutput, timestamp: new Date().toISOString() },
        ]
        // Merge primary cover letter result with any state from pending actions
        const mergedClState: Partial<SessionState> = mergeSessionState(
          { coverLetterResults: { [jobId]: coverLetterResult } } as SessionState,
          clPendingState,
        )
        const savedId = await saveSession(
          userId,
          channel as Channel,
          updatedMessages,
          activeSessionId,
          mergedClState,
          sessionState,
        )

        logAudit({
          userId,
          skill: 'careerclaw',
          channel,
          status: 'success',
          statusCode: 200,
          durationMs: Date.now() - startMs,
        })

        await sendDone(savedId, clFinalOutput)
        return
      }

      // ── 7e. track_application tool ───────────────────────────────────────
      // Direct Supabase write — no worker involved. Fast path.
      if (llmResult.toolName === 'track_application') {
        const trackInput = llmResult.toolInput as TrackApplicationInput
        // Read action as a plain string to avoid discriminated-union narrowing
        // conflicts between the try branches and the catch/summary blocks.
        const trackAction = llmResult.toolInput['action'] as string

        const hasActiveBriefing = (sessionState.briefing?.matches.length ?? 0) > 0
        let effectiveTrackInput = trackInput

        if (hasActiveBriefing && (trackAction === 'save' || trackAction === 'update_status')) {
          const enforcedTarget = enforceSingleMatchToolTarget({
            toolName: 'track_application',
            message,
            state: sessionState,
            toolInput: llmResult.toolInput,
          })

          if (enforcedTarget.kind === 'clarify') {
            await sendGatedResponse(enforcedTarget.message)
            return
          }

          const cached = getMatchFromState(sessionState, enforcedTarget.jobId)
          if (!cached) {
            await sendGatedResponse(
              "I couldn't match that to your current briefing. Tell me the company name or match number.",
            )
            return
          }

          const narrowedInput = trackInput as Exclude<TrackApplicationInput, { action: 'list' }>
          const overrideBase = {
            job_id: enforcedTarget.jobId,
            title: cached.entry.title,
            company: cached.entry.company,
            status: narrowedInput.status,
            ...(cached.entry.url ? { url: cached.entry.url } : {}),
            // Carry also_execute for format call consistency (same reason as 7c/7d).
            ...(narrowedInput.also_execute?.length
              ? { also_execute: narrowedInput.also_execute }
              : {}),
          }

          if (trackAction === 'save') {
            effectiveTrackInput = { action: 'save', ...overrideBase }
          } else {
            effectiveTrackInput = { action: 'update_status', ...overrideBase }
          }
        }

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
          } else if (effectiveTrackInput.action === 'save') {
            // Validate required fields — defense-in-depth against incomplete LLM tool calls.
            if (!validateTrackFields(effectiveTrackInput)) {
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
                  job_id: effectiveTrackInput.job_id,
                  title: effectiveTrackInput.title,
                  company: effectiveTrackInput.company,
                  status: effectiveTrackInput.status,
                  url: effectiveTrackInput.url ?? null,
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
                    title: effectiveTrackInput.title,
                    company: effectiveTrackInput.company,
                    status: effectiveTrackInput.status,
                    message: 'Database write failed.',
                  }
                : {
                    success: true,
                    action: 'save',
                    title: effectiveTrackInput.title,
                    company: effectiveTrackInput.company,
                    status: effectiveTrackInput.status,
                    message: `Saved "${effectiveTrackInput.title}" at ${effectiveTrackInput.company} with status "${effectiveTrackInput.status}".`,
                  }
            }
          } else if (trackAction === 'update_status') {
            // Validate required fields — defense-in-depth against incomplete LLM tool calls.
            if (!validateTrackFields(effectiveTrackInput)) {
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
              const updateInput = effectiveTrackInput as Exclude<
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
          } else if (
            effectiveTrackInput.action === 'save' ||
            effectiveTrackInput.action === 'update_status'
          ) {
            trackResult = {
              success: false,
              action: effectiveTrackInput.action,
              title: effectiveTrackInput.title,
              company: effectiveTrackInput.company,
              status: effectiveTrackInput.status,
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
            baseMessages,
            llmResult.toolUseId,
            llmResult.toolName,
            effectiveTrackInput,
            trackResult,
            rid,
            'track_application_format',
          )
          formattedResponse = requireNonEmptyAssistantMessage(
            formatResult.content,
            'track_application_format',
          )
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

        // P0 Part A — sanitize hallucinated claims from format output
        formattedResponse = sanitizeFormatOutput(
          formattedResponse,
          ['track_application'],
          rid,
          'track_application_format',
        )

        // P0 Part B — pending-action queue driven by Claude's also_execute declaration
        const trackJobId =
          effectiveTrackInput.action !== 'list' ? (effectiveTrackInput.job_id ?? null) : null
        const trackAlsoExecute = trackInput.action !== 'list' ? (trackInput.also_execute ?? []) : []
        const trackQueue = buildPendingQueue(trackAlsoExecute, trackJobId)
        const { appendedText: trackPendingText, stateUpdate: trackPendingState } =
          await executePendingActions(trackQueue, {
            sessionState,
            featureSet,
            userId,
            tier: entitlements.effectiveTier,
            features: entitlements.features,
            rid,
            supabase,
            sendProgress,
            baseMessages,
            profileRow: profileRow as Record<string, unknown> | null,
          })
        const trackFinalOutput = formattedResponse + trackPendingText

        // Save session with a brief summary (audit only — no job details in session)
        const pendingActionSuffix =
          trackQueue.length > 0 && trackPendingText
            ? `; ${trackQueue.map((a) => a.action).join(', ')} completed`
            : ''
        const sessionSummary =
          trackAction === 'list'
            ? trackResult.success
              ? `Listed ${trackResult.count ?? 0} tracked application${(trackResult.count ?? 0) === 1 ? '' : 's'}.`
              : 'Tracker list failed.'
            : trackResult.success
              ? `Tracker ${effectiveTrackInput.action === 'save' ? 'save' : 'status update'}: ${trackResult.title} at ${trackResult.company} → ${trackResult.status}${pendingActionSuffix}.`
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
          Object.keys(trackPendingState).length > 0 ? trackPendingState : undefined,
          sessionState,
        )

        logAudit({
          userId,
          skill: 'careerclaw',
          channel,
          status: trackResult.success ? 'success' : 'error',
          statusCode: trackResult.success ? 200 : 500,
          durationMs: Date.now() - startMs,
        })

        await sendDone(savedId, trackFinalOutput)
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
