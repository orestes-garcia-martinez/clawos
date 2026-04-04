import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { SkillSubNav } from './SkillSubNav.tsx'
import type { SkillDefinition } from '../skills'

const MOCK_SKILL: SkillDefinition = {
  key: 'careerclaw',
  name: 'CareerClaw',
  status: 'available',
  description: 'Job search automation',
  heroTitle: 'Ready to hunt.',
  heroBody: '',
  trustSignal: '',
  nav: [
    { id: 'chat', label: 'Chat' },
    { id: 'jobs', label: 'Jobs' },
    { id: 'applications', label: 'Applications' },
  ],
  quickActions: [],
  composerPlaceholder: '',
}

// A DOMRect with the anchor positioned at the right edge of the sidebar.
const ANCHOR_RECT = {
  top: 100,
  right: 240,
  bottom: 136,
  left: 0,
  width: 240,
  height: 36,
  x: 0,
  y: 100,
  toJSON: () => ({}),
} as DOMRect

function renderSubNav(
  overrides: Partial<Parameters<typeof SkillSubNav>[0]> = {},
  path = '/careerclaw/chat',
) {
  const props = {
    skill: MOCK_SKILL,
    anchorRect: ANCHOR_RECT,
    onClose: vi.fn(),
    onCancelHide: vi.fn(),
    onRequestHide: vi.fn(),
    onRemoveSkill: vi.fn(),
    onNavigate: vi.fn(),
    ...overrides,
  }

  return {
    ...render(
      <MemoryRouter initialEntries={[path]}>
        <SkillSubNav {...props} />
      </MemoryRouter>,
    ),
    props,
  }
}

describe('SkillSubNav', () => {
  describe('rendering', () => {
    it('renders the skill name in the header', () => {
      renderSubNav()
      expect(screen.getByText('CareerClaw')).toBeInTheDocument()
    })

    it('renders all nav items from the skill definition', () => {
      renderSubNav()
      expect(screen.getByRole('menuitem', { name: /chat/i })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: /jobs/i })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: /applications/i })).toBeInTheDocument()
    })

    it('renders the Remove skill action', () => {
      renderSubNav()
      expect(screen.getByRole('menuitem', { name: /remove skill/i })).toBeInTheDocument()
    })

    it('returns null when anchorRect is null', () => {
      const { container } = renderSubNav({ anchorRect: null })
      expect(container).toBeEmptyDOMElement()
    })

    it('positions the popover using the anchor rect', () => {
      renderSubNav()
      const menu = screen.getByRole('menu')
      expect(menu).toHaveStyle({ top: '100px', left: '244px' }) // right(240) + 4px gap
    })
  })

  describe('active state', () => {
    it('marks the current page nav item with aria-current="page"', () => {
      renderSubNav({}, '/careerclaw/jobs')
      expect(screen.getByRole('menuitem', { name: /jobs/i })).toHaveAttribute(
        'aria-current',
        'page',
      )
      expect(screen.getByRole('menuitem', { name: /chat/i })).not.toHaveAttribute('aria-current')
    })

    it('treats /careerclaw root as active for the Chat item', () => {
      renderSubNav({}, '/careerclaw')
      expect(screen.getByRole('menuitem', { name: /chat/i })).toHaveAttribute(
        'aria-current',
        'page',
      )
    })
  })

  describe('interactions', () => {
    it('calls onClose and onNavigate when a nav item is clicked', async () => {
      const { props } = renderSubNav()
      await userEvent.click(screen.getByRole('menuitem', { name: /jobs/i }))
      expect(props.onClose).toHaveBeenCalledOnce()
      expect(props.onNavigate).toHaveBeenCalledOnce()
    })

    it('calls onRemoveSkill with the skill key when Remove is clicked', async () => {
      const { props } = renderSubNav()
      await userEvent.click(screen.getByRole('menuitem', { name: /remove skill/i }))
      expect(props.onRemoveSkill).toHaveBeenCalledWith('careerclaw')
    })

    it('calls onClose when Escape is pressed', () => {
      const { props } = renderSubNav()
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(props.onClose).toHaveBeenCalledOnce()
    })

    it('calls onClose on outside mousedown', () => {
      const { props } = renderSubNav()
      fireEvent.mouseDown(document.body)
      expect(props.onClose).toHaveBeenCalledOnce()
    })

    it('does not call onClose on mousedown inside the popover', () => {
      const { props } = renderSubNav()
      const menu = screen.getByRole('menu')
      fireEvent.mouseDown(menu)
      expect(props.onClose).not.toHaveBeenCalled()
    })

    it('calls onCancelHide on popover mouseenter', () => {
      const { props } = renderSubNav()
      fireEvent.mouseEnter(screen.getByRole('menu'))
      expect(props.onCancelHide).toHaveBeenCalledOnce()
    })

    it('calls onRequestHide on popover mouseleave', () => {
      const { props } = renderSubNav()
      fireEvent.mouseLeave(screen.getByRole('menu'))
      expect(props.onRequestHide).toHaveBeenCalledOnce()
    })
  })

  describe('cleanup', () => {
    it('removes the keydown listener on unmount', () => {
      const { props, unmount } = renderSubNav()
      unmount()
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(props.onClose).not.toHaveBeenCalled()
    })

    it('removes the mousedown listener on unmount', () => {
      const { props, unmount } = renderSubNav()
      unmount()
      fireEvent.mouseDown(document.body)
      expect(props.onClose).not.toHaveBeenCalled()
    })
  })
})
