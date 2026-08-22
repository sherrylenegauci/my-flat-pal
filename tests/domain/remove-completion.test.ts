import { describe, it, expect } from 'vitest'
import { classifyStatus, nextDueOn, removeCompletion } from '../../src/domain/schedule'
import { aCompletion, anItem, yearly } from './helpers'

/**
 * T103 — taking one wrong entry out of a job's history.
 *
 * **Why this function has to exist.** Undo is deliberately scoped to the
 * session that recorded a tick-off and to a ten-second window (FR-007), and
 * that is correct. What it leaves behind is a mistaken tick-off eleven seconds
 * old that nothing can touch: the next due date has already moved a full
 * interval, so an annual service drops off the list for a year, and the history
 * — kept because the spec says it is "worth being able to prove" — now records
 * work that never happened. Deleting the job (FR-009) removes the entire
 * history to correct one row, which is an amputation rather than a correction.
 * FR-007a's closing sentence, "correcting an older mistake is done from the
 * item's history, not from the undo offer", has been false since it was written.
 *
 * **The two rules that are easy to get wrong, and are pinned here.**
 *
 *   - The entry is chosen by **id**, not by recency. `undoCompletion` picks the
 *     highest `recordedAt`, which is right for undo and wrong for this: the
 *     entry a user points at in the history list is ordered by `completedOn`,
 *     and a backdated entry has a late `recordedAt` with an early
 *     `completedOn`. An implementation that reused undo's rule would remove a
 *     different row from the one the user named.
 *   - An id that is not there returns the **same object**, by reference. That
 *     identity is what `mutate` in `useSchedule` reads as "declined, do not
 *     write". Handing back a fresh-but-equal array writes anyway, bumps
 *     `revision`, and sends any other open window into stale-write recovery
 *     over a write with nothing in it.
 *
 * Domain tier: no React, no storage, no clock. Today comes in as a parameter,
 * which is what makes "this removal flips the job to Overdue" an ordinary
 * assertion rather than fake-timer gymnastics.
 *
 * **What this file does not cover.** Anything a user does. Whether the history
 * list actually offers a control per entry, what the confirmation says, and
 * whether the removal survives StrictMode and reaches storage are all in
 * `tests/ui/remove-completion.test.tsx`.
 */
describe('removeCompletion', () => {
  it('removes the entry with that id', () => {
    const item = anItem({
      interval: yearly,
      completions: [
        aCompletion('2025-06-05', { id: 'cmp_middle' }),
        aCompletion('2026-06-01', { id: 'cmp_newest' }),
      ],
    })

    const after = removeCompletion(item, 'cmp_middle')

    expect(after.completions.map((c) => c.id)).toEqual(['cmp_newest'])
  })

  it('removes the entry that was named, not the first and not the newest', () => {
    // Three entries so that "the middle one" is a distinct answer from both
    // `completions[0]` and "the latest". Either shortcut passes a two-entry
    // fixture half the time and fails here every time.
    const item = anItem({
      interval: yearly,
      completions: [
        aCompletion('2024-05-06', { id: 'cmp_oldest' }),
        aCompletion('2025-06-05', { id: 'cmp_middle' }),
        aCompletion('2026-06-01', { id: 'cmp_newest' }),
      ],
    })

    const after = removeCompletion(item, 'cmp_middle')

    expect(after.completions.map((c) => c.id)).toEqual(['cmp_oldest', 'cmp_newest'])
  })

  it('does not choose the entry by when it was recorded', () => {
    // The case where `recordedAt` order and `completedOn` order disagree: a
    // service done in 2020 and typed in this morning. The history list shows
    // it at the bottom; undo would take it first, because it has the highest
    // `recordedAt`. Asking for the *other* entry must remove the other entry.
    // An implementation that delegated to `undoCompletion` fails this and
    // passes almost everything else.
    const item = anItem({
      interval: yearly,
      completions: [
        aCompletion('2025-06-05', { id: 'cmp_seen', recordedAt: '2025-06-05T12:00:00.000Z' }),
        aCompletion('2020-01-01', { id: 'cmp_backdated', recordedAt: '2026-08-01T10:00:00.000Z' }),
      ],
    })

    const after = removeCompletion(item, 'cmp_seen')

    expect(after.completions.map((c) => c.id)).toEqual(['cmp_backdated'])
  })

  it('hands back the very same job when the id is not there', () => {
    // Identity, not equality — `toBe`, deliberately. `mutate` treats an
    // unchanged array as a decision not to write, and a `{ ...item }` that
    // changed nothing still costs a `revision` bump and pushes another open
    // window into stale-write recovery for no reason. Same rule `editItem` and
    // `deleteItem` already follow.
    const item = anItem({ completions: [aCompletion('2026-06-01', { id: 'cmp_newest' })] })

    expect(removeCompletion(item, 'cmp_gone')).toBe(item)
  })

  it('hands back the very same job when it has no history at all', () => {
    const item = anItem({ completions: [] })

    expect(removeCompletion(item, 'cmp_anything')).toBe(item)
  })

  it('removes exactly one entry even if two share an id', () => {
    // Two entries with one id would be a bug. It must not become a bug that
    // silently deletes two — the same reasoning already written on
    // `undoCompletion`'s identity filter.
    const item = anItem({
      interval: yearly,
      completions: [
        aCompletion('2025-06-05', { id: 'cmp_dup' }),
        aCompletion('2026-06-01', { id: 'cmp_dup' }),
      ],
    })

    const after = removeCompletion(item, 'cmp_dup')

    expect(after.completions).toHaveLength(1)
  })

  it('does not mutate the original job', () => {
    const item = anItem({
      interval: yearly,
      completions: [
        aCompletion('2025-06-05', { id: 'cmp_middle' }),
        aCompletion('2026-06-01', { id: 'cmp_newest' }),
      ],
    })

    const after = removeCompletion(item, 'cmp_newest')

    // Both halves matter. On its own, "the original still has two entries" is
    // satisfied by a function that does nothing at all, so the removal has to
    // be asserted alongside it.
    expect(after.completions.map((c) => c.id)).toEqual(['cmp_middle'])
    expect(item.completions.map((c) => c.id)).toEqual(['cmp_middle', 'cmp_newest'])
  })
})

