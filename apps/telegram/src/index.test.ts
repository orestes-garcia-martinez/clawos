/**
 * index.test.ts -- Unit tests for the ClawOS Telegram adapter.
 *
 * All tests run offline -- no network calls, no real Supabase or Telegram API.
 * External dependencies are mocked at the module level.
 *
 * Run: npm test (from apps/telegram/) or turbo run test
 *
 * Coverage:
 *   - Signature validation: valid, wrong, wrong length, empty
 *   - Webhook endpoint: missing secret, wrong secret, valid request
 *   - Identity: existing user fast path, new user creation, race recovery
 *   - /link flow: valid token, expired/invalid, already linked (same/different)
 *   - PDF extraction: file too large, getFile failure, empty text, truncation
 *   - Health endpoint
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// -- Mock @clawos/shared before any import that transitively loads it.
// vi.mock is hoisted; the factory must not reference outer vi.fn() variables.
vi.mock('@clawos/shared', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actual = (await importOriginal()) as any
  return {
    ...actual,
    createServerClient: vi.fn(),
  }
})

// Mock pdf-parse. Factory cannot reference outer variables (vitest hoisting).
vi.mock('pdf-parse', () => ({ default: vi.fn() }))

// Mock fetch globally.
vi.stubGlobal('fetch', vi.fn())

// -- Now we can import the modules under test.
import supertest from 'supertest'
import { app, validateWebhookSecret } from './index.js'
import { resolveOrCreateTelegramUser } from './identity.js'
import { claimLinkToken } from './link.js'
import { extractPdfFromTelegram, PDF_MAX_BYTES } from './pdf.js'
import { createServerClient } from '@clawos/shared'
import type { TypedSupabaseClient } from '@clawos/shared'
import pdfParse from 'pdf-parse'

// Typed references to the mocked functions.
const mockCreateServerClient = vi.mocked(createServerClient)
const mockPdfParse = vi.mocked(pdfParse)
const mockFetch = vi.mocked(fetch)

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal Supabase client mock. */
function buildSupabaseMock(overrides: Partial<TypedSupabaseClient> = {}): TypedSupabaseClient {
  return {
    auth: { admin: { createUser: vi.fn() } },
    from: vi.fn(),
    ...overrides,
  } as unknown as TypedSupabaseClient
}

// ── Signature validation ──────────────────────────────────────────────────────

describe('validateWebhookSecret', () => {
  it('accepts the correct secret', () => {
    expect(validateWebhookSecret('test-webhook-secret')).toBe(true)
  })

  it('rejects an incorrect secret', () => {
    expect(validateWebhookSecret('wrong-secret')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(validateWebhookSecret('')).toBe(false)
  })

  it('rejects a secret that is too long', () => {
    expect(validateWebhookSecret('test-webhook-secret-extra')).toBe(false)
  })

  it('rejects a truncated secret', () => {
    expect(validateWebhookSecret('test-webhook-secre')).toBe(false)
  })
})

// ── Health endpoint ───────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns status ok without auth', async () => {
    const res = await supertest(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.service).toBe('clawos-telegram')
  })
})

// ── Webhook endpoint ──────────────────────────────────────────────────────────

describe('POST /webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: no-op Supabase for identity lookup during async processing.
    const supabase = buildSupabaseMock()
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: { user_id: 'existing-uuid' }, error: null })
    const eq2 = vi.fn().mockReturnValue({ maybeSingle })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const select = vi.fn().mockReturnValue({ eq: eq1 })
    vi.mocked(supabase.from).mockReturnValue({ select } as unknown as ReturnType<
      TypedSupabaseClient['from']
    >)
    mockCreateServerClient.mockReturnValue(supabase)
  })

  it('returns 401 when X-Telegram-Bot-Api-Secret-Token header is missing', async () => {
    const res = await supertest(app).post('/webhook').send({ update_id: 1 })

    expect(res.status).toBe(401)
    expect(res.body.error).toBeDefined()
  })

  it('returns 401 when the secret header is wrong', async () => {
    const res = await supertest(app)
      .post('/webhook')
      .set('x-telegram-bot-api-secret-token', 'bad-secret')
      .send({ update_id: 1 })

    expect(res.status).toBe(401)
  })

  it('returns 200 immediately for a valid request with no message', async () => {
    const res = await supertest(app)
      .post('/webhook')
      .set('x-telegram-bot-api-secret-token', 'test-webhook-secret')
      .send({ update_id: 1 })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('returns 200 for a valid message update', async () => {
    // Mock fetch for Telegram sendChatAction + sendMessage + Agent API.
    mockFetch.mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: vi
            .fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode(
                'data: {"type":"done","sessionId":"sess-1","message":"Here are your jobs!"}\n\n',
              ),
            })
            .mockResolvedValueOnce({ done: true, value: undefined }),
          releaseLock: vi.fn(),
        }),
      },
      json: async () => ({ ok: true }),
    } as unknown as Response)

    const res = await supertest(app)
      .post('/webhook')
      .set('x-telegram-bot-api-secret-token', 'test-webhook-secret')
      .send({
        update_id: 2,
        message: {
          message_id: 2,
          from: { id: 42 },
          chat: { id: 42, type: 'private' },
          text: 'find me python jobs',
        },
      })

    expect(res.status).toBe(200)
  })
})

