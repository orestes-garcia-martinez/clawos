/**
 * SkillSwitcher.tsx — compact skill selector in the platform sidebar.
 *
 * Only 'active' skills are fully navigable.
 * 'installed' and 'coming_soon' skills show a status overlay instead of
 * entering their workspace, preserving future extensibility in the shell
 * without shipping half-built flows.
 */

import type { JSX } from 'react'
import type { SkillKey } from '../skills'
import { SKILLS } from '../skills'

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  installed: 'Installed',
  coming_soon: 'Coming soon',
}

const STATUS_COLORS: Record<string, string> = {
  active: 'var(--success)',
  installed: 'var(--accent-2)',
  coming_soon: 'var(--text-muted)',
}

interface SkillSwitcherProps {
  activeSkill: SkillKey
  onSelectSkill: (key: SkillKey) => void
}

export function SkillSwitcher({ activeSkill, onSelectSkill }: SkillSwitcherProps): JSX.Element {
  return (
    <div className="px-3 py-2 border-b border-border-subtle">
      <p className="px-2 mb-1.5 text-[10px] font-mono font-semibold text-text-muted uppercase tracking-widest">
        Skills
      </p>
      <div className="space-y-0.5" role="listbox" aria-label="Select skill">
        {SKILLS.map((skill) => {
          const isActive = skill.key === activeSkill
          const isAvailable = skill.status === 'active'
          const statusColor = STATUS_COLORS[skill.status] ?? 'var(--text-muted)'

          return (
            <button
              key={skill.key}
              role="option"
              aria-selected={isActive}
              onClick={() => {
                if (isAvailable) onSelectSkill(skill.key)
                else onSelectSkill(skill.key) // still sets active for "coming soon" overlay
              }}
              className={[
                'w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-sm text-left',
                'transition-all duration-150',
                isActive
                  ? 'bg-surface-3 text-text'
                  : 'text-text-muted hover:bg-surface-2 hover:text-text',
              ].join(' ')}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: statusColor }}
                  aria-hidden="true"
                />
                <span className="font-medium truncate">{skill.name}</span>
              </div>
              <span className="text-[10px] font-mono shrink-0" style={{ color: statusColor }}>
                {STATUS_LABELS[skill.status]}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
