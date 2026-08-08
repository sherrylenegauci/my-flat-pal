import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { App } from '../../src/ui/App'
import { save } from '../../src/storage/repository'
import { emptyDocument } from '../../src/storage/schema'
import type { MaintenanceItem } from '../../src/domain/types'

/**
 * T042 — the list. US1 scenarios 3 and 4, FR-004.
 *
 * Seeded through the repository rather than the form, so these test the list
 * itself rather than re-testing adding.
 */
function item(over: Partial<MaintenanceItem>): MaintenanceItem {
  return {
    id: `itm_${over.name}`,
    name: 'Something',
    interval: { count: 1, unit: 'year' },
    createdAt: '2026-01-01',
    completions: [],
    ...over,
  }
}

function seed(items: MaintenanceItem[]) {
  save({ ...emptyDocument(), items })
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0))
})
afterEach(() => vi.useRealTimers())

const rowNames = () =>
  screen.getAllByRole('listitem').map((li) => within(li).getByRole('heading').textContent)

describe('ordering', () => {
  it('puts what needs attention above what does not', async () => {
    seed([
      item({
        name: 'Gutters',
        completions: [{ id: 'c1', completedOn: '2026-08-01', recordedAt: '2026-08-01T00:00:00Z' }],
      }),
      item({
        name: 'Boiler service',
        completions: [{ id: 'c2', completedOn: '2024-01-01', recordedAt: '2024-01-01T00:00:00Z' }],
      }),
      item({ name: 'Smoke alarms' }),
    ])
    render(<App />)
    await screen.findByText('Boiler service')

    expect(rowNames()).toEqual(['Boiler service', 'Smoke alarms', 'Gutters'])
  })

  it('puts the longest overdue first', async () => {
    seed([
      item({
        name: 'Slightly late',
        completions: [{ id: 'c1', completedOn: '2025-08-01', recordedAt: '2025-08-01T00:00:00Z' }],
      }),
      item({
        name: 'Badly late',
        completions: [{ id: 'c2', completedOn: '2022-01-01', recordedAt: '2022-01-01T00:00:00Z' }],
      }),
    ])
    render(<App />)
    await screen.findByText('Badly late')

    expect(rowNames()).toEqual(['Badly late', 'Slightly late'])
  })
})

describe('what each row shows', () => {
  it('shows the next due date without needing a tap', async () => {
    // US1 scenario 4 — you can tell when something is next due from the list.
    seed([
      item({
        name: 'Boiler service',
        completions: [{ id: 'c1', completedOn: '2026-06-14', recordedAt: '2026-06-14T00:00:00Z' }],
      }),
    ])
    render(<App />)

    const row = within(await screen.findByRole('listitem'))
    expect(row.getByText(/14 June 2027|2027-06-14/)).toBeTruthy()
  })

  it('distinguishes overdue from not-due by more than colour', async () => {
    // US1 scenario 3, and SC colour-independence. Colour alone fails for
    // roughly one in twelve men.
    seed([
      item({
        name: 'Boiler service',
        completions: [{ id: 'c1', completedOn: '2024-01-01', recordedAt: '2024-01-01T00:00:00Z' }],
      }),
      item({
        name: 'Gutters',
        completions: [{ id: 'c2', completedOn: '2026-08-01', recordedAt: '2026-08-01T00:00:00Z' }],
      }),
    ])
    render(<App />)
    await screen.findByText('Boiler service')

    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]!).getByText(/overdue/i)).toBeTruthy()
    expect(within(rows[1]!).queryByText(/overdue/i)).toBeNull()
  })

  it('shows never-done jobs as never done, with no due date', async () => {
    seed([item({ name: 'Boiler service' })])
    render(<App />)

    const row = within(await screen.findByRole('listitem'))
    expect(row.getByText(/never done/i)).toBeTruthy()
    // No date of any kind. `queryByText(/due/i)` used to stand here and could
    // never match the rendered "Next 14 June 2027", so it passed regardless.
    expect(screen.getByRole('listitem').textContent).not.toMatch(/\d{4}/)
  })
})
