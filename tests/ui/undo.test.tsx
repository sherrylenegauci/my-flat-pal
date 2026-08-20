import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'
import { load } from '../../src/storage/repository'
import { MONTHLY, YEARLY, aCompletion, anItem, seed } from './seed'
import { historyDates } from './history'

/**
 * T054 — US2 scenario 3, FR-007: undo a tick-off entered by mistake.
 *
 * **This file's premise changed on 2026-08-11.** It used to rest on FR-007's
 * second sentence, which promised that undo remained available after the app was
 * closed and reopened, with no limit. The clarification session replaced that
 * sentence: undo is now a short window measured from when the completion was
 * recorded, because unbounded availability turned into a data-loss defect — a
 * freshly opened app offered to delete history it had never written, one
 * completion per press. Older corrections happen in the job's history instead.
 *
 * **Amended again on 2026-08-11, later the same day (T102).** This header used
 * to say that undo is "derived from the stored document rather than held in
 * session state", so backgrounding the phone a second after a mis-tap does not
 * make the mis-tap permanent. FR-007 now says the opposite: the offer is limited
 * to a completion recorded **in the current session** and "MUST NOT be offered
 * on a freshly opened app, whatever the clock says". Deriving it from storage
 * alone could not express FR-007a or FR-007b across a relaunch, and the offers
 * that came back after one deleted completions the user had never recorded.
 * Losing the offer when the app goes away is the accepted cost; the job's
 * detail view is where an older mistake is corrected now.
 *
 * The window itself is `undo-expiry.test.tsx`'s subject. Reopening is covered in
 * both files, from the two sides it has: that the offer goes, and that the
 * record does not.
 *
 * StrictMode and stored-document assertions throughout, for the reason given in
 * `complete.test.tsx`.
 */
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0))
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

const stored = () => load().document.items[0]
const rowText = async () => (await screen.findByRole('listitem')).textContent ?? ''

