import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'
import { YEARLY, aCompletion, anItem, seed } from './seed'
import { historyDates } from './history'

/**
 * T056 — opening a job: US2 scenario 2 (when was it last done) and scenario 4
 * with FR-008 (the full history, most recent first).
 *
 * The back control is tested here rather than assumed. An installed PWA on iOS
 * has no system back button and its edge-swipe is unreliable in a standalone
 * window (verified, T011), so a detail view with no in-app way out strands the
 * user with nothing but force-quitting the app. Whether that control is
 * *visible enough* is a real-browser question; that it exists, is reachable and
 * returns you to the list is checkable here.
 */
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0))
})
afterEach(() => vi.useRealTimers())

const launch = () => ({
  user: userEvent.setup({ advanceTimers: vi.advanceTimersByTime }),
  ...render(<App />),
})


describe('opening a job from the list', () => {
  it('shows that job, by name', async () => {
    seed([anItem({ name: 'Boiler service', interval: YEARLY, completions: [aCompletion('2026-06-01')] })])
    const { user } = launch()

    await user.click(await screen.findByRole('button', { name: 'Boiler service' }))

    expect(await screen.findByRole('heading', { name: 'Boiler service', level: 2 })).toBeTruthy()
  })

  it('shows when it was last done', async () => {
    // US2 scenario 2 — "I can see when it was last done".
    seed([anItem({ name: 'Boiler service', interval: YEARLY, completions: [aCompletion('2026-06-01')] })])
    const { user } = launch()

    await user.click(await screen.findByRole('button', { name: 'Boiler service' }))

    // The fact, not the phrasing. It used to be a sentence of its own ("Last
    // done 1 June 2026") and is now the second half of the line that opens the
    // view: "Every year · last done 1 June 2026". A substring match keeps this
    // test about US2 scenario 2 — that the date is on the screen at all — and
    // leaves the exact sentence, the dot and the dropped count to
    // `detail-interval.test.tsx`, which is the file about the wording.
    expect(await screen.findByText(/last done 1 June 2026/i)).toBeTruthy()
    expect(screen.getByText('Next due 1 June 2027')).toBeTruthy()
  })

  it('lists the whole history, newest first', async () => {
    // FR-008. Seeded deliberately out of order: a view that simply printed the
    // stored array would pass a sorted fixture and fail a real one.
    seed([
      anItem({
        name: 'Boiler service',
        interval: YEARLY,
        completions: [
          aCompletion('2024-05-06'),
          aCompletion('2025-05-11'),
          aCompletion('2023-05-02'),
        ],
      }),
    ])
    const { user } = launch()

    await user.click(await screen.findByRole('button', { name: 'Boiler service' }))
    await screen.findByRole('heading', { name: 'Boiler service', level: 2 })

    expect(historyDates()).toEqual(['11 May 2025', '6 May 2024', '2 May 2023'])
  })

  it('says so when a job has never been done, rather than showing an empty list', async () => {
    seed([anItem({ name: 'Boiler service', interval: YEARLY })])
    const { user } = launch()

    await user.click(await screen.findByRole('button', { name: 'Boiler service' }))
    await screen.findByRole('heading', { name: 'Boiler service', level: 2 })

    expect(screen.getByText('Never done')).toBeTruthy()
    expect(screen.queryByRole('list', { name: /history/i })).toBeNull()
    expect(screen.getByText(/no completions recorded yet/i)).toBeTruthy()
    // And no due date invented from a service that never happened (FR-004a).
    expect(screen.queryByText(/^Next due/)).toBeNull()
  })

  it('has a visible way back to the schedule', async () => {
    seed([anItem({ name: 'Boiler service', interval: YEARLY, completions: [aCompletion('2026-06-01')] })])
    const { user } = launch()

    await user.click(await screen.findByRole('button', { name: 'Boiler service' }))
    await screen.findByRole('heading', { name: 'Boiler service', level: 2 })

    await user.click(screen.getByRole('button', { name: /back/i }))

    expect(await screen.findByRole('listitem')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Boiler service', level: 2 })).toBeNull()
  })
})
