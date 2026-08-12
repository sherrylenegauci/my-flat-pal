/**
 * How long the offer to undo a tick-off stands (T097, FR-007).
 *
 * **Why this exists at all.** The offer used to be derived from the newest
 * `recordedAt` anywhere in the schedule with nothing to expire it. On a freshly
 * opened app, against a document this build had never written, three presses
 * deleted completions dated 2020, 2022 and 2024 — no confirmation at any point,
 * and no export or backup to get them back.
 *
 * **Why the moment is a parameter.** The window is measured from the
 * completion's `recordedAt` against the current time, never from when a
 * component mounted. Mount-relative expiry looks the same in a casual test and
 * is the same bug in disguise: reopening the app restarts the clock and the
 * expired offer comes back. Taking `now` as an argument is also what keeps this
 * testable without fake timers, like every other date decision in `src/domain/`.
 */

/** "Around ten seconds", per FR-007. */
export const UNDO_WINDOW_MS = 10_000

/**
 * Whether a completion recorded at `recordedAt` can still be undone at `now`.
 *
 * True for `0 <= now - recordedAt < UNDO_WINDOW_MS`; false either side of that.
 * Everything the function cannot make sense of is false as well — a timestamp it
 * cannot parse, and one that sits in the future because the device clock was
 * skewed or changed. This gates a control that deletes history irrecoverably, so
 * "I do not know" has to mean "do not offer".
 */
export function isWithinUndoWindow(recordedAt: string, now: Date): boolean {
  const recorded = Date.parse(recordedAt)
  if (Number.isNaN(recorded)) return false

  const elapsed = now.getTime() - recorded
  return elapsed >= 0 && elapsed < UNDO_WINDOW_MS
}
