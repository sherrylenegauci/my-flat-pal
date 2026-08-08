import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { useCurrentDate } from '../../src/ui/useCurrentDate'

/**
 * T034 — FR-005: status re-evaluates when the date changes, with no user action.
 *
 * This is the requirement that had no implementing task. The domain test for
 * rollover proves `classifyStatus` returns the right answer when handed
 * tomorrow's date — it proves nothing about anything *handing* it tomorrow's
 * date. `plan.md` said status is "recomputed on every render", but a phone in
 * a pocket does not render.
 *
 * So these tests are about the trigger, not the calculation: does the app
 * actually notice the day changed?
 */
function Probe() {
  const today = useCurrentDate()
  return <output>{today}</output>
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
afterEach(() => vi.useRealTimers())

describe('useCurrentDate', () => {
  it('reports today as a calendar date', () => {
    vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0))
    render(<Probe />)
    expect(screen.getByRole('status').textContent).toBe('2026-08-08')
  })

  it('uses the local calendar day, not the UTC one', () => {
    // 23:30 local on the 8th. A naive `toISOString().slice(0,10)` reports the
    // 9th for anyone east of UTC and the 7th for anyone west — the app would
    // show the wrong day for half the world every evening.
    vi.setSystemTime(new Date(2026, 7, 8, 23, 30, 0))
    render(<Probe />)
    expect(screen.getByRole('status').textContent).toBe('2026-08-08')
  })

  it('rolls over at local midnight with no user interaction', async () => {
    vi.setSystemTime(new Date(2026, 7, 8, 23, 59, 50))
    render(<Probe />)
    expect(screen.getByRole('status').textContent).toBe('2026-08-08')

    // Nothing is clicked, nothing is reloaded. The day simply changes while the
    // app sits open — the exact case in the spec's Edge Cases.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })

    expect(screen.getByRole('status').textContent).toBe('2026-08-09')
  })

  it('re-checks when the app comes back to the foreground', async () => {
    vi.setSystemTime(new Date(2026, 7, 8, 12, 0, 0))
    render(<Probe />)

    // Backgrounded for a day. Timers are unreliable in a backgrounded tab, so
    // the visibility change is the belt to the timer's braces.
    vi.setSystemTime(new Date(2026, 7, 9, 12, 0, 0))
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(screen.getByRole('status').textContent).toBe('2026-08-09')
  })

  it('does not re-render when the day has not changed', async () => {
    vi.setSystemTime(new Date(2026, 7, 8, 12, 0, 0))
    let renders = 0
    function Counting() {
      renders++
      useCurrentDate()
      return null
    }
    render(<Counting />)
    const before = renders

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(renders).toBe(before)
  })

  it('cleans up its listeners and timer on unmount', async () => {
    vi.setSystemTime(new Date(2026, 7, 8, 12, 0, 0))
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const { unmount } = render(<Probe />)

    unmount()

    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  })
})

/**
 * SC-003 through the app, not through a probe.
 *
 * The tests above exercise `useCurrentDate` via a bespoke `Probe` component, and
 * `tests/domain/status.test.ts` exercises the classifier. Nothing composed them:
 * a regression that disconnected the hook from the schedule would have passed
 * the entire suite. SC-003's actual wording is "with no user action required to
 * refresh them", and that is what this asserts.
 */
describe('SC-003 — the schedule re-classifies itself at midnight', () => {
  it('turns a due job into an overdue one with no user interaction', async () => {
    const { App } = await import('../../src/ui/App')
    const { save } = await import('../../src/storage/repository')
    const { emptyDocument } = await import('../../src/storage/schema')

    vi.setSystemTime(new Date(2026, 7, 8, 23, 59, 50))
    save({
      ...emptyDocument(),
      items: [
        {
          id: 'itm_1',
          name: 'Smoke alarms',
          interval: { count: 1, unit: 'year' },
          createdAt: '2025-08-08',
          completions: [
            { id: 'c1', completedOn: '2025-08-08', recordedAt: '2025-08-08T09:00:00.000Z' },
          ],
        },
      ],
    })

    render(<App />)
    expect(await screen.findByText(/due today/i)).toBeTruthy()

    // Nothing is clicked. Nothing is reloaded. The day simply turns.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })

    expect(await screen.findByText(/overdue/i)).toBeTruthy()
    expect(screen.queryByText(/due today/i)).toBeNull()
  })
})
