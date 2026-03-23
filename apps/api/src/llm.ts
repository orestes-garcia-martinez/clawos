/**
 * llm.ts — LLM client with Anthropic primary and OpenAI failover.
 *
 * Primary:  Claude (Anthropic) via @anthropic-ai/sdk
 * Failover: OpenAI gpt-4o-mini via openai SDK
 *
 * Tool use is supported only on the primary (Claude). If the primary fails
 * and OpenAI failover is triggered, tools are omitted — the failover path
 * produces a plain text response.
 *
 * The failover fires on:
 *   - Network errors contacting the Anthropic API
 *   - HTTP 5xx from Anthropic (transient outage)
 *   - APIError with status >= 500
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

// ── Clients ───────────────────────────────────────────────────────────────────

let _anthropic: Anthropic | null = null
let _openai: OpenAI | null = null

function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: ENV.CLAWOS_ANTHROPIC_KEY })
  }
  return _anthropic
}

function getOpenAI(): OpenAI | null {
  if (!ENV.CLAWOS_OPENAI_KEY) return null
  if (!_openai) {
    _openai = new OpenAI({ apiKey: ENV.CLAWOS_OPENAI_KEY })
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
): Promise<LLMResult> {
  const anthropicMessages = messages.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  try {
    return await callAnthropic(systemPrompt, anthropicMessages, tools)
  } catch (err) {
    // Decide whether to failover or re-throw
    if (shouldFailover(err)) {
      console.warn('[llm] Anthropic call failed — attempting OpenAI failover', errorCode(err))
      return await callOpenAI(systemPrompt, anthropicMessages)
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

    const textBlock = response.content.find((b) => b.type === 'text')
    return {
      type: 'text',
      content: textBlock?.type === 'text' ? textBlock.text : '',
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
      ])
    }
    throw err
  }
}

// ── Anthropic call ────────────────────────────────────────────────────────────

async function callAnthropic(
  systemPrompt: string,
  messages: Anthropic.MessageParam[],
  tools?: LLMTool[],
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
      input_schema: t.input_schema,
    }))
  }

  const response = await getAnthropic().messages.create(params)

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

  const textBlock = response.content.find((b) => b.type === 'text')
  return {
    type: 'text',
    content: textBlock?.type === 'text' ? textBlock.text : '',
    provider: 'anthropic',
  }
}

// ── OpenAI failover ───────────────────────────────────────────────────────────

async function callOpenAI(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
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

  return {
    type: 'text',
    content: response.choices[0]?.message.content ?? '',
    provider: 'openai',
  }
}

// ── Failover logic ────────────────────────────────────────────────────────────

function shouldFailover(err: unknown): boolean {
  if (err instanceof Anthropic.APIError) {
    // Failover on 5xx — transient outage
    return err.status >= 500
  }
  // Network errors (no status code)
  if (err instanceof Error && err.message.includes('fetch failed')) return true
  if (err instanceof Error && err.message.includes('ECONNREFUSED')) return true
  if (err instanceof Error && err.message.includes('ENOTFOUND')) return true
  return false
}

function errorCode(err: unknown): string {
  if (err instanceof Anthropic.APIError) return `HTTP ${err.status}`
  if (err instanceof Error) return err.message.slice(0, 80)
  return String(err)
}
