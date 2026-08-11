import { describe, it, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'
import { expectNoViolations } from './axe-helper'
import { YEARLY, aCompletion, anItem, seed } from './seed'

/**
 * T058 — structural accessibility across the views US2 adds.
 *
 * Roles, accessible names, labelling and ARIA. Not contrast: jsdom resolves no
 * cascaded colour, so that assertion would pass whatever the palette. The
 * detail view is swept for contrast, layout, focus and axe against real
 * rendering in `e2e/` instead, which is why it was added to `APP_STATES` — a
 * view missing from that list is a view no browser-tier check covers.
 */
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0))
})
afterEach(() => vi.useRealTimers())

const withHistory = () =>
  anItem({
    name: 'Boiler service',
    interval: YEARLY,
    completions: [aCompletion('2024-05-06'), aCompletion('2025-05-11')],
  })

describe('accessibility', () => {
  it('the job detail view has no violations', async () => {
    seed([withHistory()])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { container } = render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Boiler service' }))
    await screen.findByRole('heading', { name: 'Boiler service', level: 2 })

    await expectNoViolations(container)
  })

  it('a job with no history has no violations', async () => {
    seed([anItem({ name: 'Boiler service', interval: YEARLY })])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { container } = render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Boiler service' }))
    await screen.findByRole('heading', { name: 'Boiler service', level: 2 })

    await expectNoViolations(container)
  })

  it('the detail view showing a validation error has no violations', async () => {
    seed([withHistory()])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { container } = render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Boiler service' }))
    await user.type(screen.getByLabelText(/date it was done/i), '2027-01-01')
    await user.click(screen.getByRole('button', { name: /record it/i }))
    await screen.findByText(/in the future/i)

    await expectNoViolations(container)
  })

  it('the list showing an undo notice has no violations', async () => {
    seed([withHistory()])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { container } = render(<App />)

    await user.click(await screen.findByRole('button', { name: /mark done/i }))
    await screen.findByRole('button', { name: /undo/i })

    await expectNoViolations(container)
  })
})
