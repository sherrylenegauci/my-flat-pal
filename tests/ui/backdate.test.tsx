import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'
import { load } from '../../src/storage/repository'
import { YEARLY, aCompletion, anItem, seed } from './seed'

/**
 * T055 — recording a job you did but never wrote down.
 *
 * Backdating is normal: you remember in August that the boiler was done in
 * June. Three rules, and the third is the one that was previously broken.
 *
 *   1. A past date is accepted and the schedule counts from it.
 *   2. A future date is refused — you cannot have already done something you
 *      have not done yet.
 *   3. A date **older than the newest completion** still joins the history, but
 *      changes nothing about when the job is next due. That was a silent no-op:
 *      the user tapped, believed something had happened, and nothing had, which
 *      contradicts FR-006. The app now has to say so.
 *
 * A caveat this file cannot close: date entry here goes through jsdom's
 * simulation of `<input type="date">`, not through the wheel picker iOS
 * actually shows. The control's real behaviour on the target platform is a
 * real-browser question — `e2e/` covers the detail view's rendering, and the
 * picker itself remains a manual check.
 */
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0)) // 8 August 2026
})
afterEach(() => vi.useRealTimers())

function launch() {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const app = render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  return { user, app }
}

const storedCompletions = () => load().document.items[0]?.completions ?? []

async function openDetail(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole('button', { name }))
  await screen.findByRole('heading', { name, level: 2 })
}

async function record(user: ReturnType<typeof userEvent.setup>, date: string) {
  const field = screen.getByLabelText(/date it was done/i)
  await user.clear(field)
  await user.type(field, date)
  await user.click(screen.getByRole('button', { name: /record it/i }))
}

const historyEntries = () =>
  within(screen.getByRole('list', { name: /history/i }))
    .getAllByRole('listitem')
    .map((li) => li.textContent ?? '')

describe('recording a completion on a past date', () => {
  it('accepts it and counts the schedule from that date', async () => {
    seed([anItem({ name: 'Boiler service', interval: YEARLY })])
    const { user } = launch()
    await openDetail(user, 'Boiler service')

    await record(user, '2025-08-08')

    expect(storedCompletions()).toHaveLength(1)
    expect(storedCompletions()[0]?.completedOn).toBe('2025-08-08')
    expect(historyEntries().join(' ')).toContain('8 August 2025')
  })

  it('refuses a date in the future, and saves nothing', async () => {
    seed([anItem({ name: 'Boiler service', interval: YEARLY })])
    const { user } = launch()
    await openDetail(user, 'Boiler service')

    await record(user, '2027-01-01')

    expect(await screen.findByText(/in the future/i)).toBeTruthy()
    expect(storedCompletions()).toHaveLength(0)
  })

  it('adds an older completion to the history without disturbing the schedule', async () => {
    seed([
      anItem({ name: 'Boiler service', interval: YEARLY, completions: [aCompletion('2026-06-01')] }),
    ])
    const { user } = launch()
    await openDetail(user, 'Boiler service')

    await record(user, '2020-01-01')

    expect(storedCompletions()).toHaveLength(2)
    expect(historyEntries().join(' ')).toContain('1 January 2020')
    expect(historyEntries().join(' ')).toContain('1 June 2026')
  })

  it('tells the user plainly that nothing about the schedule changed', async () => {
    // FR-006: a tap that records something must not look like a tap that did
    // nothing. Without this the app is silently correct and visibly broken.
    seed([
      anItem({ name: 'Boiler service', interval: YEARLY, completions: [aCompletion('2026-06-01')] }),
    ])
    const { user } = launch()
    await openDetail(user, 'Boiler service')

    await record(user, '2020-01-01')

    const message = await screen.findByText(/next due date is unchanged/i)
    // And it says what the date still is, so "unchanged" is checkable by the
    // person reading it rather than something they have to take on trust.
    expect(message.textContent).toContain('1 June 2027')
  })

  it('moves the schedule when the backdated entry is the newest one', async () => {
    // The contrast case for the test above: same flow, date newer than anything
    // recorded, so the schedule genuinely does move.
    seed([
      anItem({ name: 'Boiler service', interval: YEARLY, completions: [aCompletion('2020-01-01')] }),
    ])
    const { user } = launch()
    await openDetail(user, 'Boiler service')

    await record(user, '2026-07-01')

    expect(screen.queryByText(/next due date is unchanged/i)).toBeNull()
    // Exact text, because the undo notice also names the new due date and an
    // open-ended regex would match both and fail for the wrong reason.
    expect(await screen.findByText('Next due 1 July 2027')).toBeTruthy()
  })
})
