/**
 * SkillSwitcher.tsx — compact installed-skill selector in the platform sidebar.
 *
 * Renders only skills the user has installed (from SkillsContext).
 * Non-installed skills live in the AddSkillsDrawer, triggered by the
 * '+ Add Skills' button at the bottom.
 *
 * Per-skill overflow menu:
 *   - A vertical ellipsis (···) button appears on hover over any skill row.
 *   - Clicking it opens a small popover with a "Remove skill" action.
 *   - "Remove skill" opens a confirmation modal before calling onRemoveSkill.
 *
 * Confirmation modal copy:
 *   "Remove [Skill Name]? This will hide it from your sidebar.
 *    Your data will remain safe."
 */

import type { JSX } from 'react'
import { useState } from 'react'
import type { SkillKey } from '../skills'
import { SKILL_MAP } from '../skills'
import { useSkills } from '../context/SkillsContext.tsx'
import { IconEllipsis, IconPlus } from './icons.tsx'

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
      {/* Full-screen backdrop */}
      <div className="fixed inset-0 z-50 bg-black/50" aria-hidden="true" onClick={onCancel} />

      {/* Modal panel — centred in viewport */}
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
  onAddSkills: () => void
}

export function SkillSwitcher({
  activeSkill,
  onSelectSkill,
  onRemoveSkill,
  onAddSkills,
}: SkillSwitcherProps): JSX.Element {
  const { installedSlugs } = useSkills()

  const [hoveredSlug, setHoveredSlug] = useState<SkillKey | null>(null)
  const [menuSlug, setMenuSlug] = useState<SkillKey | null>(null)
  // Slug pending confirmation — set when user clicks "Remove skill" in the menu
  const [confirmSlug, setConfirmSlug] = useState<SkillKey | null>(null)

  function closeMenu() {
    setMenuSlug(null)
  }

  function handleRemoveClick(slug: SkillKey) {
    closeMenu()
    setConfirmSlug(slug)
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

  return (
    <>
      {/* Confirmation modal — rendered at this level so it layers above the sidebar */}
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
          {installedSlugs.map((slug) => {
            const skill = SKILL_MAP[slug]
            if (!skill) return null

            const isActive = slug === activeSkill
            const isHovered = hoveredSlug === slug
            const isMenuOpen = menuSlug === slug

            return (
              <div
                key={slug}
                className="relative"
                onMouseEnter={() => setHoveredSlug(slug)}
                onMouseLeave={() => setHoveredSlug(null)}
              >
                {/* Skill select button */}
                <button
                  role="option"
                  aria-selected={isActive}
                  onClick={() => {
                    closeMenu()
                    onSelectSkill(slug)
                  }}
                  className={[
                    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm text-left',
                    'transition-all duration-150 pr-8 cursor-pointer',
                    isActive
                      ? 'bg-surface-3 text-text'
                      : 'text-text-muted hover:bg-surface-2 hover:text-text',
                  ].join(' ')}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0 bg-success"
                    aria-hidden="true"
                  />
                  <span className="font-medium truncate">{skill.name}</span>
                </button>

                {/* Ellipsis button — visible on hover or when menu is open */}
                {(isHovered || isMenuOpen) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setMenuSlug(isMenuOpen ? null : slug)
                    }}
                    className={[
                      'absolute right-1.5 top-1/2 -translate-y-1/2',
                      'p-1 rounded-md transition-all duration-100 cursor-pointer',
                      isMenuOpen
                        ? 'bg-surface-3 text-text'
                        : 'text-text-muted hover:text-text hover:bg-surface-2',
                    ].join(' ')}
                    aria-label={`${skill.name} options`}
                    aria-expanded={isMenuOpen}
                    aria-haspopup="menu"
                  >
                    <IconEllipsis className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Overflow popover menu */}
                {isMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" aria-hidden="true" onClick={closeMenu} />
                    <div
                      className="absolute right-0 top-full mt-1 z-50 w-40 rounded-xl border border-border bg-surface shadow-lg overflow-hidden"
                      role="menu"
                    >
                      <button
                        role="menuitem"
                        onClick={() => handleRemoveClick(slug)}
                        className="w-full px-3 py-2 text-sm text-left text-danger hover:bg-surface-2 transition-colors cursor-pointer"
                      >
                        Remove skill
                      </button>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>

        {/* Add Skills trigger */}
        <button
          onClick={onAddSkills}
          className="w-full flex items-center gap-2 px-2.5 py-2 mt-1 rounded-xl text-xs text-text-muted hover:text-text hover:bg-surface-2 transition-all duration-150 cursor-pointer"
          aria-label="Add another skill"
        >
          <IconPlus className="w-3.5 h-3.5 shrink-0" />
          <span>Add Skills</span>
        </button>
      </div>
    </>
  )
}
