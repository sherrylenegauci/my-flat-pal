import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { App } from '../../src/ui/App'
import { save } from '../../src/storage/repository'
import { emptyDocument } from '../../src/storage/schema'

/**
 * T044 — two jobs may share a name.
 *
 * "Filter change" for two different filters is a normal thing to want, and the
 * spec lists it as an explicit edge case. Nothing tested it, and a naive
 * implementation keyed on name would silently merge them.
 */
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0))
})
afterEach(() => vi.useRealTimers())

describe('two jobs with the same name', () => {
  it('both appear, independently', async () => {
    save({
      ...emptyDocument(),
      items: [
        {
          id: 'itm_a',
          name: 'Filter change',
          interval: { count: 3, unit: 'month' },
          createdAt: '2026-01-01',
          completions: [],
        },
        {
          id: 'itm_b',
          name: 'Filter change',
          interval: { count: 6, unit: 'month' },
          createdAt: '2026-02-01',
          completions: [
            { id: 'c1', completedOn: '2024-01-01', recordedAt: '2024-01-01T00:00:00Z' },
          ],
        },
      ],
    })

    render(<App />)
    await screen.findAllByText('Filter change')

    expect(screen.getAllByText('Filter change')).toHaveLength(2)
    // And they are genuinely separate: one is overdue, the other never done.
    expect(screen.getByText(/overdue/i)).toBeTruthy()
    expect(screen.getByText(/never done/i)).toBeTruthy()
  })
})
