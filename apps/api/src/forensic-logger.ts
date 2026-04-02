/**
 * forensic-logger.ts — Structured LLM observability for the Agent API.
 *
 * Turns the LLM "black box" into a transparent, traceable pipeline.
 * Every Claude call, every content block, every intent detection, and
 * every worker quality signal is logged as structured JSON to stdout
 * (captured by journalctl via the clawos-api systemd unit).
 *
 * Log events:
 *   forensic_llm_response   — content block inventory per Claude call
 *   forensic_intent_audit   — user intent vs actual tool invocation
 *   forensic_worker_signal  — worker response quality metadata
 *   forensic_text_audit     — false action claims in text responses
 *
 * All events carry a `rid` (request ID) for cross-event correlation
 * within a single /chat request.
 *
 * No new dependencies — uses crypto.randomUUID() (Node 22 built-in).
 */

import { randomUUID } from 'node:crypto'

// ── Request ID ───────────────────────────────────────────────────────────────

/** Generate a unique request ID for tracing a single /chat request. */
export function generateRequestId(): string {
  return randomUUID()
}

// ── LLM Response Logging ─────────────────────────────────────────────────────

/** Compact summary of a single content block from a Claude response. */
interface ContentBlockSummary {
  idx: number
  type: string
  /** Character length of text content (text blocks only). */
  len?: number
  /** Tool name (tool_use blocks only). */
  name?: string
}

/**
 * Log the content block inventory of a Claude API response.
 *
 * Called after every Claude call (first-turn, format calls, failover).
 * Captures the shape of the response without logging actual content,
 * making it safe for production use with no PII exposure.
 */
export function logLLMResponse(params: {
  rid: string
  /** Label identifying which call produced this response. */
  call: string
  /** Raw content blocks from the Anthropic response. */
  blocks: Array<{ type: string; text?: string; name?: string }>
  stopReason: string | null | undefined
  provider: string
  model?: string
}): void {
  const blockSummaries: ContentBlockSummary[] = params.blocks.map((b, idx) => {
    const summary: ContentBlockSummary = { idx, type: b.type }
    if (b.type === 'text' && typeof b.text === 'string') {
      summary.len = b.text.length
    }
    if (b.type === 'tool_use' && typeof b.name === 'string') {
      summary.name = b.name
    }
    return summary
  })

  console.log(
    JSON.stringify({
      event: 'forensic_llm_response',
      rid: params.rid,
      call: params.call,
      blocks: blockSummaries,
      stop_reason: params.stopReason ?? null,
      provider: params.provider,
      ...(params.model ? { model: params.model } : {}),
    }),
  )
}

// ── Intent Detection ─────────────────────────────────────────────────────────

/**
 * Regex-based multi-intent detector.
 *
 * Detects which tool-level actions the user's message implies.
 * Used for:
 *   1. Logging — detect mismatches between what the user asked and what
 *      the LLM actually invoked.
 *   2. P0 pending-action queue (future) — auto-execute unfulfilled intents.
 */
