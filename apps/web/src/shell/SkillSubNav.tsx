/**
 * SkillSubNav.tsx — floating popover for skill-specific navigation.
 *
 * Renders a positioned popover flush to the right edge of the skill row.
 * Shows the skill's nav items (Chat, Jobs, Applications, etc.) plus a
 * "Remove skill" destructive action at the bottom.
 *
 * Positioning:
 *   Uses getBoundingClientRect on the anchor row. The popover is rendered
 *   with position: fixed, left edge at the row's right edge + 4px gap,
 *   top aligned to the row's top. This escapes overflow:hidden containers.
 *
 * Interaction:
 *   - Hover: popover stays open while cursor is over either the row or
 *     the popover (parent manages the 200ms leave delay).
 *   - Click: clicking a nav item navigates and closes the popover.
 *   - Outside click / Escape: closes the popover.
 */

import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import type { SkillDefinition } from '../skills'
import {
  IconChat,
  IconJobs,
  IconHistory,
  IconApplications,
  IconMonitors,
  IconSettings,
  IconTrash,
} from './icons.tsx'

interface IconProps {
  className?: string
}

const NAV_ICONS: Record<string, (props: IconProps) => JSX.Element> = {
  chat: IconChat,
  jobs: IconJobs,
  history: IconHistory,
  applications: IconApplications,
  monitors: IconMonitors,
  results: IconMonitors,
  watchlist: IconJobs,
  signals: IconHistory,
  settings: IconSettings,
}

interface SkillSubNavProps {
  skill: SkillDefinition
  anchorRect: DOMRect | null
  onClose: () => void
  /** Cancel any pending hide timeout (called on popover mouseenter) */
  onCancelHide: () => void
  /** Request a delayed hide (called on popover mouseleave) */
  onRequestHide: () => void
  onRemoveSkill: (key: string) => void
  onNavigate?: () => void
}

export function SkillSubNav({
  skill,
  anchorRect,
  onClose,
  onCancelHide,
  onRequestHide,
  onRemoveSkill,
  onNavigate,
}: SkillSubNavProps): JSX.Element | null {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const popoverRef = useRef<HTMLDivElement>(null)

  // Track a live rect so position stays accurate after resize.
  const [liveRect, setLiveRect] = useState<DOMRect | null>(anchorRect)

  useEffect(() => {
    setLiveRect(anchorRect)
  }, [anchorRect])

  useEffect(() => {
    if (!anchorRect) return
    function handleResize() {
      // anchorRect is stale after resize; close the popover so it doesn't
      // float to a wrong position. Re-hovering will reopen it correctly.
      onClose()
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [anchorRect, onClose])

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Close on outside mousedown. We use mousedown (not click) so that a click
  // that starts inside but ends outside still closes the popover correctly.
  // This replaces the full-screen backdrop div, which was intercepting
  // mouseenter events on the skill rows and breaking the hover-to-stay logic.
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [onClose])

  if (!liveRect) return null

  // Position: flush to the right of the anchor row, aligned to its top.
  // 4px gap keeps the popover visually connected without overlapping.
  const top = liveRect.top
  const left = liveRect.right + 4

  function handleNavClick(navId: string) {
    navigate(`/${skill.key}/${navId}`)
    onClose()
    onNavigate?.()
  }

  function handleRemoveClick() {
    onRemoveSkill(skill.key)
  }

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 w-48 rounded-xl border border-border bg-surface shadow-2xl overflow-hidden"
      style={{ top: `${top}px`, left: `${left}px` }}
      role="menu"
      aria-label={`${skill.name} navigation`}
      onMouseEnter={onCancelHide}
      onMouseLeave={onRequestHide}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-border-subtle">
        <p className="text-[10px] font-mono font-semibold text-text-muted uppercase tracking-wider">
          {skill.name}
        </p>
      </div>

      {/* Nav items */}
      <div className="p-1.5 space-y-0.5">
        {skill.nav.map(({ id, label }) => {
          const path = `/${skill.key}/${id}`
          const active = pathname === path || (pathname === `/${skill.key}` && id === 'chat')
          const IconComp = NAV_ICONS[id]

          return (
            <button
              key={id}
              role="menuitem"
              onClick={() => handleNavClick(id)}
              className={[
                'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-left',
                'transition-all duration-100 cursor-pointer',
                active
                  ? 'bg-accent-dim text-accent'
                  : 'text-text-muted hover:bg-surface-2 hover:text-text',
              ].join(' ')}
              aria-current={active ? 'page' : undefined}
            >
              {IconComp && <IconComp className="w-4 h-4 shrink-0" />}
              <span className="font-medium">{label}</span>
              {active && (
                <span
                  className="ml-auto w-[3px] h-4 rounded-full bg-accent shrink-0"
                  aria-hidden="true"
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Divider + Remove action */}
      <div className="border-t border-border-subtle">
        <div className="p-1.5">
          <button
            role="menuitem"
            onClick={handleRemoveClick}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-left text-danger hover:bg-surface-2 transition-colors cursor-pointer"
          >
            <IconTrash className="w-4 h-4 shrink-0" />
            <span>Remove skill</span>
          </button>
        </div>
      </div>
    </div>
  )
}
