/**
 * SkillCard.tsx — ClawOS skill catalog card.
 *
 * Renders a single skill entry in the HomePage and SkillsPage discovery grids.
 * Pulls static metadata from the SKILLS registry and curated marketing copy
 * from SKILL_CARD_COPY (kept here so the registry stays channel-agnostic).
 *
 * States:
 *   available   — accent glow on hover, active Install button
 *   coming_soon — reduced opacity, non-interactive placeholder
 *   waitlist    — treated same as coming_soon until waitlist flow is built
 *
 * Colours: all tokens reference the app's CSS variables so light/dark theme
 * switching works automatically. No hard-coded Tailwind colour classes.
 *
 * Usage:
 *   <SkillCard
 *     skillKey="careerclaw"
 *     onInstall={handleInstall}
 *     isInstalling={installingSlug === 'careerclaw'}
 *   />
 */

import type { JSX } from 'react'
import { SKILLS } from '../skills'
import type { SkillKey, SkillStatus } from '../skills'

// ── Curated marketing copy ──────────────────────────────────────────────────
// Separate from the registry so heroBody/description stay channel-agnostic.

export interface SkillCardCopy {
  concept: string
  specs: string[]
}

export const SKILL_CARD_COPY: Record<SkillKey, SkillCardCopy> = {
  careerclaw: {
    concept:
      'Automated job search engine. Analyses briefings, scores fit, and drafts outreach ' +
      'across Web and Telegram.',
    specs: ['246 tests passing', 'Multi-channel', 'Production-grade'],
  },
  scrapeclaw: {
    concept:
      'Structured web research engine. Turn any web surface into queryable data ' +
      'delivered to your preferred channel.',
    specs: ['Web + Telegram', 'Structured output', 'Phase 2'],
  },
  investclaw: {
    concept:
      'Investment workflow assistant. Synthesizes live data into risk and sentiment ' +
      'briefs for faster decision-making.',
    specs: ['Live data', 'Risk signals', 'Phase 3'],
  },
}

// ── Skill icons ─────────────────────────────────────────────────────────────

function CareerClawIcon({ className = 'w-5 h-5' }: { className?: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function ScrapeClawIcon({ className = 'w-5 h-5' }: { className?: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 11h6M11 8v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function InvestClawIcon({ className = 'w-5 h-5' }: { className?: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <polyline
        points="22 7 13.5 15.5 8.5 10.5 2 17"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="16 7 22 7 22 13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const SKILL_ICONS: Record<SkillKey, (props: { className?: string }) => JSX.Element> = {
  careerclaw: CareerClawIcon,
  scrapeclaw: ScrapeClawIcon,
  investclaw: InvestClawIcon,
}

// ── Status badge ────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<SkillStatus, string> = {
  available: 'Live',
  coming_soon: 'Soon',
  waitlist: 'Beta',
}

function StatusBadge({ status }: { status: SkillStatus }): JSX.Element {
  if (status === 'available') {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold"
        style={{
          background: 'rgba(34,197,94,0.12)',
          color: 'var(--success)',
          border: '1px solid rgba(34,197,94,0.25)',
        }}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-success" aria-hidden="true" />
        {STATUS_LABEL[status]}
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold text-text-muted"
      style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

// ── Engine spec tag ─────────────────────────────────────────────────────────

function SpecTag({ label }: { label: string }): JSX.Element {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono text-text-muted"
      style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}
    >
      {label}
    </span>
  )
}

// ── SkillCard ───────────────────────────────────────────────────────────────

export interface SkillCardProps {
  skillKey: SkillKey
  onInstall: (slug: SkillKey) => Promise<void>
  isInstalling: boolean
}

export function SkillCard({ skillKey, onInstall, isInstalling }: SkillCardProps): JSX.Element {
  const skill = SKILLS.find((s) => s.key === skillKey)!
  const copy = SKILL_CARD_COPY[skillKey]
  const IconComp = SKILL_ICONS[skillKey]
  const isAvailable = skill.status === 'available'

  return (
    <article
      className={[
        'group relative flex flex-col rounded-2xl p-5',
        'transition-all duration-200',
        isAvailable ? 'hover:-translate-y-0.5' : 'opacity-70',
      ].join(' ')}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        ...(isAvailable
          ? {
              // hover handled via CSS class below; base state is sufficient for SSR
            }
          : {}),
      }}
      // Inline hover via onMouseEnter/Leave keeps the accent glow within the
      // existing CSS-var system without needing arbitrary Tailwind values.
      onMouseEnter={(e) => {
        if (!isAvailable) return
        const el = e.currentTarget
        el.style.borderColor = 'var(--accent-border)'
        el.style.boxShadow = '0 8px 32px var(--accent-dim)'
      }}
      onMouseLeave={(e) => {
        if (!isAvailable) return
        const el = e.currentTarget
        el.style.borderColor = 'var(--border)'
        el.style.boxShadow = 'none'
      }}
    >
      {/* Header: icon + name + status badge */}
      <header className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0 transition-colors duration-200 text-accent"
            style={{
              background: isAvailable ? 'var(--accent-dim)' : 'var(--surface-2)',
              border: `1px solid ${isAvailable ? 'var(--accent-border)' : 'var(--border)'}`,
              color: isAvailable ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >
            <IconComp className="w-5 h-5" />
          </div>
          <h3 className="font-display font-bold text-sm text-text leading-tight">{skill.name}</h3>
        </div>
        <StatusBadge status={skill.status} />
      </header>

      {/* Concept: 1-2 sentence value proposition */}
      <p className="text-sm text-text-dim leading-relaxed mb-4 flex-1">{copy.concept}</p>

      {/* Engine specs: metadata tags */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {copy.specs.map((spec) => (
          <SpecTag key={spec} label={spec} />
        ))}
      </div>

      {/* Action: Install or Coming Soon */}
      {isAvailable ? (
        <button
          onClick={() => void onInstall(skillKey)}
          disabled={isInstalling}
          className="w-full py-2.5 rounded-xl text-sm font-semibold bg-accent text-bg hover:brightness-110 active:scale-[0.98] transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isInstalling ? 'Installing…' : 'Install'}
        </button>
      ) : (
        <div
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-center text-text-muted cursor-default select-none"
          style={{ border: '1px solid var(--border)' }}
        >
          Coming Soon
        </div>
      )}
    </article>
  )
}
