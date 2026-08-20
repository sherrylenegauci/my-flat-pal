import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { classifyStatus, completionsNewestFirst, nextDueOn, removeCompletion } from '../../domain/schedule'
import type { CalendarDate, ItemView } from '../../domain/types'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { StatusBadge, STATUS_LABELS } from '../components/StatusBadge'
import { formatDisplayDate } from '../format'

/**
 * One job, in full (T059): when it was last done, when it is next due, and
 * everything ever recorded against it.
 *
 * **Getting back out is the shell's job**, and it matters more here than
 * anywhere else in the app. An installed PWA on iOS has no system back button
 * and its edge-swipe is unreliable in a standalone window (verified, T011), so
 * without the control `App.tsx` draws, opening a job would strand the user with
 * nothing but force-quitting.
 *
 * **Why this view has a date field at all.** Marking done from the list records
 * today, in one tap, which is the common case. Remembering in August that the
 * boiler was serviced in June is the other one, and it needs somewhere to say
 * so. Future dates are refused: you cannot have already done something you have
 * not done yet.
 *
 * **Correcting and deleting live here** (T069, FR-009), at the bottom, below the
 * history the deletion would take with it.
 *
 * **And so does the only way to correct one wrong row** (T103, FR-007a). Undo
 * reaches a tick-off for ten seconds, in the session that recorded it; after
 * that the history list is the only place a mistake can be put right, which is
 * what FR-007a has always said and what nothing implemented until now.
 */
