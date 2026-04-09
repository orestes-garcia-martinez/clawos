/**
 * llm.streaming.test.ts — unit tests for callLLMWithToolResultStream.
 *
 * Tests:
 *   1. Anthropic streaming success — onChunk called per token, returns buffered text
 *   2. Anthropic fails before first token + failover-eligible → OpenAI streaming takes over
 *   3. Anthropic fails mid-stream (chunksEmitted > 0) → throws, no failover attempted
 *   4. Both Anthropic and OpenAI fail → rethrows OpenAI error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks (must be declared before vi.mock() factories run) ───────────

const { mockAnthropicStream, mockOpenAICompletionsCreate } = vi.hoisted(() => ({
  mockAnthropicStream: vi.fn(),
  mockOpenAICompletionsCreate: vi.fn(),
}))

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@anthropic-ai/sdk', () => {
  // Static error classes must live on the default export (Anthropic.APIError, etc.)
  // because llm.ts uses `instanceof Anthropic.APIConnectionTimeoutError` etc.
  class MockAnthropic {
    messages = {
      stream: mockAnthropicStream,
      create: vi.fn(),
    }
    static APIConnectionTimeoutError = class extends Error {}
    static APIConnectionError = class extends Error {}
    static APIError = class extends Error {
      status: number
      constructor(message: string, status: number) {
        super(message)
        this.status = status
      }
    }
  }

  return {
    default: MockAnthropic,
    APIError: MockAnthropic.APIError,
    APIConnectionTimeoutError: MockAnthropic.APIConnectionTimeoutError,
    APIConnectionError: MockAnthropic.APIConnectionError,
  }
})

vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: mockOpenAICompletionsCreate,
        },
      }
    },
  }
})

vi.mock('../env.js', () => ({
  ENV: {
    CLAWOS_ANTHROPIC_KEY: 'sk-ant-test',
    CLAWOS_OPENAI_KEY: 'sk-test',
  },
}))

vi.mock('../forensic-logger.js', () => ({
  logLLMResponse: vi.fn(),
  logLLMError: vi.fn(),
}))

// ── Subject under test ────────────────────────────────────────────────────────

import { callLLMWithToolResultStream } from '../llm.js'
import type { Message } from '@clawos/shared'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a mock Anthropic stream that yields the given text tokens then completes. */
function makeAnthropicStream(tokens: string[]) {
  async function* gen() {
    for (const text of tokens) {
      yield {
        type: 'content_block_delta' as const,
        delta: { type: 'text_delta' as const, text },
      }
    }
  }
  return {
    [Symbol.asyncIterator]: () => gen(),
    finalMessage: () =>
      Promise.resolve({ stop_reason: 'end_turn', model: 'claude-test', content: [] }),
  }
}

/**
 * Build a mock Anthropic stream that yields some tokens then throws.
 * If emitFirst is true, one token is yielded before the error.
 */
function makeAnthropicStreamWithError(err: Error, emitFirst = false) {
  async function* gen() {
    if (emitFirst) {
      yield {
        type: 'content_block_delta' as const,
        delta: { type: 'text_delta' as const, text: 'Partial ' },
      }
    }
    throw err
  }
  return {
    [Symbol.asyncIterator]: () => gen(),
    finalMessage: () => Promise.reject(err),
  }
}

/** Build a mock OpenAI streaming response that yields the given text tokens. */
async function* makeOpenAIStream(tokens: string[]) {
  for (const text of tokens) {
    yield { choices: [{ delta: { content: text } }] }
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MESSAGES: Message[] = [
  { role: 'user', content: 'Find me remote jobs', timestamp: '2026-01-01T00:00:00.000Z' },
]
const TOOL_RESULT = { matches: [{ job_id: 'job-1', title: 'Engineer', company: 'Acme' }] }

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('callLLMWithToolResultStream', () => {
  beforeEach(() => {
    mockAnthropicStream.mockReset()
    mockOpenAICompletionsCreate.mockReset()
  })

  it('streams tokens from Anthropic and returns the buffered full text', async () => {
    mockAnthropicStream.mockReturnValue(makeAnthropicStream(['Hello ', 'world']))

    const chunks: string[] = []
    const result = await callLLMWithToolResultStream(
      'System prompt',
      MESSAGES,
      'tu-001',
      'run_careerclaw',
      { topK: 3 },
      TOOL_RESULT,
      async (text) => {
        chunks.push(text)
      },
    )

    expect(result).toEqual({ type: 'text', content: 'Hello world', provider: 'anthropic' })
    expect(chunks).toEqual(['Hello ', 'world'])
    expect(mockOpenAICompletionsCreate).not.toHaveBeenCalled()
  })

  it('falls over to OpenAI streaming when Anthropic fails before the first token', async () => {
    mockAnthropicStream.mockReturnValue(
      makeAnthropicStreamWithError(new Error('fetch failed'), false),
    )
    mockOpenAICompletionsCreate.mockReturnValue(makeOpenAIStream(['From ', 'OpenAI']))

    const chunks: string[] = []
    const result = await callLLMWithToolResultStream(
      'System prompt',
      MESSAGES,
      'tu-002',
      'run_careerclaw',
      { topK: 3 },
      TOOL_RESULT,
      async (text) => {
        chunks.push(text)
      },
    )

    expect(result).toEqual({ type: 'text', content: 'From OpenAI', provider: 'openai' })
    expect(chunks).toEqual(['From ', 'OpenAI'])
    expect(mockOpenAICompletionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ stream: true, model: 'gpt-4o-mini' }),
    )
  })

  it('throws without OpenAI failover when Anthropic fails mid-stream (chunksEmitted > 0)', async () => {
    // One token is emitted before the connection drops — failover must NOT trigger
    mockAnthropicStream.mockReturnValue(
      makeAnthropicStreamWithError(new Error('fetch failed'), true),
    )

    const chunks: string[] = []
    await expect(
      callLLMWithToolResultStream(
        'System prompt',
        MESSAGES,
        'tu-003',
        'run_careerclaw',
        { topK: 3 },
        TOOL_RESULT,
        async (text) => {
          chunks.push(text)
        },
      ),
    ).rejects.toThrow('fetch failed')

    // The partial chunk was delivered before the failure
    expect(chunks).toEqual(['Partial '])
    // No OpenAI call — mid-stream failover is not allowed
    expect(mockOpenAICompletionsCreate).not.toHaveBeenCalled()
  })

  it('rethrows the OpenAI error when both providers fail', async () => {
    mockAnthropicStream.mockReturnValue(
      makeAnthropicStreamWithError(new Error('fetch failed'), false),
    )
    mockOpenAICompletionsCreate.mockRejectedValue(new Error('OpenAI service unavailable'))

    await expect(
      callLLMWithToolResultStream(
        'System prompt',
        MESSAGES,
        'tu-004',
        'run_careerclaw',
        { topK: 3 },
        TOOL_RESULT,
        async () => {},
      ),
    ).rejects.toThrow('OpenAI service unavailable')
  })
})
