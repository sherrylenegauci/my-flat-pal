import { describe, it, expect } from 'vitest'
import { UNDO_WINDOW_MS, isWithinUndoWindow } from '../../src/domain/undoWindow'

/**
 * T094 — is the tick-off just recorded still undoable?
 *
 * FR-007: the offer "MUST expire a short time after that completion was
 * recorded — around ten seconds — and MUST NOT be offered for completions
 * recorded earlier, including on a freshly opened app".
 *
 * This lives in the domain tier because it is arithmetic on two timestamps, and
 * because passing the moment in as a parameter is how every other date decision
 * in this codebase is tested. The function must never read the clock: if it did,
 * the UI could not be tested without fake-timer gymnastics, and reopening the app
 * would silently change the answer.
 *
 * The contract asserted here is `0 <= now - recordedAt < UNDO_WINDOW_MS`, and
 * everything outside that — including a `recordedAt` in the *future* and a
 * `recordedAt` that will not parse — is false. That direction is deliberate.
 * The control this gates deletes history from a device with no export and no
 * backup, so an input the function cannot make sense of must withdraw the offer
 * rather than leave it standing.
 */
const at = (iso: string) => new Date(iso)

/** A fixed instant. Nothing here depends on when the suite runs. */
const RECORDED = '2026-08-08T09:00:00.000Z'
const plus = (ms: number) => new Date(Date.parse(RECORDED) + ms)

describe('UNDO_WINDOW_MS', () => {
  it('is the ten seconds FR-007 names', () => {
    // Stated as a value rather than left implicit, because the UI and this
    // module have to agree on it, and "around ten seconds" is a user-facing
    // promise about how long a mis-tap stays recoverable.
    expect(UNDO_WINDOW_MS).toBe(10_000)
  })
})

describe('isWithinUndoWindow', () => {
  it('is true at the instant the completion was recorded', () => {
    expect(isWithinUndoWindow(RECORDED, plus(0))).toBe(true)
  })

  it('is true a second later, while the user is still looking at the offer', () => {
    expect(isWithinUndoWindow(RECORDED, plus(1_000))).toBe(true)
  })

  it('is true right up to the last millisecond of the window', () => {
    expect(isWithinUndoWindow(RECORDED, plus(UNDO_WINDOW_MS - 1))).toBe(true)
  })

  it('is false once the window has exactly elapsed', () => {
    // The boundary is closed at the start and open at the end, so the offer is
    // gone at ten seconds rather than at ten seconds and one millisecond.
    expect(isWithinUndoWindow(RECORDED, plus(UNDO_WINDOW_MS))).toBe(false)
  })

  it('is false a moment after the window has passed', () => {
    expect(isWithinUndoWindow(RECORDED, plus(UNDO_WINDOW_MS + 1))).toBe(false)
  })

  it('is false a minute later', () => {
    expect(isWithinUndoWindow(RECORDED, plus(60_000))).toBe(false)
  })

  it('is false for a completion recorded days ago', () => {
    // The defect this whole change exists for: a freshly opened app offering to
    // delete history it never wrote.
    expect(isWithinUndoWindow('2024-05-06T12:00:00.000Z', at('2026-08-08T09:00:00.000Z'))).toBe(
      false,
    )
  })

  it('is false for a completion recorded in the future', () => {
    // A device whose clock is skewed, or was changed between recording and now.
    // Left true, such a completion would keep an offer to delete history
    // standing indefinitely — so this fails closed.
    expect(isWithinUndoWindow(RECORDED, plus(-1))).toBe(false)
    expect(isWithinUndoWindow(RECORDED, plus(-60_000))).toBe(false)
    expect(isWithinUndoWindow('2030-01-01T00:00:00.000Z', at(RECORDED))).toBe(false)
  })

  it('is false when recordedAt cannot be read as a timestamp', () => {
    // Same reasoning: an entry this function cannot place in time must not
    // license deleting it. `Date.parse` yields NaN here, and every comparison
    // against NaN is false, so an implementation must not rely on the arithmetic
    // falling out the right way by accident — hence the assertion.
    expect(isWithinUndoWindow('not a date', at(RECORDED))).toBe(false)
    expect(isWithinUndoWindow('', at(RECORDED))).toBe(false)
    expect(isWithinUndoWindow('2026-13-45T99:00:00.000Z', at(RECORDED))).toBe(false)
  })

  it('answers from the moment it is given, not from the clock', () => {
    // Both instants are years in the past relative to any real run of this
    // suite. An implementation that read `new Date()` instead of `now` would
    // call this expired, and would then be untestable in the UI without fake
    // timers — and, worse, would give different answers on different days.
    expect(
      isWithinUndoWindow('2020-01-01T00:00:00.000Z', at('2020-01-01T00:00:05.000Z')),
    ).toBe(true)
  })
})
