/**
 * How long the undo offer stands after a completion was recorded.
 *
 * **STUB — the real decision lands with T097.** This exists so the tests written
 * for T094 fail on their assertions rather than on a missing import, which is
 * what Principle III means by observing the *right* failure: a module-not-found
 * error proves nothing about behaviour.
 */

/** Roughly ten seconds, per FR-007. */
export const UNDO_WINDOW_MS = 10_000

/**
 * Whether a completion recorded at `recordedAt` can still be undone at `now`.
 *
 * Takes the moment as a parameter and never reads the clock, like every other
 * date decision in `src/domain/`.
 */
export function isWithinUndoWindow(_recordedAt: string, _now: Date): boolean {
  return true
}
