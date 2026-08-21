import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'

/**
 * T043 — US1 scenario 5: close the app entirely, come back, everything is
 * still there.
 *
 * This previously had no test at all — only an assertion buried inside an
 * implementation task, which cannot be observed failing first. It is also the
 * scenario that matters most: with no export path, if persistence is broken the
 * data is simply gone.
 */
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0))
})
afterEach(() => vi.useRealTimers())

describe('coming back later', () => {
  it('still has the jobs you added', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    const first = render(<App />)
    await user.click(await screen.findByRole('button', { name: /add/i }))
    await user.type(screen.getByLabelText(/name/i), 'Boiler service')
    // The interval count box, by its visible label "Every" (T115). Not
    // `/how often/i`: the legend is borrowed back through `aria-labelledby`, so
    // that regex matches this input under both wordings and can never go red.
    await user.clear(screen.getByLabelText(/^every$/i))
    await user.type(screen.getByLabelText(/^every$/i), '1')
    await user.selectOptions(screen.getByLabelText(/period|unit/i), 'year')
    await user.type(screen.getByLabelText(/last done/i), '2026-06-14')
    await user.click(screen.getByRole('button', { name: /save|add/i }))
    await screen.findByText('Boiler service')

    // Tearing down and remounting against the same storage is what "closed the
    // app and came back" means here.
    first.unmount()
    render(<App />)

    expect(await screen.findByText('Boiler service')).toBeTruthy()
  })

  it('still has the status, not just the name', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    const first = render(<App />)
    await user.click(await screen.findByRole('button', { name: /add/i }))
    await user.type(screen.getByLabelText(/name/i), 'Old boiler')
    // The interval count box, by its visible label "Every" (T115). Not
    // `/how often/i`: the legend is borrowed back through `aria-labelledby`, so
    // that regex matches this input under both wordings and can never go red.
    await user.clear(screen.getByLabelText(/^every$/i))
    await user.type(screen.getByLabelText(/^every$/i), '1')
    await user.selectOptions(screen.getByLabelText(/period|unit/i), 'year')
    await user.type(screen.getByLabelText(/last done/i), '2024-05-01')
    await user.click(screen.getByRole('button', { name: /save|add/i }))
    await screen.findByText(/overdue/i)

    first.unmount()
    render(<App />)

    expect(await screen.findByText(/overdue/i)).toBeTruthy()
  })
})
