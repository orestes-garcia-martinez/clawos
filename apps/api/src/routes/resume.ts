/**
 * routes/resume.ts — POST /resume/extract
 *
 * Accepts a multipart/form-data upload with a single "file" field (PDF).
 * Extracts plain text server-side using pdf-parse, then calls Claude Haiku
 * to extract structured profile fields (skills, targetRoles, etc.).
 * Returns { text, extractedProfile } — raw PDF buffer is discarded after extraction.
 *
 * Policy (Section 5.6):
 *   - 5 MB file size maximum
 *   - 50,000 character maximum on extracted text
 *   - Raw PDF is never stored or forwarded
 *   - This endpoint does NOT persist anything — the web client saves to
 *     careerclaw_profiles via Supabase directly (anon key + RLS)
 *
 * Haiku extraction is best-effort: if it fails or returns invalid JSON,
 * { text } is still returned with an empty extractedProfile so the resume
 * text is never lost.
 *
 * Auth: Supabase JWT required (web client). No service-secret path.
 */

import type { Context } from 'hono'
import pdfParse from 'pdf-parse'
import Anthropic from '@anthropic-ai/sdk'
import { ENV } from '../env.js'

export const PDF_MAX_BYTES = 5 * 1024 * 1024 // 5 MB
export const RESUME_TEXT_MAX_CHARS = 50_000

// ── Extracted profile shape ────────────────────────────────────────────────

export interface ExtractedProfile {
  skills: string[]
  targetRoles: string[]
  experienceYears: number | null
  resumeSummary: string | null
}

const EMPTY_PROFILE: ExtractedProfile = {
  skills: [],
  targetRoles: [],
  experienceYears: null,
  resumeSummary: null,
}

// ── Haiku extraction ───────────────────────────────────────────────────────

const EXTRACT_SYSTEM = `You are a resume parser. Extract structured data from the resume text provided.
Respond ONLY with a valid JSON object — no preamble, no markdown fences, no explanation.

Required JSON shape:
{
  "skills": ["string"],        // technical skills, tools, languages, frameworks
  "targetRoles": ["string"],   // current or target job titles (max 5)
  "experienceYears": number,   // total years of professional experience (integer, or null if unclear)
  "resumeSummary": "string"    // 1–3 sentence professional summary (max 300 chars, or null)
}`

async function extractProfile(resumeText: string): Promise<ExtractedProfile> {
  const client = new Anthropic({ apiKey: ENV.CLAWOS_ANTHROPIC_KEY })

  let raw: string
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: EXTRACT_SYSTEM,
      messages: [
        {
          role: 'user',
          // Truncate input to 8k chars — enough for any resume, keeps Haiku fast
          content: resumeText.slice(0, 8_000),
        },
      ],
    })

    const block = response.content[0]
    raw = !block || block.type !== 'text' ? '' : block.text
  } catch (err) {
    console.error(
      '[resume] Haiku extraction failed:',
      err instanceof Error ? err.message : String(err),
    )
    return EMPTY_PROFILE
  }

  // Strip markdown fences if the model added them despite instructions
  const clean = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

  try {
    const parsed = JSON.parse(clean) as Partial<ExtractedProfile>
    return {
      skills: Array.isArray(parsed.skills) ? parsed.skills.slice(0, 100) : [],
      targetRoles: Array.isArray(parsed.targetRoles) ? parsed.targetRoles.slice(0, 5) : [],
      experienceYears:
        typeof parsed.experienceYears === 'number'
          ? Math.max(0, Math.min(60, parsed.experienceYears))
          : null,
      resumeSummary:
        typeof parsed.resumeSummary === 'string' ? parsed.resumeSummary.slice(0, 300) : null,
    }
  } catch {
    console.error('[resume] Failed to parse Haiku JSON response')
    return EMPTY_PROFILE
  }
}

// ── Handler ────────────────────────────────────────────────────────────────

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

  // Best-effort structured extraction — never blocks the response
  const extractedProfile = await extractProfile(extracted)

  return c.json({ text: extracted, extractedProfile })
}
