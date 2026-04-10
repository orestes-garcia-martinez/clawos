/**
 * PlatformNav.tsx — ClawOS-owned platform navigation.
 *
 * Items here are stable across skill switches (Sessions, Notifications,
 * Account). The active item is determined by the current path.
 *
 * REDESIGN (v2):
 *   "+ Add Skills" has been relocated from the Skills section to here,
 *   appearing as a utility action at the top of the Platform section.
 *   This keeps the skill list focused on installed skills only, while
 *   framing "Add Skills" as a platform-level action.
 */

import type { JSX } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

import { IconLayers, IconBell, IconSettings, IconPlus, IconDocument } from './icons.tsx'
import { PLATFORM_NAV } from '../skills'
import React from 'react'

interface IconProps {
  className?: string
}

const NAV_ICONS: Record<string, (props: IconProps) => JSX.Element> = {
  sessions: IconLayers,
  notifications: IconBell,
  account: IconSettings,
}

const DOCS_URL = 'https://docs.clawoshq.com/'

interface PlatformNavProps {
  onAddSkills?: () => void
}

export function PlatformNav({ onAddSkills }: PlatformNavProps): JSX.Element {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  function handleAddSkills() {
    if (onAddSkills) {
      onAddSkills()
    } else {
      navigate('/skills')
    }
  }

  return (
    <div className="px-3 py-2">
      <p className="px-2 mb-1.5 text-[10px] font-mono font-semibold text-text-muted uppercase tracking-widest">
        Platform
      </p>
      <nav aria-label="Platform navigation">
        {/* Add Skills — sits above platform links as a top-level action */}
        <button
          onClick={handleAddSkills}
          className="w-full flex items-center gap-3 px-3 py-2 mb-0.5 rounded-xl text-[13px] text-left text-text-muted hover:text-text hover:bg-surface-2 transition-all duration-150 cursor-pointer"
          aria-label="Add another skill"
        >
          <IconPlus className="w-3.5 h-3.5 shrink-0" />
          <span>Add skills</span>
        </button>

        {PLATFORM_NAV.map(({ id, label, path }) => {
          const active = pathname.startsWith(path)
          const IconComp = NAV_ICONS[id]

          /* Render Documentation link after notifications */
          const extra =
            id === 'notifications' ? (
              <a
                key="documentation"
                href={DOCS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={[
                  'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-left cursor-pointer',
                  'transition-all duration-150',
                  'text-text-muted hover:bg-surface-2 hover:text-text',
                ].join(' ')}
              >
                <IconDocument />
                <span className="font-medium">Documentation</span>
              </a>
            ) : null

          return (
            <React.Fragment key={id}>
              <button
                onClick={() => navigate(path)}
                className={[
                  'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-left cursor-pointer',
                  'transition-all duration-150',
                  active
                    ? 'bg-surface-2 text-text'
                    : 'text-text-muted hover:bg-surface-2 hover:text-text',
                ].join(' ')}
                aria-current={active ? 'page' : undefined}
              >
                {IconComp && <IconComp />}
                <span className="font-medium">{label}</span>
              </button>
              {extra}
            </React.Fragment>
          )
        })}
      </nav>
    </div>
  )
}
