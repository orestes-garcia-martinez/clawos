/**
 * SkillSwitcher.tsx — compact installed-skill selector in the platform sidebar.
 *
 * Only skills the user has installed (from SkillsContext) are rendered here.
 * Non-installed skills live in the Add Skills catalog (/home).
 *
 * The '+ Add Skills' button at the bottom navigates to /home, which doubles
 * as the skill catalog in Phase 1. A dedicated drawer will replace this in
 * Phase 2.
 */

import type { JSX } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SkillKey } from '../skills'
import { SKILL_MAP } from '../skills'
import { useSkills } from '../context/SkillsContext.tsx'

interface SkillSwitcherProps {
  activeSkill: SkillKey | null
  onSelectSkill: (key: SkillKey) => void
}

export function SkillSwitcher({ activeSkill, onSelectSkill }: SkillSwitcherProps): JSX.Element {
  const { installedSlugs } = useSkills()
  const navigate = useNavigate()

  return (
    <div className="px-3 py-2 border-b border-border-subtle">
      <p className="px-2 mb-1.5 text-[10px] font-mono font-semibold text-text-muted uppercase tracking-widest">
        Skills
      </p>

      <div className="space-y-0.5" role="listbox" aria-label="Select skill">
        {installedSlugs.map((slug) => {
          const skill = SKILL_MAP[slug]
          if (!skill) return null

          const isActive = slug === activeSkill

          return (
            <button
              key={slug}
              role="option"
              aria-selected={isActive}
              onClick={() => onSelectSkill(slug)}
              className={[
                'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm text-left',
                'transition-all duration-150',
                isActive
                  ? 'bg-surface-3 text-text'
                  : 'text-text-muted hover:bg-surface-2 hover:text-text',
              ].join(' ')}
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-success" aria-hidden="true" />
              <span className="font-medium truncate">{skill.name}</span>
            </button>
          )
        })}
      </div>

      {/* Add Skills — navigates to /home (skill catalog) */}
      <button
        onClick={() => navigate('/home')}
        className="w-full flex items-center gap-2 px-2.5 py-2 mt-1 rounded-xl text-xs text-text-muted hover:text-text hover:bg-surface-2 transition-all duration-150"
        aria-label="Add another skill"
      >
        <span className="text-base leading-none" aria-hidden="true">
          +
        </span>
        <span>Add Skills</span>
      </button>
    </div>
  )
}