const INTENT_PATTERNS: ReadonlyArray<{ intent: string; pattern: RegExp }> = [
  {
    intent: 'briefing',
    pattern:
      /\b(find\s+(me\s+)?jobs|job\s+search|run\s+(a\s+)?briefing|what'?s\s+out\s+there|any\s+(new\s+)?(jobs|openings|roles))\b/i,
  },
  {
    intent: 'gap_analysis',
    pattern:
      /\b(analy[sz]e|gap\s+analysis|what'?s\s+missing|why\s+(is\s+)?(the\s+)?score\s+(so\s+)?low|deep[\s-]?dive)\b/i,
  },
  {
    intent: 'cover_letter',
    pattern:
      /\b(cover\s+letter|write\s+(a\s+|me\s+a\s+)?letter|generate\s+(a\s+)?letter|re[\s-]?write|personali[sz]e.*letter|more\s+personali[sz]ed)\b/i,
  },
  {
    intent: 'track_save',
    pattern:
      /\b(save\s+(the\s+|this\s+|it\s+)?(job|to\s+(my\s+)?track)|track\s+(it|this|the\s+job)|add\s+(it\s+)?to\s+(my\s+)?track)/i,
  },
  {
    intent: 'track_update',
    pattern: /\b(mark\s+(it\s+|this\s+)?as|update\s+(the\s+)?status|status\s+to)\b/i,
  },
  {
    intent: 'track_list',
    pattern:
      /\b(list\s+(my\s+)?track|show\s+(my\s+)?track|my\s+applications|what('?s|\s+is)\s+tracked)\b/i,
  },
]

/** Detect tool-level intents from the user's message text. */
export function detectUserIntents(message: string): string[] {
  return INTENT_PATTERNS.filter(({ pattern }) => pattern.test(message)).map(({ intent }) => intent)
}

/**
 * Static mapping from intent labels to the tool(s) that fulfil them.
 * Module-level const — allocated once, not per call.
 */
const INTENT_TO_TOOLS: Readonly<Record<string, readonly string[]>> = {
  briefing: ['run_careerclaw'],
  gap_analysis: ['run_gap_analysis'],
  cover_letter: ['run_cover_letter'],
  track_save: ['track_application'],
  track_update: ['track_application'],
  track_list: ['track_application'],
}

/**
 * Check whether an intent label is fulfilled by a given tool name.
 */
function intentMatchesTool(intent: string, tool: string): boolean {
  return (INTENT_TO_TOOLS[intent] ?? []).includes(tool)
}

/** Result of an intent audit — which intents were and weren't fulfilled. */
export interface IntentAuditResult {
  detectedIntents: string[]
  toolsInvoked: string[]
  mismatch: boolean
  unfulfilled: string[]
}

/**
 * Log the intent-vs-tool audit for a completed request.
 *
 * Compares what the user's message implied (detected intents) against
 * what was actually executed (tools invoked). A mismatch means the user
 * asked for something that wasn't done — either because the LLM chose
 * a different path or because the architecture only supports one tool
 * per turn.
 */
export function logIntentAudit(params: {
  rid: string
  detectedIntents: string[]
  toolsInvoked: string[]
  responseType: 'text' | 'tool_use'
}): IntentAuditResult {
  const unfulfilled = params.detectedIntents.filter(
    (intent) => !params.toolsInvoked.some((tool) => intentMatchesTool(intent, tool)),
  )

  const result: IntentAuditResult = {
    detectedIntents: params.detectedIntents,
    toolsInvoked: params.toolsInvoked,
    mismatch: unfulfilled.length > 0,
    unfulfilled,
  }

  console.log(
    JSON.stringify({
      event: 'forensic_intent_audit',
      rid: params.rid,
      detected_intents: params.detectedIntents,
      tools_invoked: params.toolsInvoked,
      response_type: params.responseType,
      mismatch: result.mismatch,
      ...(result.mismatch ? { unfulfilled } : {}),
    }),
  )

  return result
}

// ── Worker Signal Logging ────────────────────────────────────────────────────

/**
 * Log quality signals from a worker response.
 *
 * Captures `is_template`, quality scores, provider used, and latency
 * so template-fallback incidents are visible in logs without inspecting
 * the full response payload.
 *
 * When the worker result includes `_meta` (careerclaw-js v1.6+), the
 * generation-level provider, model, attempts, and fallback reason are
 * included for full LLM chain observability.
 */
export function logWorkerSignal(params: {
  rid: string
  skill: string
  action: string
  isTemplate?: boolean
  qualityScore?: number
  provider?: string
  latencyMs?: number
  durationMs?: number
  /** Generation metadata from careerclaw-js _meta field. */
  generationMeta?: {
    provider?: string
    model?: string
    attempts?: number
    fallback_reason?: string | null
    latency_ms?: number
  }
}): void {
  console.log(
    JSON.stringify({
      event: 'forensic_worker_signal',
      rid: params.rid,
      skill: params.skill,
      action: params.action,
      ...(params.isTemplate !== undefined ? { is_template: params.isTemplate } : {}),
      ...(params.qualityScore !== undefined ? { quality_score: params.qualityScore } : {}),
      ...(params.provider !== undefined ? { provider: params.provider } : {}),
      ...(params.latencyMs !== undefined ? { latency_ms: params.latencyMs } : {}),
      ...(params.durationMs !== undefined ? { duration_ms: params.durationMs } : {}),
      ...(params.generationMeta ? { generation_meta: params.generationMeta } : {}),
    }),
  )
}

// ── Text Audit ───────────────────────────────────────────────────────────────

/**
 * Patterns that indicate the LLM is claiming it performed an action.
 * Used to detect hallucinated saves/updates in text responses where
 * no tool was actually invoked.
 */
const FALSE_ACTION_PATTERNS: ReadonlyArray<{ claim: string; pattern: RegExp }> = [
  {
    claim: 'tracker_save',
    pattern:
      /\b(saved?\s+(to\s+)?(your\s+)?tracker|is\s+saved\s+to\s+your|tracked\s+.*successfully|added\s+to\s+your\s+(application|track))/i,
  },
  {
    claim: 'tracker_update',
    pattern: /\b(updated?\s+.*tracker|is\s+now\s+marked\s+as|status\s+(changed|updated)\s+to)\b/i,
  },
  {
    claim: 'cover_letter_generated',
    pattern: /^(Here'?s\s+your\s+tailored\s+cover\s+letter|Subject:\s+)/i,
  },
]

/**
 * Scan a text response for false action claims.
 *
 * Returns an array of claim labels found. An empty array means no
 * suspicious claims were detected.
 */
export function detectFalseActionClaims(text: string): string[] {
  return FALSE_ACTION_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ claim }) => claim)
}

/**
 * Log a text audit event when false action claims are detected.
 */
export function logTextAudit(params: {
  rid: string
  claims: string[]
  toolsInvoked: string[]
}): void {
  console.log(
    JSON.stringify({
      event: 'forensic_text_audit',
      rid: params.rid,
      false_claims: params.claims,
      tools_actually_invoked: params.toolsInvoked,
      severity: params.claims.length > 0 ? 'warning' : 'clean',
    }),
  )
}

// ── Hallucination Sanitization (P0) ──────────────────────────────────────────

/**
 * Static mapping from claim types to the tools that would make them real.
 * A claim is "false" when none of its backing tools were invoked.
 */
const CLAIM_TO_BACKING_TOOLS: Readonly<Record<string, readonly string[]>> = {
  tracker_save: ['track_application'],
  tracker_update: ['track_application'],
  cover_letter_generated: ['run_cover_letter'],
}

/**
 * Filter out claims that are backed by an actual tool invocation.
 *
 * Example: `tracker_save` + `toolsInvoked: ['track_application']` → filtered out (real).
 * Example: `tracker_save` + `toolsInvoked: ['run_cover_letter']` → kept (false).
 */
export function filterFalseClaims(claims: string[], toolsInvoked: string[]): string[] {
  return claims.filter((claim) => {
    const backingTools = CLAIM_TO_BACKING_TOOLS[claim] ?? []
    return !backingTools.some((tool) => toolsInvoked.includes(tool))
  })
}

/**
 * Corrective notes appended when false claims are stripped.
 * Keyed by claim type.
 */
const CORRECTIVE_NOTES: Readonly<Record<string, string>> = {
  tracker_save: '(To save this job to your tracker, just ask me.)',
  tracker_update: "(To update this job's status, just ask me.)",
  cover_letter_generated: '(Want me to generate a cover letter for this match?)',
}

/**
 * Remove lines containing false action claims from a response.
 *
 * Approach: split on newlines, remove lines matching the false claim
 * patterns, rejoin, and append a corrective note for the most relevant
 * stripped claim. Line-based splitting is more reliable than sentence
 * splitting for markdown-formatted chat responses.
 *
 * Returns the sanitized text and a flag indicating whether anything was stripped.
 */
export function sanitizeHallucinatedClaims(
  text: string,
  falseClaims: string[],
): { sanitized: string; stripped: boolean } {
  if (falseClaims.length === 0) return { sanitized: text, stripped: false }

  // Build combined patterns from the false claims
  const patterns = falseClaims.flatMap((claim) => {
    const entry = FALSE_ACTION_PATTERNS.find((p) => p.claim === claim)
    return entry ? [entry.pattern] : []
  })

  if (patterns.length === 0) return { sanitized: text, stripped: false }

  // Split on newlines, filter out matching lines
  const lines = text.split('\n')
  const filtered = lines.filter((line) => !patterns.some((pattern) => pattern.test(line)))

  if (filtered.length === lines.length) {
    return { sanitized: text, stripped: false }
  }

  // Pick the most relevant corrective note (first matching false claim)
  const note = falseClaims.map((claim) => CORRECTIVE_NOTES[claim]).find(Boolean)

  const sanitized = filtered
    .join('\n')
    .replace(/\n{3,}/g, '\n\n') // collapse excessive blank lines from removal
    .trim()

  return {
    sanitized: note ? `${sanitized}\n\n${note}` : sanitized,
    stripped: true,
  }
}