// ── Identity resolution ───────────────────────────────────────────────────────

describe('resolveOrCreateTelegramUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns existing userId from channel_identities (fast path)', async () => {
    const supabase = buildSupabaseMock()
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: { user_id: 'existing-uuid' }, error: null })
    const eq2 = vi.fn().mockReturnValue({ maybeSingle })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const select = vi.fn().mockReturnValue({ eq: eq1 })
    vi.mocked(supabase.from).mockReturnValue({ select } as ReturnType<TypedSupabaseClient['from']>)
    mockCreateServerClient.mockReturnValue(supabase)

    const userId = await resolveOrCreateTelegramUser('12345')

    expect(userId).toBe('existing-uuid')
    expect(supabase.auth.admin.createUser).not.toHaveBeenCalled()
  })

  it('creates a new auth user and channel_identity when none exists', async () => {
    const supabase = buildSupabaseMock()
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const eq2 = vi.fn().mockReturnValue({ maybeSingle })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const select = vi.fn().mockReturnValue({ eq: eq1 })
    const insert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(supabase.from).mockReturnValue({ select, insert } as ReturnType<
      TypedSupabaseClient['from']
    >)
    vi.mocked(supabase.auth.admin.createUser).mockResolvedValue({
      data: { user: { id: 'new-uuid' } },
      error: null,
    } as Awaited<ReturnType<TypedSupabaseClient['auth']['admin']['createUser']>>)
    mockCreateServerClient.mockReturnValue(supabase)

    const userId = await resolveOrCreateTelegramUser('99999')

    expect(userId).toBe('new-uuid')
    expect(supabase.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'tg_99999@clawos.internal',
        email_confirm: true,
      }),
    )
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'telegram', channel_user_id: '99999' }),
    )
  })

  it('recovers via re-query when createUser fails due to concurrent creation', async () => {
    const supabase = buildSupabaseMock()
    // First lookup: null. Second lookup (after failed create): returns the row.
    const maybeSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { user_id: 'race-uuid' }, error: null })
    const eq2 = vi.fn().mockReturnValue({ maybeSingle })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const select = vi.fn().mockReturnValue({ eq: eq1 })
    vi.mocked(supabase.from).mockReturnValue({ select } as unknown as ReturnType<
      TypedSupabaseClient['from']
    >)
    vi.mocked(supabase.auth.admin.createUser).mockResolvedValue({
      data: { user: null },
      error: { message: 'User already registered', name: 'AuthApiError', status: 422 },
    } as unknown as Awaited<ReturnType<TypedSupabaseClient['auth']['admin']['createUser']>>)
    mockCreateServerClient.mockReturnValue(supabase)

    const userId = await resolveOrCreateTelegramUser('77777')
    expect(userId).toBe('race-uuid')
  })
})

// ── /link token flow ──────────────────────────────────────────────────────────

