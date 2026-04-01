/**
 * llm.ts — LLM client with Anthropic primary and OpenAI failover.
 *
 * Primary:  Claude (Anthropic) via @anthropic-ai/sdk
 * Failover: OpenAI gpt-4o-mini via openai SDK
 *
 * Timeouts:
 *   - Anthropic: 45s hard timeout per request (maxRetries: 0 — no SDK-level retries)
 *   - OpenAI:    30s hard timeout per request (maxRetries: 0 — no SDK-level retries)
 *   Prevents infinite hangs when the API is slow or the connection drops.
 *   SDK retries are disabled so timeouts surface immediately to shouldFailover()
 *   rather than being silently retried (default: 2×), which would multiply
 *   the actual wall-clock wait (45s × 3 = 135s) against the stated timeout.
 *
 * Tool use is supported only on the primary (Claude). If the primary fails
 * and OpenAI failover is triggered, tools are omitted — the failover path
 * produces a plain text response.
 *
 * The failover fires on:
 *   - Network errors contacting the Anthropic API
 *   - HTTP 5xx from Anthropic (transient outage)
 *   - APIError with status >= 500
 *   - Timeout (APIConnectionTimeoutError)
 *
 * It does NOT fire on:
 *   - 400 Bad Request (caller bug — fail fast)
 *   - 401/403 (key misconfiguration — fail fast)
 *   - 429 (rate limit — surface to caller, not a failover case)
 */

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { ENV } from './env.js'
import type { Message } from '@clawos/shared'
import { logLLMResponse } from './forensic-logger.js'

// ── Constants ──────────────────────────────────────────────────────────────────

/** Hard timeout for Anthropic API calls (ms). Prevents infinite hangs. */
const ANTHROPIC_TIMEOUT_MS = 45_000

/** Hard timeout for OpenAI failover calls (ms). */
const OPENAI_TIMEOUT_MS = 30_000

// ── Clients ───────────────────────────────────────────────────────────────────

let _anthropic: Anthropic | null = null
let _openai: OpenAI | null = null

function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({
      apiKey: ENV.CLAWOS_ANTHROPIC_KEY,
      timeout: ANTHROPIC_TIMEOUT_MS,
      maxRetries: 0,
    })
  }
  return _anthropic
}

function getOpenAI(): OpenAI | null {
  if (!ENV.CLAWOS_OPENAI_KEY) return null
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: ENV.CLAWOS_OPENAI_KEY,
      timeout: OPENAI_TIMEOUT_MS,
      maxRetries: 0,
    })
  }
  return _openai
}

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Structural tool type — accepts any tool following the Anthropic tool schema.
 * Widened from `typeof RUN_CAREERCLAW_TOOL` to support multiple tools
 * (run_careerclaw, track_application) without type narrowing per-tool.
 */
export interface LLMTool {
  name: string
  description: string
  input_schema: {
    type: 'object'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    properties: Record<string, any>
    required: readonly string[]
  }
}

export interface LLMTextResult {
  type: 'text'
  content: string
  provider: 'anthropic' | 'openai'
}

export interface LLMToolUseResult {
  type: 'tool_use'
  toolName: string
  toolUseId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolInput: Record<string, any>
  provider: 'anthropic'
}

export type LLMResult = LLMTextResult | LLMToolUseResult

function extractTextOrThrow(blocks: Anthropic.ContentBlock[], context: string): string {
  const text = blocks
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()

  if (!text) {
    throw new Error(`[llm] Empty text response (${context})`)
  }

  return text
}

// ── Main call ─────────────────────────────────────────────────────────────────

/**
 * Call Claude with the given conversation history and optional tools.
 *
 * Returns either:
 *   - { type: 'text' }     — Claude produced a direct response
 *   - { type: 'tool_use' } — Claude wants to invoke a tool
 *
 * Throws on non-retriable errors (4xx).
 */
export async function callLLM(
  systemPrompt: string,
  messages: Message[],
  tools?: LLMTool[],
  rid?: string,
  callLabel?: string,
): Promise<LLMResult> {
  const anthropicMessages = messages.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  try {
    return await callAnthropic(systemPrompt, anthropicMessages, tools, rid, callLabel)
  } catch (err) {
    // Decide whether to failover or re-throw
    if (shouldFailover(err)) {
      console.warn('[llm] Anthropic call failed — attempting OpenAI failover', errorCode(err))
      return await callOpenAI(systemPrompt, anthropicMessages, rid, callLabel)
    }
    throw err
  }
}

/**
 * Second-turn Claude call used after a tool result is returned.
 * Sends the original messages + tool use + tool result, gets a final text response.
 */
