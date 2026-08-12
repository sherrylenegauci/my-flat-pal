import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'
import { load } from '../../src/storage/repository'
import { MONTHLY, YEARLY, aCompletion, anItem, seed } from './seed'

/**
 * T064 — deleting a job. US3 scenario 2 and FR-009's second half, plus US3's
 * Independent Test ("delete something and watch it disappear"), which nothing
 * in the suite asserted before this file.
 *
 * **Why the confirmation gets this much attention.** Deleting a job deletes its
 * history with it, and the spec cut export and backup deliberately ("No backup,
 * no export"), so there is no way back from a mis-tap — not from a file, not
 * from another device. The confirmation is the only safeguard that exists, so
 * what it *says* is part of the behaviour, not decoration.
 *
 * **What this file cannot check.** Whether a VoiceOver user is actually told a
 * dialog has opened. A `role="dialog"` attribute in jsdom is a string in the
 * DOM; whether the screen reader interrupts, announces the question, and traps
 * the rotor is a property of the platform, and the constitution (v1.4.0) makes
 * VoiceOver on a real iPhone the check that discharges the accessibility gate.
 * Nothing here should be read as covering it. Contrast, focus visibility and
 * touch-target size are likewise absent: jsdom resolves no cascaded colour and
 * reports a zero-sized box for every element.
 */
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0))
})
afterEach(() => vi.useRealTimers())

const QUESTION = 'Delete “Boiler service”?'
const HISTORY_GOES_TOO =
  'Its history goes too: 3 completions recorded. ' +
  'This app has no backup and no export, so nothing here can be got back.'
const NOTHING_RECORDED =
  'Nothing has been recorded against it yet. ' +
  'This app has no backup and no export, so the job cannot be got back.'

const withThreeCompletions = () =>
  anItem({
    id: 'itm_boiler',
    name: 'Boiler service',
    interval: YEARLY,
    completions: [aCompletion('2024-05-06'), aCompletion('2025-05-11'), aCompletion('2026-06-01')],
  })

const neverDone = () =>
  anItem({ id: 'itm_boiler', name: 'Boiler service', interval: YEARLY })

const launch = (strict = false) => ({
  user: userEvent.setup({ advanceTimers: vi.advanceTimersByTime }),
  ...render(strict ? <StrictMode><App /></StrictMode> : <App />),
})

async function askToDelete(user: ReturnType<typeof userEvent.setup>, job = 'Boiler service') {
  await user.click(await screen.findByRole('button', { name: job }))
  await user.click(await screen.findByRole('button', { name: 'Delete job' }))
  return screen.getByRole('dialog')
}

const storedNames = () => load().document.items.map((item) => item.name)

describe('deleting a job', () => {
  it('asks first, and has deleted nothing by the time it asks', async () => {
    seed([withThreeCompletions()])
    const { user } = launch()

    await askToDelete(user)

    expect(screen.getByRole('dialog', { name: QUESTION })).toBeTruthy()
    expect(storedNames()).toEqual(['Boiler service'])
  })

  it('says the history goes too, and how much of it there is', async () => {
    // The consequence is the dialog's accessible description, so it reaches a
    // screen-reader user as part of the dialog rather than as loose text they
    // have to go looking for.
    seed([withThreeCompletions()])
    const { user } = launch()

    await askToDelete(user)

    expect(screen.getByRole('dialog', { name: QUESTION, description: HISTORY_GOES_TOO })).toBeTruthy()
  })

  it('says plainly that nothing was recorded, when nothing was', async () => {
    // A job that has never been done has no history to lose, so promising to
    // discard one would be false. What is still true, and still worth saying, is
    // that the job itself cannot be got back.
    seed([neverDone()])
    const { user } = launch()

    await askToDelete(user)

    expect(screen.getByRole('dialog', { name: QUESTION, description: NOTHING_RECORDED })).toBeTruthy()
  })

  it('removes the job when the deletion is confirmed — from the screen and from storage', async () => {
    // US3's Independent Test: "delete something and watch it disappear."
    seed([withThreeCompletions()])
    const { user } = launch()

    const dialog = await askToDelete(user)
    await user.click(within(dialog).getByRole('button', { name: 'Delete permanently' }))

    expect(await screen.findByText('Nothing recorded yet')).toBeTruthy()
    expect(screen.queryByText('Boiler service')).toBeNull()
    // And in the place that matters: the screen being right while storage still
    // holds the job is exactly the shape of the duplicate-job bug, discovered
    // only on the next reload.
    expect(load().document.items).toHaveLength(0)
  })

  it('leaves the job exactly where it was when the deletion is cancelled', async () => {
    seed([withThreeCompletions()])
    const { user } = launch()

    const dialog = await askToDelete(user)
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await screen.findByRole('heading', { name: 'Boiler service', level: 2 })).toBeTruthy()
    expect(storedNames()).toEqual(['Boiler service'])
    expect(load().document.items[0]?.completions).toHaveLength(3)
  })

  it('deletes only the job that was opened', async () => {
    seed([
      withThreeCompletions(),
      anItem({ id: 'itm_alarms', name: 'Smoke alarms', interval: MONTHLY }),
    ])
    const { user } = launch()

    const dialog = await askToDelete(user)
    await user.click(within(dialog).getByRole('button', { name: 'Delete permanently' }))

    expect(await screen.findByText('Smoke alarms')).toBeTruthy()
    expect(storedNames()).toEqual(['Smoke alarms'])
  })

  it('leaves focus somewhere usable once the job is gone', async () => {
    // The control that opened the dialog went away with the view it lived in,
    // so there is nothing to return focus to — but focus falling to <body>
    // silently returns a keyboard or VoiceOver user to the top of the document
    // with no indication anything happened. Where focus *should* land is the
    // dialog's own business and is pinned in confirm-dialog.test.tsx, which
    // keeps its opener mounted; what this view can honestly assert is that it
    // did not fall off the end.
    seed([withThreeCompletions()])
    const { user } = launch()

    const dialog = await askToDelete(user)
    await user.click(within(dialog).getByRole('button', { name: 'Delete permanently' }))
    await screen.findByText('Nothing recorded yet')

    expect(document.activeElement).not.toBe(document.body)
  })
})

/**
 * The same deletion, rendered the way `main.tsx` renders the app.
 *
 * React double-invokes state updaters under StrictMode to prove they are pure.
 * The last time a mutation went untested there, the second invocation fell into
 * the stale-write recovery and re-applied a change that had already landed —
 * past 136 green tests, because none of them rendered the app as production
 * does and none of them looked at storage.
 */
describe('deleting a job under StrictMode', () => {
  it('leaves nothing in storage', async () => {
    seed([withThreeCompletions()])
    const { user } = launch(true)

    const dialog = await askToDelete(user)
    await user.click(within(dialog).getByRole('button', { name: 'Delete permanently' }))
    await screen.findByText('Nothing recorded yet')

    expect(load().document.items).toEqual([])
  })

  it('takes the one job with it and no others', async () => {
    seed([
      withThreeCompletions(),
      anItem({ id: 'itm_alarms', name: 'Smoke alarms', interval: MONTHLY }),
    ])
    const { user } = launch(true)

    const dialog = await askToDelete(user)
    await user.click(within(dialog).getByRole('button', { name: 'Delete permanently' }))
    await screen.findByText('Smoke alarms')

    expect(storedNames()).toEqual(['Smoke alarms'])
  })
})