describe('undoing a tick-off', () => {
  it('offers a way back after a job is marked done', async () => {
    seed([anItem({ name: 'Boiler service', interval: YEARLY, completions: [aCompletion('2026-06-01')] })])
    const { user } = launch()
    await screen.findByText('Boiler service')

    await user.click(screen.getByRole('button', { name: /mark done/i }))

    expect(screen.getByRole('button', { name: /undo/i })).toBeTruthy()
  })

  it('restores the exact previous due date', async () => {
    seed([anItem({ name: 'Boiler service', interval: YEARLY, completions: [aCompletion('2026-06-01')] })])
    const { user } = launch()
    expect(await rowText()).toContain('1 June 2027')

    await user.click(screen.getByRole('button', { name: /mark done/i }))
    expect(await rowText()).toContain('8 August 2027')

    await user.click(screen.getByRole('button', { name: /undo/i }))

    expect(await rowText()).toContain('1 June 2027')
    expect(stored()?.completions.map((c) => c.id)).toEqual(['cmp_2026-06-01'])
  })

  it('withdraws the offer once the app is closed and reopened, but keeps the tick-off', async () => {
    // **This test previously asserted the opposite.** As "still works after the
    // app has been closed and reopened inside the window" it pressed Undo on the
    // reopened app and expected the tick-off to be taken back, on the grounds
    // that a phone backgrounds constantly and a mis-tap must survive that.
    // FR-007 was amended on 2026-08-11 to scope the offer to the session that
    // recorded the completion: it "MUST NOT be offered on a freshly opened app,
    // whatever the clock says", and "MUST NOT be offered for any completion this
    // session did not record". Reopening is a new session, so an unspent window
    // no longer keeps the offer alive, and this test now asserts the withdrawal.
    //
    // What it asserts *instead of* pressing the button is the part that must not
    // change: session scope withdraws the way back, it does not un-record
    // anything. The completion is still in storage, the schedule still reflects
    // it, and it is still listed in the job's history. That last one is not
    // decoration — "an older mistake has a home in the history view" is the
    // recorded reason session-scoping is acceptable now, having been rejected in
    // the original design, so it is checked rather than taken on trust.
    seed([anItem({ name: 'Boiler service', interval: YEARLY, completions: [aCompletion('2026-06-01')] })])
    const { user, app } = launch()
    await screen.findByText('Boiler service')
    await user.click(screen.getByRole('button', { name: /mark done/i }))
    expect(stored()?.completions).toHaveLength(2)

    app.unmount()
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
    await screen.findByText('Boiler service')

    expect(screen.queryByRole('button', { name: /undo/i })).toBeNull()

    // Nothing was lost with the offer. Both the stored record and the due date
    // on screen still say the boiler was done today.
    expect(stored()?.completions.map((c) => c.completedOn)).toEqual(['2026-06-01', '2026-08-08'])
    expect(await rowText()).toContain('8 August 2027')

    // And the entry is reachable where corrections happen now that undo cannot
    // reach it: the job's own history, newest first.
    await user.click(screen.getByRole('button', { name: 'Boiler service' }))
    await screen.findByRole('list', { name: /history/i })
    expect(historyDates()).toEqual(['8 August 2026', '1 June 2026'])
  })

  it('returns a job to never done when its only tick-off is undone', async () => {
    seed([anItem({ name: 'Boiler service', interval: YEARLY })])
    const { user } = launch()
    await screen.findByText('Boiler service')
    await user.click(screen.getByRole('button', { name: /mark done/i }))

    await user.click(screen.getByRole('button', { name: /undo/i }))

    expect(within(await screen.findByRole('listitem')).getByText(/never done/i)).toBeTruthy()
    expect(stored()?.completions).toHaveLength(0)
    // Nothing left to undo, so nothing may claim otherwise.
    expect(screen.queryByRole('button', { name: /undo/i })).toBeNull()
  })

  it('undoes the entry made most recently, not the one with the latest date', async () => {
    // These differ exactly when someone backdates an entry, which is the case
    // where getting it wrong hurts: you mistype a date, press undo, and the
    // wrong tick-off disappears.
    //
    // **Rewritten for FR-007's window.** This used to seed a backdated entry
    // with `recordedAt` of the previous day and press undo on a freshly opened
    // app — which is now expired by definition, so there would be no control to
    // press, and the test would fail for a reason unrelated to the rule it is
    // about. The rule is unchanged and is also covered at the domain tier in
    // `tests/domain/undo.test.ts`; what changed is that the only way to reach it
    // through the UI is to make the backdated entry *now*, in the detail view.
    // Which is exactly the scenario the comment above describes anyway.
    seed([
      anItem({
        name: 'Boiler service',
        interval: YEARLY,
        completions: [aCompletion('2026-06-01', { id: 'older-entry' })],
      }),
    ])
    const { user } = launch()

    await user.click(await screen.findByRole('button', { name: 'Boiler service' }))
    const field = await screen.findByLabelText(/date it was done/i)
    await user.clear(field)
    await user.type(field, '2020-01-01')
    await user.click(screen.getByRole('button', { name: /record it/i }))
    expect(stored()?.completions).toHaveLength(2)

    await user.click(await screen.findByRole('button', { name: /undo/i }))

    // The mistyped entry goes; the one already on the record stays.
    expect(stored()?.completions.map((c) => c.id)).toEqual(['older-entry'])
  })

  it('names the job it would undo, so a mis-tap is recoverable knowingly', async () => {
    seed([
      anItem({ id: 'itm_a', name: 'Boiler service', interval: YEARLY }),
      anItem({ id: 'itm_b', name: 'Smoke alarms', interval: MONTHLY }),
    ])
    const { user } = launch()
    await screen.findByText('Smoke alarms')

    await user.click(screen.getByRole('button', { name: /mark done.*smoke alarms/i }))

    // Undo is one step across the whole schedule, so which job it refers to has
    // to be identifiable rather than guessed at — including by someone who
    // reaches the control through its accessible name rather than by reading
    // the sentence next to it.
    expect(screen.getByRole('button', { name: /undo.*smoke alarms/i })).toBeTruthy()
  })
})
