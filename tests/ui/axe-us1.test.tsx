import { describe, it, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'
import { expectNoViolations } from './axe-helper'
import { save } from '../../src/storage/repository'
import { emptyDocument } from '../../src/storage/schema'

/**
 * T046 — structural accessibility across the US1 views.
 *
 * Covers roles, names, labelling and ARIA. Does NOT cover contrast: jsdom
 * resolves no cascaded colour, so that assertion would pass whatever the
 * palette. Contrast is guaranteed in tokens.css and measured for real in T074.
 */
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0))
})
afterEach(() => vi.useRealTimers())

describe('accessibility', () => {
  it('the empty state has no violations', async () => {
    const { container } = render(<App />)
    await screen.findByRole('main')
    await expectNoViolations(container)
  })

  it('the schedule list has no violations', async () => {
    save({
      ...emptyDocument(),
      items: [
        {
          id: 'itm_a',
          name: 'Boiler service',
          interval: { count: 1, unit: 'year' },
          createdAt: '2026-01-01',
          completions: [
            { id: 'c1', completedOn: '2024-05-01', recordedAt: '2024-05-01T00:00:00Z' },
          ],
        },
        {
          id: 'itm_b',
          name: 'Smoke alarms',
          interval: { count: 3, unit: 'month' },
          createdAt: '2026-01-01',
          completions: [],
        },
      ],
    })

    const { container } = render(<App />)
    await screen.findByText('Boiler service')
    await expectNoViolations(container)
  })

  it('the add form has no violations', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { container } = render(<App />)
    await user.click(await screen.findByRole('button', { name: /add/i }))

    await expectNoViolations(container)
  })
})
