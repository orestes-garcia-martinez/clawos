/**
 * AddSkillsDrawer.tsx — sidebar-scoped Add Skills slide-over.
 *
 * Renders as an absolute overlay inside the <aside> element, sliding in
 * from the left to cover the sidebar content. The aside must have
 * `relative overflow-hidden` for the clip to work.
 *
 * Shows:
 *   - 'available' skills that are not yet installed → Install button
 *   - 'coming_soon' skills → inert card with badge
 *   - Already-installed skills → not shown (no noise)
 *
 * After installing a skill, the drawer closes and the caller navigates
 * to the new skill's default route.
 */

import type { JSX } from 'react'
import { useState } from 'react'
import { ClawLogo, IconX } from './icons.tsx'
import { SKILLS } from '../skills'
import type { SkillKey } from '../skills'
import { useSkills } from '../context/SkillsContext.tsx'

interface AddSkillsDrawerProps {
  open: boolean
  onClose: () => void
  onInstalled: (slug: SkillKey) => void
}

export function AddSkillsDrawer({ open, onClose, onInstalled }: AddSkillsDrawerProps): JSX.Element {
  const { installedSlugs, installSkill } = useSkills()
  const [installingSlug, setInstallingSlug] = useState<SkillKey | null>(null)

  // Skills the user has not yet installed — these are the candidates to show.
  const candidateSkills = SKILLS.filter((s) => !installedSlugs.includes(s.key))

  async function handleInstall(slug: SkillKey): Promise<void> {
    if (installingSlug) return
    setInstallingSlug(slug)
    await installSkill(slug)
    setInstallingSlug(null)
    onClose()
    onInstalled(slug)
  }

  return (
    <>
      {/* Slide panel — absolute within the aside */}
      <div
        className={[
          'absolute inset-0 z-40 bg-surface flex flex-col',
          'transition-transform duration-200 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
        aria-modal="true"
        aria-label="Add Skills"
        role="dialog"
      >
        {/* Header */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-border shrink-0">
          <div>
            <p className="font-display font-bold text-sm leading-none">Add Skills</p>
            <p className="text-[10px] text-text-muted font-mono mt-0.5 tracking-wider uppercase">
              First-party only
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
            aria-label="Close"
          >
            <IconX />
          </button>
        </div>

        {/* Skill list */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
          {candidateSkills.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
              <p className="text-sm font-medium text-text">All skills installed</p>
              <p className="text-xs text-text-muted mt-1 leading-relaxed">
                You have every available skill. More are coming soon.
              </p>
            </div>
          ) : (
            candidateSkills.map((skill) => {
              const canInstall = skill.status === 'available'
              const isInstalling = installingSlug === skill.key

              return (
                <div
                  key={skill.key}
                  className={[
                    'flex items-start gap-3 p-3 rounded-xl border transition-all duration-150',
                    canInstall
                      ? 'bg-surface-2 border-border hover:border-accent-border'
                      : 'bg-surface border-border opacity-50',
                  ].join(' ')}
                >
                  {/* Icon */}
                  <div
                    className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 mt-0.5"
                    style={{
                      background: 'var(--accent-dim)',
                      border: '1px solid var(--accent-border)',
                    }}
                    aria-hidden="true"
                  >
                    <ClawLogo className="w-4 h-4 text-accent" />
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium text-text leading-none">
                        {skill.name}
                      </span>
                      {skill.status === 'coming_soon' && (
                        <span
                          className="px-1.5 py-0.5 rounded-full text-[9px] font-mono font-semibold leading-none"
                          style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}
                        >
                          Soon
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-text-muted mt-0.5 leading-relaxed">
                      {skill.description}
                    </p>
                  </div>

                  {/* Install button */}
                  {canInstall && (
                    <button
                      onClick={() => void handleInstall(skill.key)}
                      disabled={isInstalling}
                      className="shrink-0 px-3 py-1.5 rounded-lg bg-accent text-bg text-[11px] font-semibold hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isInstalling ? '…' : 'Install'}
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-3 pb-3 pt-2 border-t border-border-subtle shrink-0">
          <p className="text-[10px] font-mono text-text-muted text-center leading-relaxed">
            ClawOS · first-party skills only
          </p>
        </div>
      </div>
    </>
  )
}