/**
 * What removing an entry does to the schedule.
 *
 * This is the point of the task rather than a side effect: the cost of a
 * mistaken tick-off is that the next due date moved, so removing it has to move
 * the due date back — including backwards past today, which is exactly the
 * "an annual service drops off the list for a year" case being corrected here.
 */
describe('removeCompletion and the next due date', () => {
  it('moves the due date back when the newest entry goes, and can flip the job to overdue', () => {
    const item = anItem({
      interval: yearly,
      completions: [
        aCompletion('2025-06-05', { id: 'cmp_middle' }),
        aCompletion('2026-06-01', { id: 'cmp_newest' }),
      ],
    })
    expect(nextDueOn(item)).toBe('2027-06-01')
    expect(classifyStatus(item, '2026-08-08')).toBe('not-due')

    const after = removeCompletion(item, 'cmp_newest')

    expect(nextDueOn(after)).toBe('2026-06-05')
    expect(classifyStatus(after, '2026-08-08')).toBe('overdue')
  })

  it('leaves the due date exactly where it was when an older entry goes', () => {
    const item = anItem({
      interval: yearly,
      completions: [
        aCompletion('2024-05-06', { id: 'cmp_oldest' }),
        aCompletion('2026-06-01', { id: 'cmp_newest' }),
      ],
    })

    const after = removeCompletion(item, 'cmp_oldest')

    // The entry is asserted gone as well as the due date asserted unmoved:
    // "nothing moved" is also what a function that did nothing would produce,
    // and this has to be able to tell those two apart.
    expect(after.completions.map((c) => c.id)).toEqual(['cmp_newest'])
    expect(nextDueOn(after)).toBe('2027-06-01')
    expect(classifyStatus(after, '2026-08-08')).toBe('not-due')
  })

  it('leaves the due date where it was when a second entry shares the same date', () => {
    // Two entries on one day: the job recorded twice, which is one of the ways
    // this mistake happens in the first place. Removing either one leaves the
    // other setting the same due date, so nothing about the schedule moves —
    // even though the entry removed *was* one of the latest-dated ones.
    const item = anItem({
      interval: yearly,
      completions: [
        aCompletion('2025-06-05', { id: 'cmp_tied_early', recordedAt: '2025-06-05T12:00:00.000Z' }),
        aCompletion('2025-06-05', { id: 'cmp_tied_late', recordedAt: '2026-01-10T09:00:00.000Z' }),
      ],
    })

    const after = removeCompletion(item, 'cmp_tied_late')

    expect(after.completions.map((c) => c.id)).toEqual(['cmp_tied_early'])
    expect(nextDueOn(after)).toBe('2026-06-05')
    expect(classifyStatus(after, '2026-08-08')).toBe('overdue')
  })

  it('returns a job to never-done when its only entry goes', () => {
    // FR-004a: with nothing recorded there is no due date to show, and the app
    // must not invent one from a service that never happened.
    const item = anItem({
      interval: yearly,
      completions: [aCompletion('2026-06-01', { id: 'cmp_only' })],
    })

    const after = removeCompletion(item, 'cmp_only')

    expect(after.completions).toHaveLength(0)
    expect(nextDueOn(after)).toBeNull()
    expect(classifyStatus(after, '2026-08-08')).toBe('never-done')
  })
})
