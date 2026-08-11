import { lastCompletedOn, nextDueOn } from '../../domain/schedule'
import type { RecordedCompletion } from '../../domain/schedule'
import { formatDisplayDate } from '../format'

/**
 * What the last tick-off did, and the way back from it (T061).
 *
 * **Why this is in the shell rather than a toast.** FR-007 requires undo to
 * survive the app being closed and reopened. A message that fades after a few
 * seconds cannot do that, and neither can anything held in session state — the
 * design that was cut from the data model precisely because a phone backgrounds
 * constantly and a mis-tap would become permanent. So the notice is *derived*:
 * `mostRecentlyRecorded` reads the same stored document the completions live
 * in, which means reopening the app reconstructs it exactly.
 *
 * **Why it names the resulting due date.** Marking done is one tap with no
 * confirmation. Saying "recorded" alone leaves the user to work out whether
 * anything moved, and in the backdating case the honest answer is "nothing" —
 * which FR-006 says has to be stated rather than left as a silent no-op.
 */
export function UndoNotice({
  undoable,
  onUndo,
}: {
  undoable: RecordedCompletion
  onUndo: () => void
}) {
  const { item, completion } = undoable
  const newest = lastCompletedOn(item)
  const due = nextDueOn(item)

  // The entry only moves the schedule if it is the newest one the job has. An
  // older one is real history and worth keeping, but it changes nothing.
  const setsTheSchedule = completion.completedOn === newest

  const opening = `${item.name} recorded as done on ${formatDisplayDate(completion.completedOn)}.`

  // `newest` and `due` are non-null whenever there is a tick-off to undo. The
  // guard is here for the type checker, not for a case that can arise.
  let message = opening
  if (newest !== null && due !== null) {
    message = setsTheSchedule
      ? `${opening} Next due ${formatDisplayDate(due)}.`
      : `${opening} The next due date is unchanged, because it was already done more recently, ` +
        `on ${formatDisplayDate(newest)} — still due ${formatDisplayDate(due)}.`
  }

  return (
    <div role="status" className="undo-notice">
      <p className="undo-notice__text">{message}</p>
      <button type="button" className="button undo-notice__action" onClick={onUndo}>
        Undo
        {/* Visible label stays "Undo"; the rest is for anyone who meets the
            control on its own, out of the sentence's context. Appended rather
            than replacing it via aria-label, so the accessible name still
            contains the visible text (WCAG 2.5.3). */}
        <span className="visually-hidden"> recording {item.name} as done</span>
      </button>
    </div>
  )
}
