import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'

/**
 * T041 — adding a job. US1 scenarios 2 and 4, FR-001, FR-002, FR-004a.
 */
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0))
})
afterEach(() => vi.useRealTimers())

async function openTheForm(user: ReturnType<typeof userEvent.setup>) {
  render(<App />)
  await user.click(await screen.findByRole('button', { name: /add/i }))
}

async function fillIn(
  user: ReturnType<typeof userEvent.setup>,
  fields: { name: string; count?: string; unit?: string; lastDone?: string },
) {
  await user.clear(screen.getByLabelText(/name/i))
  await user.type(screen.getByLabelText(/name/i), fields.name)

  if (fields.count !== undefined) {
    await user.clear(screen.getByLabelText(/how often/i))
    await user.type(screen.getByLabelText(/how often/i), fields.count)
  }
  if (fields.unit !== undefined) {
    await user.selectOptions(screen.getByLabelText(/period|unit/i), fields.unit)
  }
  if (fields.lastDone !== undefined) {
    await user.type(screen.getByLabelText(/last done/i), fields.lastDone)
  }
}

describe('adding a job', () => {
  it('saves it and shows when it is next due', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await openTheForm(user)

    await fillIn(user, { name: 'Boiler service', count: '1', unit: 'year', lastDone: '2026-06-14' })
    await user.click(screen.getByRole('button', { name: /save|add/i }))

    expect(await screen.findByText('Boiler service')).toBeTruthy()
    // Counted from when it was actually done: 14 June 2026 + 1 year.
    expect(screen.getByText(/14 June 2027|2027-06-14/)).toBeTruthy()
  })

  it('accepts every interval unit, and each one changes the due date', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    // Last done 1 Aug 2026, interval of 2 — one distinct due date per unit.
    const expectedDue: Record<string, string> = {
      day: '3 August 2026',
      week: '15 August 2026',
      month: '1 October 2026',
      year: '1 August 2028',
    }

    for (const unit of ['day', 'week', 'month', 'year']) {
      localStorage.clear()
      const { unmount } = render(<App />)
      await user.click(await screen.findByRole('button', { name: /add/i }))

      await fillIn(user, { name: `Every ${unit}`, count: '2', unit, lastDone: '2026-08-01' })
      await user.click(screen.getByRole('button', { name: /save|add/i }))

      await screen.findByText(`Every ${unit}`)
      // Assert the interval actually round-tripped. Checking only that the name
      // appeared would pass even if the unit were discarded and everything
      // treated as annual.
      expect(screen.getByRole('listitem').textContent).toContain(expectedDue[unit])
      unmount()
    }
  })

  it('holds a job with no last-done date as never done, with no invented date', async () => {
    // FR-004a. The most common case when you move in: you know the boiler needs
    // servicing, you have no idea when it last was. The app must not guess.
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await openTheForm(user)

    await fillIn(user, { name: 'Boiler service', count: '1', unit: 'year' })
    await user.click(screen.getByRole('button', { name: /save|add/i }))

    expect(await screen.findByText('Boiler service')).toBeTruthy()
    expect(screen.getByText(/never done/i)).toBeTruthy()

    // Assert no date is rendered at all, rather than matching a phrase.
    // The previous assertion was `queryByText(/next due/i)` — the row renders
    // "Next 14 June 2027", which that regex never matches, so it passed whether
    // or not a fabricated date was shown. FR-004a's whole point is that the app
    // must not invent a service history, and nothing was guarding it.
    const row = screen.getByRole('listitem')
    expect(row.textContent).not.toMatch(/\d{4}/)
  })

  it('refuses an empty name, and says so against the field', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await openTheForm(user)

    await user.click(screen.getByRole('button', { name: /save|add/i }))

    const nameField = screen.getByLabelText(/name/i)
    expect(nameField.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByRole('alert').textContent).toMatch(/name/i)
  })

  it('refuses an interval below 1', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await openTheForm(user)

    await fillIn(user, { name: 'Something', count: '0', unit: 'month' })
    await user.click(screen.getByRole('button', { name: /save|add/i }))

    expect(screen.getByLabelText(/how often/i).getAttribute('aria-invalid')).toBe('true')
  })

  it('refuses a last-done date in the future', async () => {
    // You cannot have already done something you have not done yet.
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await openTheForm(user)

    await fillIn(user, { name: 'Something', count: '1', unit: 'year', lastDone: '2027-01-01' })
    await user.click(screen.getByRole('button', { name: /save|add/i }))

    expect(screen.getByLabelText(/last done/i).getAttribute('aria-invalid')).toBe('true')
  })

  it('accepts a last-done date from before the app existed', async () => {
    // A boiler serviced years ago is exactly the history worth recording — and
    // it legitimately produces an overdue job (FR-013a).
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await openTheForm(user)

    await fillIn(user, { name: 'Boiler service', count: '1', unit: 'year', lastDone: '2024-05-01' })
    await user.click(screen.getByRole('button', { name: /save|add/i }))

    expect(await screen.findByText('Boiler service')).toBeTruthy()
    expect(screen.getByText(/overdue/i)).toBeTruthy()
  })
})
