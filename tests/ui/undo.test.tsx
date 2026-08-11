import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'
import { load } from '../../src/storage/repository'
import { MONTHLY, YEARLY, aCompletion, anItem, seed } from './seed'

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
 * What survives from the old premise, and is still tested here: undo is
 * **derived from the stored document rather than held in session state**, so
 * backgrounding the phone a second after a mis-tap does not make the mis-tap
 * permanent. What no longer survives — availability without limit — moved to
 * `undo-expiry.test.tsx`, which owns the window itself.
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

  it('still works after the app has been closed and reopened inside the window', async () => {
    // Was "still works after the app has been closed and reopened", full stop —
    // FR-007's replaced second sentence. The part of it that is still true, and
    // still worth a test, is *why* session-scoped undo was cut: a phone
    // backgrounds constantly, so a mis-tap must survive the app going away and
    // coming back. What changed is that it survives for the length of the
    // window rather than for ever. Expiry across a reopen is
    // `undo-expiry.test.tsx`'s job; this is the other side of the same rule,
    // and it presses the control rather than merely finding it.
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

    const undo = await screen.findByRole('button', { name: /undo/i })
    await user.click(undo)

    expect(await rowText()).toContain('1 June 2027')
    expect(stored()?.completions.map((c) => c.id)).toEqual(['cmp_2026-06-01'])
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
