import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { SkillSwitcher } from './SkillSwitcher.tsx'

// Mock SkillsContext so tests don't need a real Supabase connection.
vi.mock('../context/SkillsContext.tsx', () => ({
  useSkills: vi.fn(),
}))

// Mock the generated skill-versions JSON imported inside skills/index.ts.
vi.mock('../generated/skill-versions.json', () => ({ default: { careerclaw: '1.0.0' } }))

import { useSkills } from '../context/SkillsContext.tsx'
const mockUseSkills = vi.mocked(useSkills)

function setupSkills(slugs: string[] = ['careerclaw']) {
  mockUseSkills.mockReturnValue({
    installedSlugs: slugs as never,
    loading: false,
    installSkill: vi.fn(),
    removeSkill: vi.fn(),
    updateLastUsed: vi.fn(),
  })
}

function renderSwitcher(props: Partial<Parameters<typeof SkillSwitcher>[0]> = {}) {
  const merged = {
    activeSkill: null,
    onSelectSkill: vi.fn(),
    onRemoveSkill: vi.fn(),
    onNavigate: vi.fn(),
    ...props,
  }
  return {
    ...render(
      <MemoryRouter>
        <SkillSwitcher {...(merged as Parameters<typeof SkillSwitcher>[0])} />
      </MemoryRouter>,
    ),
    props: merged,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  setupSkills(['careerclaw'])
})

describe('SkillSwitcher', () => {
  describe('skill list rendering', () => {
    it('renders installed available skills', () => {
      renderSwitcher()
      expect(screen.getByRole('option', { name: /careerclaw/i })).toBeInTheDocument()
    })

    it('does not render coming_soon skills even if installed', () => {
      // scrapeclaw and investclaw have status: 'coming_soon' in SKILL_MAP
      setupSkills(['careerclaw', 'scrapeclaw', 'investclaw'])
      renderSwitcher()
      expect(screen.getByRole('option', { name: /careerclaw/i })).toBeInTheDocument()
      expect(screen.queryByRole('option', { name: /scrapeclaw/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('option', { name: /investclaw/i })).not.toBeInTheDocument()
    })

    it('renders nothing when no skills are installed', () => {
      setupSkills([])
      renderSwitcher()
      expect(screen.queryByRole('option')).not.toBeInTheDocument()
    })

    it('marks the active skill with aria-selected="true"', () => {
      renderSwitcher({ activeSkill: 'careerclaw' as never })
      expect(screen.getByRole('option', { name: /careerclaw/i })).toHaveAttribute(
        'aria-selected',
        'true',
      )
    })
  })

  describe('popover on hover', () => {
    it('shows the SkillSubNav popover when a skill row is hovered', () => {
      renderSwitcher()
      const row = screen.getByRole('option', { name: /careerclaw/i }).parentElement!
      fireEvent.mouseEnter(row)
      expect(screen.getByRole('menu', { name: /careerclaw navigation/i })).toBeInTheDocument()
    })

    it('hides the popover after the mouse leaves and the delay elapses', async () => {
      vi.useFakeTimers()
      renderSwitcher()
      const row = screen.getByRole('option', { name: /careerclaw/i }).parentElement!
      fireEvent.mouseEnter(row)
      expect(screen.getByRole('menu')).toBeInTheDocument()

      fireEvent.mouseLeave(row)
      await act(() => vi.advanceTimersByTimeAsync(250))
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
      vi.useRealTimers()
    })

    it('keeps the popover open when cursor moves from row to popover', async () => {
      vi.useFakeTimers()
      renderSwitcher()
      const row = screen.getByRole('option', { name: /careerclaw/i }).parentElement!
      fireEvent.mouseEnter(row)
      fireEvent.mouseLeave(row) // starts the hide timer
      // Cursor enters the popover before the timer fires
      fireEvent.mouseEnter(screen.getByRole('menu'))
      await act(() => vi.advanceTimersByTimeAsync(250))
      // Popover should still be visible
      expect(screen.getByRole('menu')).toBeInTheDocument()
      vi.useRealTimers()
    })

    it('calls onSelectSkill when the skill button is clicked', async () => {
      const { props } = renderSwitcher()
      await userEvent.click(screen.getByRole('option', { name: /careerclaw/i }))
      expect(props.onSelectSkill).toHaveBeenCalledWith('careerclaw')
    })
  })

  describe('remove skill flow', () => {
    it('opens the confirmation modal when Remove skill is clicked in the popover', async () => {
      renderSwitcher()
      const row = screen.getByRole('option', { name: /careerclaw/i }).parentElement!
      fireEvent.mouseEnter(row)
      await userEvent.click(screen.getByRole('menuitem', { name: /remove skill/i }))
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText(/remove careerclaw/i)).toBeInTheDocument()
    })

    it('calls onRemoveSkill when confirmed', async () => {
      const { props } = renderSwitcher()
      const row = screen.getByRole('option', { name: /careerclaw/i }).parentElement!
      fireEvent.mouseEnter(row)
      await userEvent.click(screen.getByRole('menuitem', { name: /remove skill/i }))
      await userEvent.click(screen.getByRole('button', { name: /^remove$/i }))
      expect(props.onRemoveSkill).toHaveBeenCalledWith('careerclaw')
    })

    it('dismisses the modal without removing when Cancel is clicked', async () => {
      const { props } = renderSwitcher()
      const row = screen.getByRole('option', { name: /careerclaw/i }).parentElement!
      fireEvent.mouseEnter(row)
      await userEvent.click(screen.getByRole('menuitem', { name: /remove skill/i }))
      await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
      expect(props.onRemoveSkill).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})
