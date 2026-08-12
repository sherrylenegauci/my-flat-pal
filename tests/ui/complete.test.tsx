import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'
import { load } from '../../src/storage/repository'
import { MONTHLY, YEARLY, aCompletion, anItem, seed } from './seed'

/**
 * T053 — US2 scenario 1: tick a job off and it stops being due.
 *
 * Everything here renders inside `<StrictMode>` and asserts the **stored**
 * document as well as the screen. Both are deliberate. Marking done is a new
 * path through the same `mutate` that once duplicated every job the user added:
 * the screen showed one, storage held two, and 136 passing tests missed it
 * because none of them used StrictMode and none of them looked at storage.
 *
 * What this file cannot establish: that the control is big enough to hit with a
 * thumb. jsdom performs no layout, so every rectangle it reports is zero —
 * `e2e/layout.spec.ts` measures the 44x44 floor in a real engine.
 */
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0)) // Saturday 8 August 2026, local
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

/**
 * The row's own text.
 *
 * Scoped rather than searched for across the whole screen on purpose: the undo
 * notice in the shell also names dates, so an unscoped `getByText(/8 September
 * 2026/)` would match twice and fail for a reason that has nothing to do with
 * what is being tested.
 */
const rowText = async () => (await screen.findByRole('listitem')).textContent ?? ''

describe('marking a job done', () => {
  it('takes a due job out of the group needing attention', async () => {
    seed([
      anItem({ name: 'Smoke alarms', interval: MONTHLY, completions: [aCompletion('2026-07-08')] }),
    ])
    const { user } = launch()

    expect(await screen.findByText('1 needing attention')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /mark done/i }))

    expect(await screen.findByText('Nothing due right now')).toBeTruthy()
    expect(within(screen.getByRole('listitem')).getByText(/scheduled/i)).toBeTruthy()
  })

  it('schedules the next occurrence from the day it was actually done', async () => {
    seed([
      anItem({ name: 'Smoke alarms', interval: MONTHLY, completions: [aCompletion('2026-07-08')] }),
    ])
    const { user } = launch()
    await screen.findByText('Smoke alarms')

    await user.click(screen.getByRole('button', { name: /mark done/i }))

    // Done on 8 August, monthly, so next due 8 September — counted from the day
    // it was done rather than from the date it was meant to meet (FR-013).
    expect(await rowText()).toContain('8 September 2026')
  })

  it('counts from today even when the job was not due yet', async () => {
    // The spec's "you tick something off early" edge case: it must not still be
    // sitting there due on the old date.
    seed([anItem({ name: 'Gutters', interval: YEARLY, completions: [aCompletion('2025-12-01')] })])
    const { user } = launch()
    await screen.findByText('Gutters')

    await user.click(screen.getByRole('button', { name: /mark done/i }))

    expect(await rowText()).toContain('8 August 2027')
    expect(await rowText()).not.toContain('1 December 2026')
  })

  it('gives a job that has never been done a due date', async () => {
    seed([anItem({ name: 'Boiler service', interval: YEARLY })])
    const { user } = launch()
    await screen.findByText('Boiler service')

    await user.click(screen.getByRole('button', { name: /mark done/i }))

    expect(await rowText()).toContain('8 August 2027')
    expect(await rowText()).not.toMatch(/never done/i)
  })

  it('is reachable in one tap from the main view (SC-004 allows two)', async () => {
    seed([
      anItem({ name: 'Smoke alarms', interval: MONTHLY, completions: [aCompletion('2026-07-08')] }),
    ])
    const { user } = launch()

    // No navigation first: the control is on the view the app opens on, and one
    // click completes the job. That is the whole of the tap-budget claim jsdom
    // can honestly make.
    const markDone = await screen.findByRole('button', { name: /mark done/i })
    await user.click(markDone)

    expect(storedCompletions()).toHaveLength(2)
  })

  it('records exactly one completion, dated today', async () => {
    seed([anItem({ name: 'Boiler service', interval: YEARLY })])
    const { user } = launch()
    await screen.findByText('Boiler service')

    await user.click(screen.getByRole('button', { name: /mark done/i }))
    expect(await rowText()).toContain('8 August 2027')

    expect(storedCompletions()).toHaveLength(1)
    expect(storedCompletions()[0]?.completedOn).toBe('2026-08-08')
  })

  it('survives the app being closed and reopened', async () => {
    seed([
      anItem({ name: 'Smoke alarms', interval: MONTHLY, completions: [aCompletion('2026-07-08')] }),
    ])
    const { user, app } = launch()
    await screen.findByText('Smoke alarms')
    await user.click(screen.getByRole('button', { name: /mark done/i }))
    expect(await rowText()).toContain('8 September 2026')

    // Tearing down and remounting against the same storage is what "closed the
    // app and came back" means here. With no export path, a tick-off that does
    // not survive this is simply gone.
    app.unmount()
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    expect(await rowText()).toContain('8 September 2026')
    expect(within(screen.getByRole('listitem')).getByText(/scheduled/i)).toBeTruthy()
    expect(storedCompletions()).toHaveLength(2)
  })
})
