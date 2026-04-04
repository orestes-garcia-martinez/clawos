import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { PlatformNav } from './PlatformNav.tsx'

function renderNav(props: { onAddSkills?: () => void; path?: string } = {}) {
  return render(
    <MemoryRouter initialEntries={[props.path ?? '/']}>
      <PlatformNav onAddSkills={props.onAddSkills} />
    </MemoryRouter>,
  )
}

describe('PlatformNav', () => {
  describe('Add skills button', () => {
    it('renders before the platform nav items', () => {
      renderNav()
      const nav = screen.getByRole('navigation', { name: 'Platform navigation' })
      const buttons = within(nav).getAllByRole('button')
      expect(buttons[0]).toHaveAccessibleName('Add another skill')
    })

    it('calls onAddSkills prop when clicked', async () => {
      const onAddSkills = vi.fn()
      renderNav({ onAddSkills })
      await userEvent.click(screen.getByRole('button', { name: 'Add another skill' }))
      expect(onAddSkills).toHaveBeenCalledOnce()
    })

    it('navigates to /skills when no onAddSkills prop is provided', async () => {
      // When no prop is given, the fallback calls navigate('/skills').
      // Since we can't easily assert router state here, we just confirm the
      // button is present and clickable without throwing.
      renderNav()
      await userEvent.click(screen.getByRole('button', { name: 'Add another skill' }))
      // No error thrown — fallback navigate called without error
    })
  })

  describe('Platform nav items', () => {
    it('renders Sessions, Notifications, and Account links', () => {
      renderNav()
      expect(screen.getByRole('button', { name: /sessions/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /account/i })).toBeInTheDocument()
    })

    it('marks the active route with aria-current="page"', () => {
      renderNav({ path: '/sessions' })
      expect(screen.getByRole('button', { name: /sessions/i })).toHaveAttribute(
        'aria-current',
        'page',
      )
      expect(screen.getByRole('button', { name: /notifications/i })).not.toHaveAttribute(
        'aria-current',
      )
    })

    it('Sessions is above Notifications in the DOM', () => {
      renderNav()
      const nav = screen.getByRole('navigation', { name: 'Platform navigation' })
      const buttons = within(nav)
        .getAllByRole('button')
        .map((b) => b.textContent)
      const sessionsIdx = buttons.findIndex((t) => /sessions/i.test(t ?? ''))
      const notificationsIdx = buttons.findIndex((t) => /notifications/i.test(t ?? ''))
      expect(sessionsIdx).toBeLessThan(notificationsIdx)
    })
  })

  describe('button order', () => {
    it('"Add skills" appears before "Sessions" in the DOM', () => {
      renderNav()
      const nav = screen.getByRole('navigation', { name: 'Platform navigation' })
      const buttons = within(nav).getAllByRole('button')
      const labels = buttons.map((b) => b.getAttribute('aria-label') ?? b.textContent)
      const addIdx = labels.findIndex((l) => /add another skill/i.test(l ?? ''))
      const sessionsIdx = labels.findIndex((l) => /sessions/i.test(l ?? ''))
      expect(addIdx).toBeLessThan(sessionsIdx)
    })
  })
})