export function ItemDetailView({
  view,
  today,
  onRecord,
  onEdit,
  onDelete,
  onRemoveCompletion,
}: {
  view: ItemView
  today: CalendarDate
  onRecord: (completedOn: CalendarDate) => void
  onEdit: () => void
  onDelete: () => void
  onRemoveCompletion: (completionId: string) => void
}) {
  const ids = useId()
  const [completedOn, setCompletedOn] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const historyRef = useRef<HTMLHeadingElement>(null)

  const history = completionsNewestFirst(view.item)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()

    if (completedOn === '') {
      setError('Choose the date it was done.')
      return
    }
    if (completedOn > today) {
      setError('That date is in the future. You can only record something you have already done.')
      return
    }

    setError(null)
    setCompletedOn('')
    onRecord(completedOn)
  }

  /**
   * What deleting this job actually costs, said plainly rather than as "are you
   * sure".
   *
   * The spec cut export and backup deliberately ("No backup, no export"), so a
   * deleted history is gone from the only copy that exists. The count is in the
   * sentence because "its history goes too" is abstract and "3 completions
   * recorded" is not — the user is being asked about a specific quantity of
   * their own records.
   *
   * A job that has never been done gets a different sentence, because promising
   * to discard a history it does not have would be false, and a confirmation
   * that says something untrue is worse than none: it teaches the user that the
   * words in these dialogs are boilerplate.
   */
  const recorded = view.item.completions.length
  const consequence =
    recorded === 0
      ? 'Nothing has been recorded against it yet. This app has no backup and no export, ' +
        'so the job cannot be got back.'
      : `Its history goes too: ${recorded} completion${recorded === 1 ? '' : 's'} recorded. ` +
        'This app has no backup and no export, so nothing here can be got back.'

  /**
   * The entry the user has asked to remove, if the dialog is open.
   *
   * Looked up rather than stored, so an entry that disappeared underneath us —
   * another window removed it, or deleted the job — simply closes the question
   * instead of leaving a dialog asking about a row that no longer exists.
   */
  const removing = removingId === null ? null : (history.find((c) => c.id === removingId) ?? null)

  /**
   * What removing that entry actually costs, computed rather than asserted.
   *
   * Deleting a job loses history; removing one entry does something a user is
   * far less likely to predict — it **moves the schedule**, because the next due
   * date is derived from the last completion and never stored. That is the
   * whole reason a mistaken tick-off matters: it pushes an annual service a year
   * out. A confirmation that said only "this cannot be undone" would leave out
   * the consequence the user actually cares about.
   *
   * **Which of the three sentences applies is decided by comparing the due date
   * before and after**, never by the entry's position in the list or by whether
   * its date matches the job's last-completed date. Two entries recorded on the
   * same day — one of the ways this mistake gets made — are both "the latest
   * date", and removing either leaves the other holding the schedule exactly
   * where it was. Deciding by position would tell the user their schedule is
   * about to move when it is not.
   *
   * Saying so when nothing moves is not padding: FR-006a already establishes
   * that an unmoved schedule has to be stated out loud, because a tap that
   * appears to do nothing reads as a fault. A warning about a move that will not
   * happen is the same fault from the other side.
   *
   * The status word comes from `STATUS_LABELS`, the badge's own vocabulary, so
   * the dialog cannot promise a state the screen never displays.
   */
  const NO_WAY_BACK = 'This app has no backup and no export, so the entry cannot be got back.'

  let removalConsequence = ''
  if (removing !== null) {
    const after = removeCompletion(view.item, removing.id)
    const dueAfter = nextDueOn(after)
    const willShowAs = STATUS_LABELS[classifyStatus(after, today)]

    if (dueAfter === null) {
      removalConsequence =
        'This is the only completion recorded, so this job loses its next due date and ' +
        `will show as ${willShowAs}. ${NO_WAY_BACK}`
    } else {
      const moves = dueAfter !== view.nextDueOn
      removalConsequence =
        'The next due date is worked out from the last completion, so removing this ' +
        (moves
          ? `moves it back to ${formatDisplayDate(dueAfter)} and the job will show as ${willShowAs}. `
          : `leaves it at ${formatDisplayDate(dueAfter)} and the job still shows as ${willShowAs}. `) +
        NO_WAY_BACK
    }
  }

  /**
   * Remove it, then put focus on the History heading.
   *
   * The control that opened the dialog goes away with the row it was in, so
   * `ConfirmDialog`'s own rule — give focus back to whatever opened it — cannot
   * fire, and focus would fall to `<body>`: silent, and it returns a keyboard or
   * VoiceOver user to the top of the document with no indication that anything
   * happened. The heading is the right landing place rather than merely a safe
   * one, because the list underneath it is what just changed and is where they
   * would look to check.
   *
   * Focus moves here, synchronously, before React commits the removal. The
   * heading is not part of what unmounts, so it still holds focus afterwards,
   * and the dialog's cleanup then sees focus was not lost and leaves it alone.
   */
  function handleConfirmRemoval(completionId: string) {
    onRemoveCompletion(completionId)
    setRemovingId(null)
    historyRef.current?.focus()
  }

  return (
    <div className="detail">
      <div className="detail__head">
        <h2 className="detail__title">{view.item.name}</h2>
        <StatusBadge status={view.status} />
      </div>

      <p className="detail__meta">
        Every {view.item.interval.count} {view.item.interval.unit}
        {view.item.interval.count === 1 ? '' : 's'}
      </p>

      {/* No due date is shown for a job that has never been done: the app does
          not invent one from a service that never happened (FR-004a). */}
      {view.lastCompletedOn !== null && (
        <p className="detail__fact">Last done {formatDisplayDate(view.lastCompletedOn)}</p>
      )}
      {view.nextDueOn !== null && (
        <p className="detail__fact">Next due {formatDisplayDate(view.nextDueOn)}</p>
      )}

      <form className="detail__record" onSubmit={handleSubmit} noValidate>
        <h3 className="detail__subtitle">Record it as done</h3>

        <div className="form__field">
          <label htmlFor={`${ids}-date`}>Date it was done</label>
          <input
            id={`${ids}-date`}
            type="date"
            value={completedOn}
            max={today}
            onChange={(e) => setCompletedOn(e.target.value)}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? `${ids}-error` : undefined}
          />
          {error && (
            <p className="form__error" id={`${ids}-error`} role="alert">
              {error}
            </p>
          )}
        </div>

        <button type="submit" className="button button--primary">
          Record it
        </button>
      </form>

      {/* `tabIndex={-1}` so a removal can put focus here, the same way the app
          shell's own `<h1>` is made focusable for a view change. It is excluded
          from `INTERACTIVE_SELECTOR` in e2e/support/probe.ts, so it adds no stop
          to the Tab order and nothing to the touch-target sweep. */}
      <h3 className="detail__subtitle" id={`${ids}-history`} ref={historyRef} tabIndex={-1}>
        History
      </h3>
      {history.length === 0 ? (
        <p className="detail__empty">No completions recorded yet.</p>
      ) : (
        <ul className="detail__history" aria-labelledby={`${ids}-history`}>
          {history.map((completion) => (
            <li key={completion.id}>
              <span>{formatDisplayDate(completion.completedOn)}</span>
              {/* One control per entry, because the correction is per entry.
                  The visible word is "Remove" — the date is already on the row,
                  and repeating it on the button would double the row's width at
                  375px — while the accessible name carries the whole thing, so a
                  VoiceOver user meeting the button through the rotor, out of the
                  context of its row, still knows what it removes. The visible
                  text is a prefix of the accessible name, which is what WCAG
                  2.5.3 asks for; the same pattern is in `ItemRow` and
                  `UndoNotice`. */}
              <button
                type="button"
                className="button detail__history-remove"
                onClick={() => setRemovingId(completion.id)}
              >
                Remove
                <span className="visually-hidden">
                  {' '}
                  the completion on {formatDisplayDate(completion.completedOn)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="detail__corrections">
        <button type="button" className="button" onClick={onEdit}>
          Edit job
        </button>
        <button type="button" className="button" onClick={() => setConfirmingDelete(true)}>
          Delete job
        </button>
      </div>

      {/* The confirmation is a general component (T067) given this job's
          particulars, not a delete-a-job dialog — which is what lets the two
          callers below share it. The second was predicted when the first was
          built, and is the second concrete use case Principle I asks for before
          an abstraction appears. */}
      {confirmingDelete && (
        <ConfirmDialog
          question={`Delete “${view.item.name}”?`}
          consequence={consequence}
          confirmLabel="Delete permanently"
          onConfirm={onDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}

      {/* The confirm label is deliberately not "Remove", the word on the control
          that opened this. If it were, "the button named Remove" would match
          two elements while the dialog is open and neither a test nor a screen
          reader user could say which one they had — the reason recorded on
          `ConfirmDialogProps.confirmLabel`. */}
      {removing !== null && (
        <ConfirmDialog
          question={`Remove the completion on ${formatDisplayDate(removing.completedOn)}?`}
          consequence={removalConsequence}
          confirmLabel="Remove permanently"
          onConfirm={() => handleConfirmRemoval(removing.id)}
          onCancel={() => setRemovingId(null)}
        />
      )}
    </div>
  )
}
