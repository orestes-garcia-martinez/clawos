/**
 * PlatformNav.tsx — ClawOS-owned platform navigation.
 *
 * Items here are stable across skill switches (Sessions, Notifications,
 * Account). The active item is determined by the current path.
 */

import type { JSX } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

import { IconLayers, IconBell, IconSettings } from './icons.tsx'
import { PLATFORM_NAV } from '../skills'

interface IconProps {
  className?: string
}

const NAV_ICONS: Record<string, (props: IconProps) => JSX.Element> = {
  sessions: IconLayers,
  notifications: IconBell,
  account: IconSettings,
}

export function PlatformNav(): JSX.Element {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  return (
    <div className="px-3 py-2">
      <p className="px-2 mb-1.5 text-[10px] font-mono font-semibold text-text-muted uppercase tracking-widest">
        Platform
      </p>
      <nav aria-label="Platform navigation">
        {PLATFORM_NAV.map(({ id, label, path }) => {
          const active = pathname.startsWith(path)
          const IconComp = NAV_ICONS[id]

          return (
            <button
              key={id}
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
          )
        })}
      </nav>
    </div>
  )
}
