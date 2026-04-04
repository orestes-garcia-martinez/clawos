/**
 * SkillSwitcher.tsx — compact installed-skill selector with popover sub-nav.
 *
 * REDESIGN (v2):
 *   - Only installed skills with status 'available' appear in the sidenav.
 *     Coming-soon skills (ScrapeClaw, InvestClaw) live exclusively on the
 *     /skills catalog page — they do NOT appear here.
 *   - Hover/click on a skill row opens a floating SkillSubNav popover
 *     to the right, showing that skill's workspace navigation items
 *     (Chat, Jobs, Applications, etc.) plus a "Remove skill" action.
 *   - "+ Add Skills" has been relocated to the Platform section (PlatformNav).
 *
 * Interaction model:
 *   - Desktop: hover triggers the popover with a 200ms leave delay.
 *   - Mobile/touch: click toggles the popover.
 *   - Clicking a popover nav item navigates and closes the popover.
 *   - Active skill is highlighted with bg-surface-3.
 *   - Active sub-page is highlighted inside the popover with accent colour.
 *
 * Confirmation modal:
 *   "Remove skill" opens a confirmation modal before calling onRemoveSkill.
 *   Modal renders at this level so it layers above the sidebar.
 */

import type { JSX } from 'react'
import { useState, useRef, useCallback, useEffect } from 'react'
import type { SkillKey } from '../skills'
import { SKILL_MAP } from '../skills'
import { useSkills } from '../context/SkillsContext.tsx'
import { SkillSubNav } from './SkillSubNav.tsx'

// ── Confirmation modal ─────────────────────────────────────────────────────

interface RemoveConfirmModalProps {
  skillName: string
  onConfirm: () => void
  onCancel: () => void
}

function RemoveConfirmModal({
  skillName,
  onConfirm,
  onCancel,
}: RemoveConfirmModalProps): JSX.Element {
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" aria-hidden="true" onClick={onCancel} />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-skill-title"
      >
        <div
          className="w-full max-w-sm rounded-2xl border border-border bg-surface shadow-xl p-6 space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="space-y-1.5">
            <h2
              id="remove-skill-title"
              className="font-display font-bold text-base text-text leading-tight"
            >
              Remove {skillName}?
            </h2>
            <p className="text-sm text-text-muted leading-relaxed">
              This will hide it from your sidebar. Your data will remain safe.
            </p>
          </div>
          <div className="flex gap-2.5 pt-1">
            <button
              onClick={onCancel}
              className="flex-1 py-2 rounded-xl border border-border text-sm font-medium text-text-muted hover:text-text hover:bg-surface-2 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-2 rounded-xl bg-danger text-bg text-sm font-semibold hover:brightness-110 active:scale-95 transition-all cursor-pointer"
            >
              Remove
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── SkillSwitcher ──────────────────────────────────────────────────────────

interface SkillSwitcherProps {
  activeSkill: SkillKey | null
  onSelectSkill: (key: SkillKey) => void
  onRemoveSkill: (key: SkillKey) => void
  /** Called when a nav item is clicked (e.g. to close mobile sidebar) */
  onNavigate?: () => void
}

export function SkillSwitcher({
  activeSkill,
  onSelectSkill,
  onRemoveSkill,
  onNavigate,
}: SkillSwitcherProps): JSX.Element {
  const { installedSlugs } = useSkills()

  // Popover state
  const [popoverSkill, setPopoverSkill] = useState<SkillKey | null>(null)
  const [popoverAnchor, setPopoverAnchor] = useState<DOMRect | null>(null)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Confirmation modal state
  const [confirmSlug, setConfirmSlug] = useState<SkillKey | null>(null)

  const showPopover = useCallback((slug: SkillKey, rowEl: HTMLElement) => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
    setPopoverSkill(slug)
    setPopoverAnchor(rowEl.getBoundingClientRect())
  }, [])

  const hidePopover = useCallback(() => {
    hideTimeoutRef.current = setTimeout(() => {
      setPopoverSkill(null)
      setPopoverAnchor(null)
    }, 200)
  }, [])

  const cancelHide = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
  }, [])

  const closePopoverImmediate = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
    setPopoverSkill(null)
    setPopoverAnchor(null)
  }, [])

  // Clear any pending timer on unmount to prevent setState on an unmounted component.
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
    }
  }, [])

  function handleRemoveFromPopover(slug: string) {
    closePopoverImmediate()
    setConfirmSlug(slug as SkillKey)
  }

  function handleConfirmRemove() {
    if (confirmSlug) {
      onRemoveSkill(confirmSlug)
    }
    setConfirmSlug(null)
  }

  function handleCancelRemove() {
    setConfirmSlug(null)
  }

  const confirmSkill = confirmSlug ? SKILL_MAP[confirmSlug] : null

  // Only show installed skills with status 'available'.
  // Coming-soon skills (ScrapeClaw, InvestClaw) live on /skills page only.
  const visibleSlugs = installedSlugs.filter((slug) => {
    const skill = SKILL_MAP[slug]
    return skill && skill.status === 'available'
  })

  return (
    <>
      {/* Confirmation modal */}
      {confirmSlug && confirmSkill && (
        <RemoveConfirmModal
          skillName={confirmSkill.name}
          onConfirm={handleConfirmRemove}
          onCancel={handleCancelRemove}
        />
      )}

      <div className="px-3 py-2 border-b border-border-subtle">
        <p className="px-2 mb-1.5 text-[10px] font-mono font-semibold text-text-muted uppercase tracking-widest">
          Skills
        </p>

        <div className="space-y-0.5" role="listbox" aria-label="Select skill">
          {visibleSlugs.map((slug) => {
            const skill = SKILL_MAP[slug]
            if (!skill) return null

            const isActive = slug === activeSkill

            return (
              <div
                key={slug}
                className="relative"
                onMouseEnter={(e) => showPopover(slug, e.currentTarget)}
                onMouseLeave={hidePopover}
              >
                <button
                  role="option"
                  aria-selected={isActive}
                  onClick={(e) => {
                    onSelectSkill(slug)
                    const row = e.currentTarget.parentElement
                    if (row) showPopover(slug, row)
                  }}
                  className={[
                    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm text-left',
                    'transition-all duration-150 cursor-pointer',
                    isActive
                      ? 'bg-surface-3 text-text'
                      : 'text-text-muted hover:bg-surface-2 hover:text-text',
                  ].join(' ')}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0 bg-success"
                    aria-hidden="true"
                  />
                  <span className="font-medium truncate flex-1">{skill.name}</span>
                  {/* Chevron indicating sub-nav */}
                  <svg
                    className={[
                      'w-3.5 h-3.5 shrink-0 transition-colors',
                      isActive ? 'text-text-muted' : 'text-text-dim',
                    ].join(' ')}
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M6 4l4 4-4 4"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Floating sub-nav popover */}
      {popoverSkill && SKILL_MAP[popoverSkill] && (
        <SkillSubNav
          skill={SKILL_MAP[popoverSkill]}
          anchorRect={popoverAnchor}
          onClose={closePopoverImmediate}
          onCancelHide={cancelHide}
          onRequestHide={hidePopover}
          onRemoveSkill={handleRemoveFromPopover}
          onNavigate={onNavigate}
        />
      )}
    </>
  )
}
