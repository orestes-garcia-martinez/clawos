/**
 * routes/resume.ts — POST /resume/extract
 *
 * Accepts a multipart/form-data upload with a single "file" field (PDF).
 * Extracts plain text server-side using pdf-parse (same library as Telegram).
 * Returns { text: string } — raw PDF buffer is discarded after extraction.
 *
 * Policy (Section 5.6):
 *   - 5 MB file size maximum
 *   - 50,000 character maximum on extracted text
 *   - Raw PDF is never stored or forwarded
 *   - This endpoint does NOT persist the text — the web client saves it to
 *     careerclaw_profiles via Supabase directly (anon key + RLS)
 *
 * Auth: Supabase JWT required (web client). No service-secret path.
 */

import type { Context } from 'hono'
import pdfParse from 'pdf-parse'

export const PDF_MAX_BYTES = 5 * 1024 * 1024 // 5 MB
export const RESUME_TEXT_MAX_CHARS = 50_000

export async function resumeExtractHandler(c: Context): Promise<Response> {
  let formData: FormData
  try {
    formData = await c.req.formData()
  } catch {
    return c.json({ code: 'BAD_REQUEST', message: 'Expected multipart/form-data body.' }, 400)
  }

  const fileEntry = formData.get('file')

  if (!(fileEntry instanceof File)) {
    return c.json({ code: 'BAD_REQUEST', message: 'Missing "file" field in form data.' }, 400)
  }

  if (fileEntry.type !== 'application/pdf') {
    return c.json({ code: 'BAD_REQUEST', message: 'Only PDF files are accepted.' }, 400)
  }

  if (fileEntry.size > PDF_MAX_BYTES) {
    return c.json(
      {
        code: 'FILE_TOO_LARGE',
        message: `File too large (${(fileEntry.size / 1024 / 1024).toFixed(1)} MB). Maximum is 5 MB.`,
      },
      413,
    )
  }

  // Read bytes — buffer is discarded after extraction
  const arrayBuffer = await fileEntry.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  let extracted: string
  try {
    const result = await pdfParse(buffer)
    extracted = result.text
  } catch (err) {
    console.error('[resume] pdf-parse error:', err instanceof Error ? err.message : String(err))
    return c.json(
      {
        code: 'EXTRACTION_FAILED',
        message:
          'Could not read the PDF. Please ensure it is a text-based PDF (not a scanned image) and try again.',
      },
      422,
    )
  }

  if (!extracted.trim()) {
    return c.json(
      {
        code: 'EMPTY_PDF',
        message:
          'The PDF appears to contain no readable text. Please use a text-based PDF rather than a scanned image.',
      },
      422,
    )
  }

  // Truncate to policy limit
  if (extracted.length > RESUME_TEXT_MAX_CHARS) {
    extracted = extracted.slice(0, RESUME_TEXT_MAX_CHARS)
  }

  return c.json({ text: extracted })
}
