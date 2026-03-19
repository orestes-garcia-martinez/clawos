/**
 * ProfileSetupFlow.tsx — inline 2-step profile setup rendered in the chat thread.
 *
 * Triggered after a resume is successfully uploaded. Collects:
 *   Step 1 — preferred work mode (remote | hybrid | onsite)
 *   Step 2 — minimum salary (integer, optional — user may skip)
 *
 * Visually rendered as a "system" bot message (distinct tint + ClawLogo icon)
 * so the user understands this is a structured data-collection phase, not a
 * free-form conversation.
 *
 * On completion, calls onComplete(workMode, salaryMin) so ChatView can upsert
 * careerclaw_profiles and auto-send the first briefing.
 *
 * SKILL.md contract:
 *   - Only one question shown at a time.
 *   - work_mode asked first, salary_min asked second.
 *   - salary_min is optional — Skip keeps it null.
 */

import type { JSX } from 'react'
import { useState } from 'react'
import { ClawLogo } from '../shell/icons.tsx'

export type WorkMode = 'remote' | 'hybrid' | 'onsite'

interface ProfileSetupFlowProps {
  onComplete: (workMode: WorkMode, salaryMin: number | null) => void
}

// ── System message wrapper ─────────────────────────────────────────────────

interface SystemBubbleProps {
  children: React.ReactNode
}

function SystemBubble({ children }: SystemBubbleProps): JSX.Element {
  return (
    <div className="flex justify-start">
      <div
        className="max-w-[88%] px-4 py-3 rounded-2xl rounded-tl-md text-sm leading-relaxed"
        style={{
          background: 'var(--accent-dim)',
          border: '1px solid var(--accent-border)',
        }}
      >
        {/* System header */}
        <div className="flex items-center gap-1.5 mb-2 text-xs font-mono text-accent opacity-70">
          <ClawLogo className="w-3 h-3" />
          <span>CareerClaw Setup</span>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Step 1 — Work mode ─────────────────────────────────────────────────────

const WORK_MODES: { value: WorkMode; label: string }[] = [
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'Onsite' },
]

interface StepWorkModeProps {
  onSelect: (mode: WorkMode) => void
}

function StepWorkMode({ onSelect }: StepWorkModeProps): JSX.Element {
  return (
    <SystemBubble>
      <p className="text-text mb-3">
        Your resume looks good. What&rsquo;s your preferred work mode?
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Work mode options">
        {WORK_MODES.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onSelect(value)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-100 bg-surface border border-border text-text hover:border-accent-border hover:text-accent active:scale-95"
          >
            {label}
          </button>
        ))}
      </div>
    </SystemBubble>
  )
}

// ── Step 2 — Minimum salary ────────────────────────────────────────────────

interface StepSalaryProps {
  onSubmit: (salaryMin: number | null) => void
}

function StepSalary({ onSubmit }: StepSalaryProps): JSX.Element {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = () => {
    if (!value.trim()) {
      onSubmit(null)
      return
    }
    const num = parseInt(value.replace(/[^0-9]/g, ''), 10)
    if (isNaN(num) || num < 0) {
      setError('Enter a valid annual amount (e.g. 120000), or skip.')
      return
    }
    setError('')
    onSubmit(num)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSubmit()
  }

  return (
    <SystemBubble>
      <p className="text-text mb-3">Minimum salary? (annual USD — optional)</p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setError('')
          }}
          onKeyDown={handleKeyDown}
          placeholder="e.g. 120000"
          min={0}
          step={1000}
          className="flex-1 px-3 py-2 rounded-lg text-sm bg-surface border border-border text-text placeholder:text-text-muted focus:outline-none focus:border-accent-border transition-colors"
          aria-label="Minimum salary in USD"
        />
        <button
          onClick={handleSubmit}
          className="px-3 py-2 rounded-lg text-sm font-medium bg-accent text-bg hover:brightness-110 active:scale-95 transition-all shrink-0"
        >
          Continue
        </button>
        <button
          onClick={() => onSubmit(null)}
          className="px-3 py-2 rounded-lg text-sm text-text-muted hover:text-text hover:bg-surface-2 transition-all shrink-0"
        >
          Skip
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </SystemBubble>
  )
}

// ── ProfileSetupFlow ───────────────────────────────────────────────────────

type SetupStep = 'work_mode' | 'salary'

export function ProfileSetupFlow({ onComplete }: ProfileSetupFlowProps): JSX.Element {
  const [step, setStep] = useState<SetupStep>('work_mode')
  const [workMode, setWorkMode] = useState<WorkMode | null>(null)

  const handleWorkMode = (mode: WorkMode) => {
    setWorkMode(mode)
    setStep('salary')
  }

  const handleSalary = (salaryMin: number | null) => {
    if (!workMode) return
    onComplete(workMode, salaryMin)
  }

  if (step === 'work_mode') {
    return <StepWorkMode onSelect={handleWorkMode} />
  }

  return <StepSalary onSubmit={handleSalary} />
}