export async function callLLMWithToolResult(
  systemPrompt: string,
  messages: Message[],
  toolUseId: string,
  toolName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolInput: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolResult: Record<string, any>,
  rid?: string,
  callLabel?: string,
): Promise<LLMTextResult> {
  const anthropicMessages: Anthropic.MessageParam[] = [
    ...messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    // Inject the assistant tool_use block
    {
      role: 'assistant',
      content: [
        {
          type: 'tool_use' as const,
          id: toolUseId,
          name: toolName,
          input: toolInput,
        },
      ],
    },
    // Inject the tool result
    {
      role: 'user',
      content: [
        {
          type: 'tool_result' as const,
          tool_use_id: toolUseId,
          content: JSON.stringify(toolResult),
        },
      ],
    },
  ]

  try {
    const response = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemPrompt,
      messages: anthropicMessages,
    })

    // Forensic logging — block inventory for the tool-result format call
    if (rid) {
      logLLMResponse({
        rid,
        call: callLabel ?? `${toolName}_format`,
        blocks: response.content.map((b) => ({
          type: b.type,
          ...(b.type === 'text' ? { text: b.text } : {}),
          ...(b.type === 'tool_use' ? { name: b.name } : {}),
        })),
        stopReason: response.stop_reason,
        provider: 'anthropic',
        model: response.model,
      })
    }

    return {
      type: 'text',
      content: extractTextOrThrow(response.content, 'tool_result'),
      provider: 'anthropic',
    }
  } catch (err) {
    if (shouldFailover(err)) {
      console.warn('[llm] Anthropic tool-result call failed — OpenAI failover (plain summary)')
      return await callOpenAI(systemPrompt, [
        ...messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        {
          role: 'user',
          content: `The job search returned these results: ${JSON.stringify(toolResult)}. Please summarise them for the user.`,
        },
      ], rid, callLabel)
    }
    throw err
  }
}

// ── Anthropic call ────────────────────────────────────────────────────────────

async function callAnthropic(
  systemPrompt: string,
  messages: Anthropic.MessageParam[],
  tools?: LLMTool[],
  rid?: string,
  callLabel?: string,
): Promise<LLMResult> {
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: systemPrompt,
    messages,
  }

  if (tools && tools.length > 0) {
    params.tools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: { ...t.input_schema, required: [...t.input_schema.required] },
    }))
  }

  const response = await getAnthropic().messages.create(params)

  // Forensic logging — block inventory for every Anthropic call
  if (rid) {
    logLLMResponse({
      rid,
      call: callLabel ?? 'anthropic_call',
      blocks: response.content.map((b) => ({
        type: b.type,
        ...(b.type === 'text' ? { text: b.text } : {}),
        ...(b.type === 'tool_use' ? { name: b.name } : {}),
      })),
      stopReason: response.stop_reason,
      provider: 'anthropic',
      model: response.model,
    })
  }

  // Check for tool use first
  const toolUseBlock = response.content.find((b) => b.type === 'tool_use')
  if (toolUseBlock?.type === 'tool_use') {
    return {
      type: 'tool_use',
      toolName: toolUseBlock.name,
      toolUseId: toolUseBlock.id,
      toolInput: toolUseBlock.input as Record<string, unknown>,
      provider: 'anthropic',
    }
  }

  return {
    type: 'text',
    content: extractTextOrThrow(response.content, 'direct_response'),
    provider: 'anthropic',
  }
}

// ── OpenAI failover ───────────────────────────────────────────────────────────

async function callOpenAI(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  rid?: string,
  callLabel?: string,
): Promise<LLMTextResult> {
  const openai = getOpenAI()
  if (!openai) {
    throw new Error('OpenAI failover requested but CLAWOS_OPENAI_KEY is not set')
  }

  const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ]

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 2048,
    messages: openaiMessages,
  })

  const content = response.choices[0]?.message.content ?? ''

  // Forensic logging — block inventory for OpenAI failover
  if (rid) {
    logLLMResponse({
      rid,
      call: callLabel ? `${callLabel}_openai_failover` : 'openai_failover',
      blocks: [{ type: 'text', text: content }],
      stopReason: response.choices[0]?.finish_reason ?? null,
      provider: 'openai',
      model: response.model,
    })
  }

  return {
    type: 'text',
    content,
    provider: 'openai',
  }
}

// ── Failover logic ────────────────────────────────────────────────────────────

function shouldFailover(err: unknown): boolean {
  // Test specific subclasses first — both extend APIError but have status === undefined,
  // so they must be checked before the base APIError branch.
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    console.error('[llm] Anthropic API call timed out after', ANTHROPIC_TIMEOUT_MS, 'ms')
    return true
  }
  if (err instanceof Anthropic.APIConnectionError) {
    console.error('[llm] Anthropic API connection error:', err.message)
    return true
  }
  // Base APIError — only reached for errors that carry a status code
  if (err instanceof Anthropic.APIError) {
    return err.status >= 500
  }
  // Network errors (no status code)
  if (err instanceof Error && err.message.includes('fetch failed')) return true
  if (err instanceof Error && err.message.includes('ECONNREFUSED')) return true
  if (err instanceof Error && err.message.includes('ENOTFOUND')) return true
  // AbortError from manual AbortController (future-proofing)
  if (err instanceof Error && err.name === 'AbortError') {
    console.error('[llm] LLM API call aborted (timeout)')
    return true
  }
  return false
}

function errorCode(err: unknown): string {
  if (err instanceof Anthropic.APIError) return `HTTP ${err.status}`
  if (err instanceof Error) return err.message.slice(0, 80)
  return String(err)
}
