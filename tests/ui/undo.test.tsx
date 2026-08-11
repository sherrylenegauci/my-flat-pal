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
 * The requirement with teeth is the last sentence of FR-007: **undo must remain
 * available after the app is closed and reopened.** Undo was originally
 * session-scoped and that was removed from the data model, because ticking off
 * is a one-tap action with no confirmation — so a session-scoped undo made a
 * single mis-tap permanent the moment the phone was backgrounded, which a phone
 * does constantly. A test that only undoes within one mount would pass against
 * exactly the design that was rejected, so the reopening case is tested
 * explicitly here.
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

  it('still works after the app has been closed and reopened', async () => {
    // FR-007's second sentence, and the reason session-scoping was cut.
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
    seed([
      anItem({
        name: 'Boiler service',
        interval: YEARLY,
        completions: [
          aCompletion('2026-06-01', { id: 'older-entry' }),
          aCompletion('2020-01-01', { id: 'just-typed', recordedAt: '2026-08-07T10:00:00.000Z' }),
        ],
      }),
    ])
    const { user } = launch()

    await user.click(await screen.findByRole('button', { name: /undo/i }))

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
