/**
 * HomePage.tsx — ClawOS platform home.
 *
 * Two contexts, one page:
 *   - Zero installed skills: "Welcome to ClawOS" framing; user picks first skill.
 *   - Skills already installed: "Add another skill" framing; same card layout.
 *
 * Only 'available' skills show an Install button.
 * 'coming_soon' skills are rendered as inert cards with a badge.
 *
 * After install, user is sent directly to the new skill's default route.
 */

import type { JSX } from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClawLogo } from '../shell/icons.tsx'

import { useSkills } from '../context/SkillsContext.tsx'
import type { SkillKey } from '../skills'
import { SKILLS } from '../skills'

// ── Skill card ─────────────────────────────────────────────────────────────

interface SkillCardProps {
  skillKey: SkillKey
  name: string
  description: string
  status: 'available' | 'coming_soon' | 'waitlist'
  isInstalled: boolean
  isInstalling: boolean
  onInstall: () => void
}

function SkillCard({
  name,
  description,
  status,
  isInstalled,
  isInstalling,
  onInstall,
}: SkillCardProps): JSX.Element {
  const canInstall = status === 'available' && !isInstalled

  return (
    <div
      className={[
        'flex items-start justify-between gap-4 p-5 rounded-2xl border transition-all duration-150',
        canInstall
          ? 'bg-surface border-border hover:border-accent-border hover:bg-surface-2'
          : 'bg-surface border-border opacity-60',
      ].join(' ')}
    >
      <div className="flex items-start gap-4 min-w-0">
        {/* Skill icon placeholder — consistent size for all cards */}
        <div
          className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
          style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-border)' }}
          aria-hidden="true"
        >
          <ClawLogo className="w-5 h-5 text-accent" />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-semibold text-sm text-text">{name}</span>
            {status === 'coming_soon' && (
              <span
                className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-semibold"
                style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}
              >
                Coming soon
              </span>
            )}
            {isInstalled && (
              <span
                className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-semibold"
                style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
              >
                Installed
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{description}</p>
        </div>
      </div>

      {canInstall && (
        <button
          onClick={onInstall}
          disabled={isInstalling}
          className="shrink-0 px-4 py-2 rounded-xl bg-accent text-bg text-xs font-semibold hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isInstalling ? 'Installing…' : 'Install'}
        </button>
      )}
    </div>
  )
}

// ── HomePage ───────────────────────────────────────────────────────────────

export function HomePage(): JSX.Element {
  const navigate = useNavigate()
  const { installedSlugs, installSkill } = useSkills()
  const [installingSlug, setInstallingSlug] = useState<SkillKey | null>(null)

  const isFirstInstall = installedSlugs.length === 0

  async function handleInstall(slug: SkillKey): Promise<void> {
    if (installingSlug) return
    setInstallingSlug(slug)
    await installSkill(slug)
    setInstallingSlug(null)
    navigate(`/${slug}/chat`, { replace: true })
  }

  return (
    <div className="h-screen bg-bg text-text font-sans flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg space-y-10">
        {/* Brand */}
        <div className="text-center space-y-4">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl text-accent mb-2"
            style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-border)' }}
            aria-hidden="true"
          >
            <ClawLogo className="w-9 h-9" />
          </div>

          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight">
              {isFirstInstall ? 'Welcome to ClawOS' : 'Add a skill'}
            </h1>
            <p className="text-text-muted text-sm mt-2 leading-relaxed max-w-sm mx-auto">
              {isFirstInstall
                ? 'Choose your first skill to get started. You can add more from the sidebar at any time.'
                : 'Install another first-party skill. Only installed skills appear in your workspace.'}
            </p>
          </div>
        </div>

        {/* Skill catalog */}
        <div className="space-y-2.5" role="list" aria-label="Available skills">
          {SKILLS.map((skill) => (
            <div key={skill.key} role="listitem">
              <SkillCard
                skillKey={skill.key}
                name={skill.name}
                description={skill.description}
                status={skill.status}
                isInstalled={installedSlugs.includes(skill.key)}
                isInstalling={installingSlug === skill.key}
                onInstall={() => void handleInstall(skill.key)}
              />
            </div>
          ))}
        </div>

        {/* Footer — only show when user has skills to go back to */}
        {!isFirstInstall && (
          <div className="text-center">
            <button
              onClick={() => navigate(`/${installedSlugs[0]}/chat`)}
              className="text-xs text-text-muted hover:text-text transition-colors"
            >
              ← Back to workspace
            </button>
          </div>
        )}

        {/* Platform badge */}
        <div className="flex justify-center">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface border border-border text-[10px] font-mono text-text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-success" aria-hidden="true" />
            ClawOS · first-party skills only
          </div>
        </div>
      </div>
    </div>
  )
}
