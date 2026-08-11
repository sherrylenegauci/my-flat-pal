import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'
import { load } from '../../src/storage/repository'
import { UNDO_WINDOW_MS } from '../../src/domain/undoWindow'
import { MONTHLY, YEARLY, aCompletion, anItem, seed } from './seed'

/**
 * T102 — the undo offer belongs to the session that recorded the completion
 * (FR-007, FR-007a, FR-007b).
 *
 * **The defect this file exists for.** The offer is derived from the stored
 * document: the newest completion by `recordedAt` anywhere in the schedule, if it
 * is inside the ten-second window. Two rules cannot be derived from that document
 * at all, so they were carried by a single completion id held in a React ref —
 * the *one entry the app refuses to offer*. A relaunch resets the refusal and
 * does not reset the offer, so the refusal is lost while the offer returns. Both
 * sequences below were reproduced by probe:
 *
 *   1. **FR-007b.** Add a job with a last-done date. No offer, correctly. Reopen
 *      within ten seconds and "Undo recording Gutters as done" is there; pressing
 *      it leaves Gutters holding no completions and the row reading "Never done".
 *      The user added a job rather than completing one, and the date they typed
 *      into the form is what undo would delete.
 *   2. **FR-007a.** Tick off Boiler, tick off Alarms two seconds later, press Undo
 *      once. Correctly no second offer. Reopen within the window and the offer
 *      returns naming Boiler, and a press takes Boiler's tick-off too — two
 *      presses walking backwards through history, separated only by a relaunch.
 *
 * FR-007 as amended on 2026-08-11 settles it by inverting the marker: the offer
 * is limited to a completion recorded **in the current session**, "MUST NOT be
 * offered on a freshly opened app, whatever the clock says", and "MUST NOT be
 * offered for any completion this session did not record". These tests describe
 * that behaviour and say nothing about how it is remembered — no assertion here
 * touches a ref, a state value or a stored field, so any correct implementation
 * of the amended requirement passes.
 *
 * **Guarding against vacuity.** Both sequences end in an absence assertion, and
 * an app that had lost undo altogether would satisfy both. The first test in the
 * file is a live positive control: within one session the offer appears and
 * pressing it removes exactly the completion it named. Each absence assertion is
 * also paired with an assertion about the stored document, so an implementation
 * that withheld the offer by throwing the completion away fails rather than
 * passes.
 *
 * Everything renders inside `<StrictMode>` and asserts storage as well as the
 * screen, for the reason recorded in `complete.test.tsx`: a bug that duplicated
 * every job the user added shipped past 136 passing tests because no test did
 * either.
 *
 * What this file cannot establish. A relaunch here is an unmount and a fresh
 * render into the same jsdom document — the module graph, and anything held at
 * module scope, survives it. That is a fair model of React state and refs going
 * away, which is what the two sequences turn on, but it is not a fair model of a
 * process restart. Whether the offer is genuinely absent after the installed app
 * is force-quit and relaunched on a phone is a real-device question, and it
 * belongs to the manual checklist in `plan.md` (T079) rather than here.
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

/** Let the mocked clock run forward and let React react to it. */
async function timePasses(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

/** Comfortably inside `UNDO_WINDOW_MS`, so the window is not what withholds the offer. */
const SOON_AFTER_MS = 2_000

/**
 * Reopen the app at a stated offset from when a completion was recorded.
 *
 * The clock in this file runs with `shouldAdvanceTime`, so real elapsed time
 * leaks into the mocked one: "reopened two seconds later" would really mean two
 * seconds plus however long this machine took to fill in a form. Measuring the
 * offset from the completion's own `recordedAt` instead makes "inside the window"
 * a fact rather than a hope, on a loaded CI box as much as on a fast laptop — the
 * point of both tests is that the offer is withheld *despite* the window being
 * unspent, so a test that could drift outside the window would be worthless.
 *
 * The jump happens after the unmount, deliberately. `vi.setSystemTime` shifts
 * armed timers along with the clock rather than firing them — see the doc comment
 * on `clockJumpsForwardWithoutTimersFiring` in `undo-expiry.test.tsx` — and
 * unmounting has already cleared the expiry timeout, so there is nothing left for
 * it to disturb.
 */
function reopenAt(recordedAt: string, offsetMs: number) {
  expect(offsetMs).toBeLessThan(UNDO_WINDOW_MS)
  vi.setSystemTime(new Date(Date.parse(recordedAt) + offsetMs))
  return render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

const undoControl = () => screen.queryByRole('button', { name: /undo/i })

/**
 * The undo control, but only if it offers to take back *that* job's tick-off.
 * Which job the offer names is the difference between a way back from what the
 * user just did and an offer to delete their earlier history, and the accessible
 * name is where a user meets that difference.
 */
const undoControlFor = (jobName: string) =>
  screen.queryByRole('button', { name: new RegExp(`undo recording ${jobName} as done`, 'i') })

const markDone = (jobName: string) =>
  screen.getByRole('button', { name: new RegExp(`mark done.*${jobName}`, 'i') })

/** Every tick-off in storage, as job name → the dates recorded against it. */
const storedHistoryByJob = () =>
  Object.fromEntries(
    load().document.items.map((item) => [item.name, item.completions.map((c) => c.completedOn)]),
  )

/** When a particular tick-off was recorded, read back from storage. */
function recordedAtOf(jobName: string, completedOn: string): string {
  const item = load().document.items.find((candidate) => candidate.name === jobName)
  const completion = item?.completions.find((c) => c.completedOn === completedOn)
  expect(completion, `no ${jobName} completion stored for ${completedOn}`).toBeDefined()
  return completion!.recordedAt
}

/**
 * Adding a job through the real form.
 *
 * Seeded documents are fine for the tick-off sequence below, but not for
 * FR-007b: the rule is about what the *add flow* does, and a seeded document
 * never runs it. Storage cannot tell an added job's last-done date from a job
 * that was added and then ticked off, which is exactly why the rule cannot be
 * derived from storage.
 */
async function addAJob(
  user: ReturnType<typeof userEvent.setup>,
  fields: { name: string; count: string; unit: string; lastDone?: string },
) {
  await user.click(await screen.findByRole('button', { name: /add/i }))

  await user.clear(screen.getByLabelText(/name/i))
  await user.type(screen.getByLabelText(/name/i), fields.name)
  await user.clear(screen.getByLabelText(/how often/i))
  await user.type(screen.getByLabelText(/how often/i), fields.count)
  await user.selectOptions(screen.getByLabelText(/period|unit/i), fields.unit)
  if (fields.lastDone !== undefined) {
    await user.type(screen.getByLabelText(/last done/i), fields.lastDone)
  }

  await user.click(screen.getByRole('button', { name: /save|add/i }))
  await screen.findByText(fields.name)
}

describe('undo is offered only for what this session recorded', () => {
  it('offers undo for a tick-off made in this session, and takes back exactly that one', async () => {
    // The live positive control for this file. Both tests below assert that no
    // offer appears, and an app that never offered undo at all would satisfy
    // them; this fails against such an app. It also fails against an app that
    // offers undo but takes back the wrong entry.
    seed([anItem({ name: 'Boiler service', interval: YEARLY, completions: [aCompletion('2026-06-01')] })])
    const { user } = launch()
    await screen.findByText('Boiler service')

    await user.click(markDone('Boiler service'))
    expect(undoControlFor('Boiler service')).not.toBeNull()

    await user.click(undoControl()!)

    expect(storedHistoryByJob()).toEqual({ 'Boiler service': ['2026-06-01'] })
    expect(undoControl()).toBeNull()
  })

  it('does not offer to undo a job added with a last-done date, even after a relaunch', async () => {
    // Sequence 1: FR-007b across a relaunch. Driven through the real Add job
    // form, because the rule is about the add flow and a seeded document never
    // runs it.
    const { user, app } = launch()

    await addAJob(user, { name: 'Gutters', count: '1', unit: 'year', lastDone: '2026-06-14' })

    // Right so far — the refusal holds while the session that made it is alive.
    // Asserted so that the relaunch below is testing the thing that changes,
    // rather than a state that was already wrong.
    expect(undoControl()).toBeNull()
    expect(storedHistoryByJob()).toEqual({ Gutters: ['2026-06-14'] })

    app.unmount()
    reopenAt(recordedAtOf('Gutters', '2026-06-14'), SOON_AFTER_MS)
    await screen.findByText('Gutters')

    // The offer must not come back. It named Gutters, and it was reachable by
    // Tab then Enter.
    expect(undoControl()).toBeNull()
    expect(undoControlFor('Gutters')).toBeNull()

    // And the damage the offer would do, asserted directly rather than only
    // through the absence of the button: the date the user typed into the form is
    // still recorded, and the job they created a minute ago does not read as
    // never done.
    expect(storedHistoryByJob()).toEqual({ Gutters: ['2026-06-14'] })
    const row = await screen.findByRole('listitem')
    expect(row.textContent).not.toMatch(/never done/i)
    expect(row.textContent).toContain('14 June 2027')
  })

  it('does not offer to undo another job’s tick-off after an undo and a relaunch', async () => {
    // Sequence 2: FR-007a across a relaunch. Two jobs ticked off inside the same
    // ten seconds is the shape the window cannot help with — undo the second and
    // the first is suddenly the newest entry in the schedule, recorded two
    // seconds ago and comfortably inside the window. Within one session the app
    // already refuses that second offer; the refusal is what a relaunch loses.
    seed([
      anItem({
        id: 'itm_a',
        name: 'Boiler service',
        interval: YEARLY,
        completions: [aCompletion('2026-06-01')],
      }),
      anItem({
        id: 'itm_b',
        name: 'Smoke alarms',
        interval: MONTHLY,
        completions: [aCompletion('2026-07-08')],
      }),
    ])
    const { user, app } = launch()
    await screen.findByText('Boiler service')

    await user.click(markDone('Boiler service'))
    // A gap, so which tick-off is newest is decided by the mocked clock rather
    // than by how fast the machine running this happens to be. Both stay well
    // inside the ten-second window.
    await timePasses(SOON_AFTER_MS)
    await user.click(markDone('Smoke alarms'))

    expect(undoControlFor('Smoke alarms')).not.toBeNull()
    await user.click(undoControl()!)

    // One press, one removal, and no second offer — correct while this session
    // is alive.
    const historyAfterTheUndo = {
      'Boiler service': ['2026-06-01', '2026-08-08'],
      'Smoke alarms': ['2026-07-08'],
    }
    expect(storedHistoryByJob()).toEqual(historyAfterTheUndo)
    expect(undoControl()).toBeNull()

    app.unmount()
    reopenAt(recordedAtOf('Boiler service', '2026-08-08'), SOON_AFTER_MS)
    await screen.findByText('Boiler service')

    // No offer at all, and in particular not one naming Boiler service — whose
    // tick-off is now the newest in the schedule and still inside the window.
    // Taking it would be a second press deleting a second completion, which is
    // the walk-backwards FR-007a forbids.
    expect(undoControl()).toBeNull()
    expect(undoControlFor('Boiler service')).toBeNull()

    // The whole stored history for both jobs, unchanged by the relaunch. Asserted
    // against storage because the rows show due dates rather than histories: the
    // screen looks the same whether Boiler service kept its tick-off or lost it,
    // and the user would only find out on the next reload.
    expect(storedHistoryByJob()).toEqual(historyAfterTheUndo)
  })
})
