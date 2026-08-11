import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'
import { load } from '../../src/storage/repository'
import { UNDO_WINDOW_MS } from '../../src/domain/undoWindow'
import { YEARLY, aCompletion, anItem, seed } from './seed'

/**
 * T095 — the undo offer is a short window, and it is measured from the
 * completion, not from the app opening (FR-007, FR-007a).
 *
 * **The defect this file exists for.** The offer was derived from the newest
 * `recordedAt` anywhere in the schedule with nothing to expire it. On a freshly
 * opened app, against a document this build had never written, three presses of
 * Undo deleted completions dated 2020, 2022 and 2024, with no confirmation at
 * any point. The offer sits above `<main>`, so it is near the top of the tab
 * order: Tab then Enter was enough. There is no export and no backup, so that is
 * data loss.
 *
 * **The wrong fix these tests are shaped to catch.** Expiring the offer a few
 * seconds after the *component mounted* passes a naive test and leaves the bug
 * in place: reopening the app restarts the clock and the expired offer comes
 * back. Two tests below fail against that implementation and would not fail
 * against it if they were written the obvious way —
 * "offers nothing on an app opened on old completions", which asserts at the
 * instant of mount, and "does not resurrect an expired offer when the app is
 * reopened", which remounts after the window has passed.
 *
 * Everything that mutates state renders inside `<StrictMode>` and asserts the
 * **stored** document as well as the screen, for the reason recorded in
 * `complete.test.tsx`: a bug that duplicated every job the user added shipped
 * past 136 passing tests because none of them did either.
 *
 * What this file cannot establish: that the offer is legible, that it is still
 * on screen rather than scrolled away, or that its disappearance is noticeable
 * to someone using VoiceOver. jsdom has no layout, no paint and no screen
 * reader — those belong to the real-browser tier.
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

function reopen() {
  return render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

/** Let the mocked clock run forward and let React react to it. */
async function timePasses(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

/** Tab until the predicate matches, or give up. Returns the focused element. */
async function tabUntil(
  user: ReturnType<typeof userEvent.setup>,
  matches: (el: Element | null) => boolean,
  limit = 25,
): Promise<Element | null> {
  for (let i = 0; i < limit; i++) {
    if (matches(document.activeElement)) return document.activeElement
    await user.tab()
  }
  return matches(document.activeElement) ? document.activeElement : null
}

const undoControl = () => screen.queryByRole('button', { name: /undo/i })
const storedCompletionIds = () => (load().document.items[0]?.completions ?? []).map((c) => c.id)

/** Three tick-offs recorded years ago — history the app must not offer to delete. */
const withOldHistory = () =>
  anItem({
    name: 'Boiler service',
    interval: YEARLY,
    completions: [
      aCompletion('2020-03-15'),
      aCompletion('2022-04-20'),
      aCompletion('2024-05-06'),
    ],
  })

describe('the undo offer expires', () => {
  it('is there the moment a job is marked done', async () => {
    // The control case. Without it, every absence assertion below could pass
    // because the offer never appears at all.
    seed([anItem({ name: 'Boiler service', interval: YEARLY, completions: [aCompletion('2026-06-01')] })])
    const { user } = launch()
    await screen.findByText('Boiler service')

    await user.click(screen.getByRole('button', { name: /mark done/i }))

    expect(undoControl()).not.toBeNull()
  })

  it('withdraws itself once the window passes and the user has done nothing', async () => {
    seed([anItem({ name: 'Boiler service', interval: YEARLY, completions: [aCompletion('2026-06-01')] })])
    const { user } = launch()
    await screen.findByText('Boiler service')
    await user.click(screen.getByRole('button', { name: /mark done/i }))
    expect(undoControl()).not.toBeNull()

    await timePasses(UNDO_WINDOW_MS + 1_000)

    expect(undoControl()).toBeNull()
    // Expiring is not undoing: the tick-off the user made stays recorded.
    expect(storedCompletionIds()).toHaveLength(2)
  })

  it('offers nothing on an app opened on old completions', async () => {
    // The probe that found the defect, turned into a test. Asserted at the
    // instant of mount, which is what makes it fail against an offer that
    // expires relative to when the component mounted rather than to when the
    // completion was recorded.
    seed([withOldHistory()])
    launch()
    await screen.findByText('Boiler service')

    expect(undoControl()).toBeNull()
    expect(storedCompletionIds()).toHaveLength(3)
  })

  it('does not resurrect an expired offer when the app is reopened', async () => {
    // A phone backgrounds and relaunches constantly. If the window were counted
    // from the mount, every relaunch would put the offer back and the data-loss
    // defect would survive the fix.
    seed([anItem({ name: 'Boiler service', interval: YEARLY, completions: [aCompletion('2026-06-01')] })])
    const { user, app } = launch()
    await screen.findByText('Boiler service')
    await user.click(screen.getByRole('button', { name: /mark done/i }))

    await timePasses(UNDO_WINDOW_MS + 1_000)
    app.unmount()
    reopen()
    await screen.findByText('Boiler service')

    expect(undoControl()).toBeNull()
    expect(storedCompletionIds()).toHaveLength(2)
  })

  it('still offers undo when the app is reopened inside the window', async () => {
    // The other half of the same rule, and the reason the offer stays derived
    // from the stored document rather than held in session state: closing the
    // app a second after a mis-tap must not make the mis-tap permanent.
    seed([anItem({ name: 'Boiler service', interval: YEARLY, completions: [aCompletion('2026-06-01')] })])
    const { user, app } = launch()
    await screen.findByText('Boiler service')
    await user.click(screen.getByRole('button', { name: /mark done/i }))

    await timePasses(2_000)
    app.unmount()
    reopen()
    await screen.findByText('Boiler service')

    expect(undoControl()).not.toBeNull()
  })
})

describe('undo removes one entry and no more', () => {
  it('leaves every earlier completion in the stored history, and offers no second press', async () => {
    // The regression guard for the defect, and the most important assertion in
    // this file. The old behaviour removed one entry per press, forever, until
    // the job had no history left — and the screen was not where you noticed,
    // because the row shows a due date rather than a history. What is stored is
    // the part that matters.
    seed([withOldHistory()])
    const { user } = launch()
    await screen.findByText('Boiler service')

    await user.click(screen.getByRole('button', { name: /mark done/i }))
    expect(storedCompletionIds()).toHaveLength(4)

    const undo = undoControl()
    expect(undo).not.toBeNull()
    await user.click(undo!)

    // Exactly the tick-off just made, and nothing else.
    expect(storedCompletionIds()).toEqual(['cmp_2020-03-15', 'cmp_2022-04-20', 'cmp_2024-05-06'])
    // And there is nothing left to take back, so the app must not offer to take
    // back something else — which is precisely how three presses deleted 2024,
    // 2022 and 2020 in turn.
    expect(undoControl()).toBeNull()
    expect(storedCompletionIds()).toHaveLength(3)
  })
})

describe('when the offer expires under the user’s fingers', () => {
  it('does not drop focus to the top of the document', async () => {
    // `keyboard-us2.test.tsx` already fixed this class of bug for undo being
    // *pressed*. Expiry removes the same control without the user doing
    // anything, so it needs the same treatment: a keyboard or VoiceOver user is
    // otherwise silently returned to the start of the page with no indication
    // that anything happened.
    seed([anItem({ name: 'Boiler service', interval: YEARLY, completions: [aCompletion('2026-06-01')] })])
    const { user } = launch()
    await screen.findByText('Boiler service')
    await user.click(screen.getByRole('button', { name: /mark done/i }))

    const undo = screen.getByRole('button', { name: /undo/i })
    // Reached by tabbing rather than by calling `.focus()`, so the control is
    // asserted to be keyboard-reachable in the first place.
    expect(await tabUntil(user, (el) => el === undo)).toBe(undo)

    await timePasses(UNDO_WINDOW_MS + 1_000)

    expect(undoControl()).toBeNull()
    expect(document.activeElement).not.toBe(document.body)
    expect(document.activeElement).not.toBeNull()
  })
})
