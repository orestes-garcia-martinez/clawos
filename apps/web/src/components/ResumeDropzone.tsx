/**
 * ResumeDropzone.tsx — drag-and-drop PDF resume upload.
 *
 * Policy (Section 5.6 / chat 6 prompt):
 *   - Accepts PDF only, max 5MB.
 *   - Sends file to POST /resume/extract (server-side pdf-parse + Haiku extraction).
 *   - Raw PDF is discarded after extraction — never stored anywhere.
 *   - Extracted text AND structured profile fields are saved to
 *     careerclaw_profiles via Supabase (upsert, one row per user).
 *   - On success, calls onExtracted(text) so the parent can surface it.
 */

import type { JSX } from 'react'
import { useRef, useState, useCallback } from 'react'
import { extractResume } from '../lib/api.ts'
import { supabase } from '../lib/supabase.ts'
import { IconCheck, IconPaperclip, IconWarning } from '../shell/icons.tsx'

const PDF_MAX_BYTES = 5 * 1024 * 1024

type UploadState = 'idle' | 'uploading' | 'saving' | 'done' | 'error'

interface ResumeDropzoneProps {
  jwt: string
  userId: string
  onExtracted?: (text: string) => void
}

export function ResumeDropzone({ jwt, userId, onExtracted }: ResumeDropzoneProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<UploadState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const processFile = useCallback(
    async (file: File) => {
      setErrorMsg('')

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

      let result: Awaited<ReturnType<typeof extractResume>>
      try {
        result = await extractResume(jwt, file)
      } catch (err) {
        setState('error')
        setErrorMsg(err instanceof Error ? err.message : 'Extraction failed. Try again.')
        return
      }
      const text = result.text
      const skills = result.extractedProfile.skills
      const targetRoles = result.extractedProfile.targetRoles
      const experienceYears = result.extractedProfile.experienceYears
      const resumeSummary = result.extractedProfile.resumeSummary

      // Save extracted text + structured fields to Supabase (upsert — one profile row per user)
      setState('saving')
      const { error: dbErr } = await supabase.from('careerclaw_profiles').upsert(
        {
          user_id: userId,
          resume_text: text,
          skills: skills.length > 0 ? skills : null,
          target_roles: targetRoles.length > 0 ? targetRoles : null,
          experience_years: experienceYears,
          resume_summary: resumeSummary,
          resume_uploaded_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )

      if (dbErr) {
        setState('error')
        setErrorMsg('Could not save resume text. Please try again.')
        return
      }

      setState('done')
      onExtracted?.(text)

      // Reset to idle after 3 s so user can re-upload
      setTimeout(() => setState('idle'), 3000)
    },
    [jwt, userId, onExtracted],
  )

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void processFile(file)
    // Reset input so the same file can be re-uploaded
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) void processFile(file)
  }

  // Compact trigger button used inside the composer
  if (state === 'uploading' || state === 'saving') {
    return (
      <button
        disabled
        className="p-2 rounded-xl text-text-muted opacity-50 cursor-not-allowed shrink-0"
        aria-label="Uploading resume..."
      >
        <span className="block w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      </button>
    )
  }

  if (state === 'done') {
    return (
      <button
        disabled
        className="p-2 rounded-xl text-success shrink-0"
        aria-label="Resume uploaded"
      >
        <IconCheck />
      </button>
    )
  }

  if (state === 'error') {
    return (
      <button
        onClick={() => {
          setState('idle')
          setErrorMsg('')
        }}
        className="p-2 rounded-xl text-danger hover:bg-surface-2 transition-colors shrink-0"
        aria-label={`Resume upload error: ${errorMsg}. Click to retry.`}
        title={errorMsg}
      >
        <IconWarning />
      </button>
    )
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="sr-only"
        aria-label="Upload resume PDF"
        onChange={handleFileChange}
      />
      <button
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={[
          'p-2 rounded-xl transition-all shrink-0',
          dragOver
            ? 'text-accent bg-accent-dim'
            : 'text-text-muted hover:text-text hover:bg-surface-2',
        ].join(' ')}
        aria-label="Upload resume (PDF, max 5 MB)"
        title="Upload resume"
      >
        <IconPaperclip />
      </button>
    </>
  )
}
