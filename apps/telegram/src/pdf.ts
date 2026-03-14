/**
 * pdf.ts -- PDF text extraction for Telegram document uploads.
 *
 * Enforces the platform resume data policy (Section 5.6):
 *   - 5MB file size maximum (enforced before download).
 *   - 50,000 character maximum for extracted text.
 *   - Raw PDF buffer is discarded after extraction -- never persisted.
 *
 * Uses pdf-parse for extraction. If it fails (encrypted, corrupt, image-only),
 * throws a PdfExtractionError with a user-safe message.
 */

import pdfParse from 'pdf-parse'
import { ENV } from './env.js'

export const PDF_MAX_BYTES = 5 * 1024 * 1024 // 5MB
export const RESUME_TEXT_MAX_CHARS = 50_000

export class PdfExtractionError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message)
    this.name = 'PdfExtractionError'
  }
}

/**
 * Download a file from Telegram and extract its text.
 *
 * @param fileId    Telegram file_id.
 * @param fileSize  File size in bytes (from the document object).
 * @returns         Extracted plain text, truncated to 50k chars.
 */
export async function extractPdfFromTelegram(
  fileId: string,
  fileSize: number | undefined,
): Promise<string> {
  // Reject oversized files before downloading.
  if (fileSize !== undefined && fileSize > PDF_MAX_BYTES) {
    throw new PdfExtractionError(
      `File too large: ${fileSize} bytes (max ${PDF_MAX_BYTES})`,
      `Your PDF is too large (${Math.round(fileSize / 1024 / 1024)}MB). Maximum size is 5MB. Please compress your resume and try again.`,
    )
  }

  // Step 1: Get the file path from Telegram.
  const getFileUrl = `https://api.telegram.org/bot${ENV.TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`
  const fileInfoRes = await fetch(getFileUrl)

  if (!fileInfoRes.ok) {
    throw new PdfExtractionError(
      `getFile API error: ${fileInfoRes.status}`,
      'Failed to retrieve your file from Telegram. Please try again.',
    )
  }

  const fileInfo = (await fileInfoRes.json()) as {
    ok: boolean
    result?: { file_path?: string; file_size?: number }
  }

  if (!fileInfo.ok || !fileInfo.result?.file_path) {
    throw new PdfExtractionError(
      'getFile returned no file_path',
      'Failed to retrieve your file from Telegram. Please try again.',
    )
  }

  // Double-check size from getFile response if not provided upfront.
  const reportedSize = fileInfo.result.file_size
  if (reportedSize !== undefined && reportedSize > PDF_MAX_BYTES) {
    throw new PdfExtractionError(
      `File too large: ${reportedSize} bytes`,
      `Your PDF is too large. Maximum size is 5MB. Please compress your resume and try again.`,
    )
  }

  // Step 2: Download the file content.
  const downloadUrl = `https://api.telegram.org/file/bot${ENV.TELEGRAM_BOT_TOKEN}/${fileInfo.result.file_path}`
  const fileRes = await fetch(downloadUrl)

  if (!fileRes.ok) {
    throw new PdfExtractionError(
      `File download error: ${fileRes.status}`,
      'Failed to download your file. Please try again.',
    )
  }

  const buffer = Buffer.from(await fileRes.arrayBuffer())

  // Final size check after download (file_size may be absent on older Telegram versions).
  if (buffer.length > PDF_MAX_BYTES) {
    throw new PdfExtractionError(
      `Downloaded file too large: ${buffer.length} bytes`,
      'Your PDF is too large. Maximum size is 5MB.',
    )
  }

  // Step 3: Extract text. Buffer is discarded after this call.
  let extracted: string
  try {
    const result = await pdfParse(buffer)
    extracted = result.text
  } catch (err) {
    throw new PdfExtractionError(
      `pdf-parse error: ${err instanceof Error ? err.message : String(err)}`,
      'Could not read your PDF. Please make sure it is a text-based PDF (not a scanned image) and try again.',
    )
  }

  if (!extracted.trim()) {
    throw new PdfExtractionError(
      'Empty text after extraction',
      'Your PDF appears to contain no readable text. Please use a text-based PDF (not a scanned image).',
    )
  }

  // Truncate to 50k chars.
  if (extracted.length > RESUME_TEXT_MAX_CHARS) {
    extracted = extracted.slice(0, RESUME_TEXT_MAX_CHARS)
  }

  return extracted
}
