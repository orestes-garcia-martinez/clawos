/**
 * ResumeUploadZone.tsx — full-width drag-and-drop resume upload for Settings.
 *
 * Designed for the CareerClaw Profile page — a prominent upload area with
 * drag-over state, inline success/error feedback, and last-updated date.
 *
 * Policy (Section 5.6):
 *   - Accepts PDF only, max 5MB.
 *   - Sends file to POST /resume/extract (server-side pdf-parse + Haiku extraction).
 *   - Raw PDF is discarded after extraction — never stored anywhere.
 *   - Extracted text + structured fields saved to careerclaw_profiles via Supabase.
 *
 * Distinct from ResumeDropzone (compact icon button for the composer toolbar).
 */

import type { JSX } from 'react'
import { useRef, useState, useCallback } from 'react'
import { extractResume } from '../lib/api.ts'
import { supabase } from '../lib/supabase.ts'
import { IconCheck, IconWarning } from '../shell/icons.tsx'

const PDF_MAX_BYTES = 5 * 1024 * 1024

type UploadState = 'idle' | 'uploading' | 'saving' | 'done' | 'error'

export interface ResumeUploadZoneProps {
  jwt: string
  userId: string
  /** ISO string of the last upload, if any — used to show "Last updated" date. */
  uploadedAt?: string | null
  onUploaded?: (text: string, uploadedAt: string) => void
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function ResumeUploadZone({
  jwt,
  userId,
  uploadedAt,
  onUploaded,
}: ResumeUploadZoneProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<UploadState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const processFile = useCallback(
    async (file: File) => {
      setErrorMsg('')
      setState('idle')

      if (file.type !== 'application/pdf') {
        setState('error')
        setErrorMsg('Only PDF files are accepted.')
        return
      }
      if (file.size > PDF_MAX_BYTES) {
        setState('error')
        setErrorMsg(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`)
        return
      }

      setState('uploading')

      let text: string
      let skills: string[] = []
      let targetRoles: string[] = []
      let experienceYears: number | null = null
      let resumeSummary: string | null = null

      try {
        const result = await extractResume(jwt, file)
        text = result.text
        skills = result.extractedProfile.skills
        targetRoles = result.extractedProfile.targetRoles
        experienceYears = result.extractedProfile.experienceYears
        resumeSummary = result.extractedProfile.resumeSummary
      } catch (err) {
        setState('error')
        setErrorMsg(err instanceof Error ? err.message : 'Extraction failed. Try again.')
        return
      }

      setState('saving')
      const now = new Date().toISOString()

      const { error: dbErr } = await supabase
        .from('careerclaw_profiles')
        .upsert(
          {
            user_id: userId,
            resume_text: text,
            skills: skills.length > 0 ? skills : null,
            target_roles: targetRoles.length > 0 ? targetRoles : null,
            experience_years: experienceYears,
            resume_summary: resumeSummary,
            resume_uploaded_at: now,
          },
          { onConflict: 'user_id' },
        )

      if (dbErr) {
        setState('error')
        setErrorMsg('Could not save resume. Please try again.')
        return
      }

      setState('done')
      onUploaded?.(text, now)

      // Reset to idle after 4s so user can re-upload
      setTimeout(() => setState('idle'), 4000)
    },
    [jwt, userId, onUploaded],
  )

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void processFile(file)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) void processFile(file)
  }

  const isLoading = state === 'uploading' || state === 'saving'

  const loadingLabel =
    state === 'uploading' ? 'Extracting resume text…' : 'Saving to your profile…'

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="sr-only"
        aria-label="Upload resume PDF"
        onChange={handleFileChange}
        disabled={isLoading}
      />

      {/* Drop zone */}
      <button
        onClick={() => !isLoading && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          if (!isLoading) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        disabled={isLoading}
        className={[
          'w-full flex flex-col items-center justify-center gap-3 px-6 py-8 rounded-2xl',
          'border-2 border-dashed transition-all duration-150 cursor-pointer',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          isLoading
            ? 'border-border opacity-60 cursor-not-allowed'
            : dragOver
              ? 'border-accent bg-accent-dim'
              : 'border-border hover:border-accent-border hover:bg-surface-2',
        ].join(' ')}
        aria-label={isLoading ? loadingLabel : 'Upload resume PDF'}
      >
        {isLoading ? (
          <>
            <span
              className="w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin"
              aria-hidden="true"
            />
            <p className="text-sm text-text-muted">{loadingLabel}</p>
          </>
        ) : (
          <>
            {/* Upload icon */}
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-border)' }}
              aria-hidden="true"
            >
              <svg
                className="w-6 h-6 text-accent"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                />
              </svg>
            </div>

            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-text">
                {uploadedAt ? 'Drop a new PDF to replace your resume' : 'Upload your resume'}
              </p>
              <p className="text-xs text-text-muted">
                Drag and drop or click to browse · PDF only · Max 5 MB
              </p>
            </div>
          </>
        )}
      </button>

      {/* Success feedback */}
      {state === 'done' && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium"
          style={{
            background: 'rgba(34,197,94,0.08)',
            color: 'var(--success)',
            border: '1px solid rgba(34,197,94,0.2)',
          }}
          role="status"
        >
          <IconCheck className="w-3.5 h-3.5 shrink-0" />
          Resume uploaded and profile extracted successfully.
        </div>
      )}

      {/* Error feedback */}
      {state === 'error' && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium"
          style={{
            background: 'rgba(239,68,68,0.08)',
            color: 'var(--danger)',
            border: '1px solid rgba(239,68,68,0.2)',
          }}
          role="alert"
        >
          <IconWarning className="w-3.5 h-3.5 shrink-0" />
          {errorMsg}
          <button
            onClick={() => { setState('idle'); setErrorMsg('') }}
            className="ml-auto underline underline-offset-2 hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Last updated date */}
      {uploadedAt && state !== 'done' && (
        <p className="text-[11px] font-mono text-text-muted">
          Last updated: {formatDate(uploadedAt)}
        </p>
      )}
    </div>
  )
}
