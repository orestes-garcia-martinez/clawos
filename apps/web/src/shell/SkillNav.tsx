/**
 * SkillNav.tsx — workspace navigation owned by the active skill.
 *
 * Items change when the active skill changes. The path convention is
 * /<skillKey>/<navItemId> (e.g. /careerclaw/chat, /careerclaw/jobs).
 */
import type { JSX } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import type { SkillDefinition } from '../skills'
import { IconChat, IconJobs, IconHistory, IconMonitors, IconSettings } from './icons.tsx'

interface IconProps {
  className?: string
}

const NAV_ICONS: Record<string, (props: IconProps) => JSX.Element> = {
  chat: IconChat,
  jobs: IconJobs,
  history: IconHistory,
  monitors: IconMonitors,
  results: IconMonitors,
  watchlist: IconJobs,
  signals: IconHistory,
  settings: IconSettings,
}

interface SkillNavProps {
  skill: SkillDefinition
  onNavigate?: () => void
}

export function SkillNav({ skill, onNavigate }: SkillNavProps): JSX.Element {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  return (
    <div className="px-3 py-2 flex-1">
      <p className="px-2 mb-1.5 text-[10px] font-mono font-semibold text-text-muted uppercase tracking-widest">
        {skill.name}
      </p>
      <nav aria-label={`${skill.name} navigation`}>
        {skill.nav.map(({ id, label }) => {
          const path = `/${skill.key}/${id}`
          const active = pathname === path || (pathname === `/${skill.key}` && id === 'chat')
          const IconComp = NAV_ICONS[id]

          return (
            <button
              key={id}
              onClick={() => {
                navigate(path)
                onNavigate?.()
              }}
              className={[
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left',
                'transition-all duration-150',
                active
                  ? 'bg-accent-dim text-accent'
                  : 'text-text-muted hover:bg-surface-2 hover:text-text',
              ].join(' ')}
              aria-current={active ? 'page' : undefined}
            >
              {IconComp && <IconComp />}
              <span className="font-medium">{label}</span>
              {active && (
                <span
                  className="ml-auto w-1 h-4 rounded-full bg-accent shrink-0"
                  aria-hidden="true"
                />
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