describe('claimLinkToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns ok:true when token is valid and identity is unlinked', async () => {
    const supabase = buildSupabaseMock()

    const deleteChain = {
      eq: vi.fn().mockReturnValue({
        gt: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: [{ web_user_id: 'web-uuid' }], error: null }),
        }),
      }),
    }
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const eq2 = vi.fn().mockReturnValue({ maybeSingle })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const selectChain = { eq: eq1 }
    const upsert = vi.fn().mockResolvedValue({ error: null })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'link_tokens')
        return { delete: vi.fn().mockReturnValue(deleteChain) } as ReturnType<
          TypedSupabaseClient['from']
        >
      return { select: vi.fn().mockReturnValue(selectChain), upsert } as ReturnType<
        TypedSupabaseClient['from']
      >
    })
    mockCreateServerClient.mockReturnValue(supabase)

    const result = await claimLinkToken('tg-123', 'valid-raw-token')
    expect(result.ok).toBe(true)
  })

  it('returns invalid_or_expired when no matching token row exists', async () => {
    const supabase = buildSupabaseMock()
    const deleteChain = {
      eq: vi.fn().mockReturnValue({
        gt: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    }
    vi.mocked(supabase.from).mockReturnValue({
      delete: vi.fn().mockReturnValue(deleteChain),
    } as ReturnType<TypedSupabaseClient['from']>)
    mockCreateServerClient.mockReturnValue(supabase)

    const result = await claimLinkToken('tg-456', 'expired-token')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_or_expired')
  })

  it('returns already_linked when Telegram user is linked to a different account', async () => {
    const supabase = buildSupabaseMock()
    const deleteChain = {
      eq: vi.fn().mockReturnValue({
        gt: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: [{ web_user_id: 'web-A' }], error: null }),
        }),
      }),
    }
    // channel_identities lookup returns a different user
    const maybeSingle = vi.fn().mockResolvedValue({ data: { user_id: 'web-B' }, error: null })
    const eq2 = vi.fn().mockReturnValue({ maybeSingle })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'link_tokens')
        return { delete: vi.fn().mockReturnValue(deleteChain) } as ReturnType<
          TypedSupabaseClient['from']
        >
      return { select: vi.fn().mockReturnValue({ eq: eq1 }) } as ReturnType<
        TypedSupabaseClient['from']
      >
    })
    mockCreateServerClient.mockReturnValue(supabase)

    const result = await claimLinkToken('tg-789', 'a-token')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('already_linked')
  })

  it('is idempotent when Telegram is already linked to the same web account', async () => {
    const supabase = buildSupabaseMock()
    const deleteChain = {
      eq: vi.fn().mockReturnValue({
        gt: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: [{ web_user_id: 'same-uuid' }], error: null }),
        }),
      }),
    }
    const maybeSingle = vi.fn().mockResolvedValue({ data: { user_id: 'same-uuid' }, error: null })
    const eq2 = vi.fn().mockReturnValue({ maybeSingle })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'link_tokens')
        return { delete: vi.fn().mockReturnValue(deleteChain) } as ReturnType<
          TypedSupabaseClient['from']
        >
      return { select: vi.fn().mockReturnValue({ eq: eq1 }) } as ReturnType<
        TypedSupabaseClient['from']
      >
    })
    mockCreateServerClient.mockReturnValue(supabase)

    const result = await claimLinkToken('tg-same', 'a-token')
    expect(result.ok).toBe(true)
  })
})

// ── PDF extraction ────────────────────────────────────────────────────────────

describe('extractPdfFromTelegram', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects files that exceed 5MB based on fileSize metadata', async () => {
    const { PdfExtractionError } = await import('./pdf.js')
    await expect(extractPdfFromTelegram('file-id', PDF_MAX_BYTES + 1)).rejects.toThrow(
      PdfExtractionError,
    )
    // fetch should NOT be called -- rejected before network
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('extracts text from a valid PDF response', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          result: { file_path: 'documents/file.pdf', file_size: 1000 },
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(1000),
      } as unknown as Response)

    mockPdfParse.mockResolvedValue({
      text: 'Senior Software Engineer with 5 years experience',
      numpages: 1,
      numrender: 1,
      info: {},
      metadata: {},
      version: 'default',
    })

    const text = await extractPdfFromTelegram('file-123', 1000)
    expect(text).toContain('Senior Software Engineer')
  })

  it('throws PdfExtractionError when getFile API returns non-ok status', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 400 } as unknown as Response)

    const { PdfExtractionError } = await import('./pdf.js')
    await expect(extractPdfFromTelegram('bad-file', undefined)).rejects.toThrow(PdfExtractionError)
  })

  it('throws PdfExtractionError when extracted text is blank', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { file_path: 'documents/file.pdf' } }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(500),
      } as unknown as Response)

    mockPdfParse.mockResolvedValue({
      text: '   ',
      numpages: 1,
      numrender: 1,
      info: {},
      metadata: {},
      version: 'default',
    })

    const { PdfExtractionError } = await import('./pdf.js')
    await expect(extractPdfFromTelegram('empty-pdf', undefined)).rejects.toThrow(PdfExtractionError)
  })

  it('truncates extracted text that exceeds 50k characters', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { file_path: 'documents/file.pdf' } }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      } as unknown as Response)

    mockPdfParse.mockResolvedValue({
      text: 'x'.repeat(60_000),
      numpages: 1,
      numrender: 1,
      info: {},
      metadata: {},
      version: 'default',
    })

    const text = await extractPdfFromTelegram('big-pdf', undefined)
    expect(text.length).toBe(50_000)
  })
})
