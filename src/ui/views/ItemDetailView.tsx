import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { completionsNewestFirst } from '../../domain/schedule'
import type { CalendarDate, ItemView } from '../../domain/types'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { StatusBadge } from '../components/StatusBadge'
import { formatDisplayDate, formatInterval } from '../format'

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
 */
export function ItemDetailView({
  view,
  today,
  onRecord,
  onEdit,
  onDelete,
}: {
  view: ItemView
  today: CalendarDate
  onRecord: (completedOn: CalendarDate) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const ids = useId()
  const [completedOn, setCompletedOn] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const history = completionsNewestFirst(view.item)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()

    if (completedOn === '') {
      setError('Add the date you did it.')
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

  return (
    <div className="detail">
      <div className="detail__head">
        <h2 className="detail__title">{view.item.name}</h2>
        <StatusBadge status={view.status} />
      </div>

      {/* How often, and when it was last done: one sentence, because they are
          one thought. A job never done gets the interval alone — no dot left
          hanging, and no due date invented from a service that never happened
          (FR-004a).

          The dot is `aria-hidden` for the same reason the back control's chevron
          is: it is a visual separator, and whether VoiceOver announces U+00B7 as
          "middle dot" or passes over it depends on a punctuation setting the app
          does not control. Hiding it removes the question. The spaces sit in the
          visible text either side, so the accessible name does not run the two
          halves together. Whether the line still reads as one sentence out loud
          is a real-device question, and it is named in T078. */}
      <p className="detail__meta">
        {formatInterval(view.item.interval)}
        {view.lastCompletedOn !== null && (
          <>
            {' '}
            <span aria-hidden="true">·</span> last done{' '}
            {formatDisplayDate(view.lastCompletedOn)}
          </>
        )}
      </p>

      {view.nextDueOn !== null && (
        <p className="detail__fact">Next due {formatDisplayDate(view.nextDueOn)}</p>
      )}

      {/* One action, said once.

          This used to carry a heading ("Record it as done") above a label
          ("Date it was done") above a button ("Record it") — three phrasings of
          the same idea stacked down the screen. The label explains and the
          button acts, which is the ordinary division of labour between the two;
          the heading was a section title for a single field.

          The label has to survive being read with no visual context, because a
          screen-reader user meets the date field on its own and "Add" alone
          would tell them nothing about what they are adding. That is why the
          explaining lives in the label rather than in the button. */}
      <form className="detail__record" onSubmit={handleSubmit} noValidate>
        <div className="form__field">
          <label htmlFor={`${ids}-date`}>Add a date you did it</label>
          <div className="detail__record-row">
            <input
              id={`${ids}-date`}
              type="date"
              value={completedOn}
              max={today}
              onChange={(e) => setCompletedOn(e.target.value)}
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? `${ids}-error` : undefined}
            />
            <button type="submit" className="button button--primary">
              Add
            </button>
          </div>
          {error && (
            <p className="form__error" id={`${ids}-error`} role="alert">
              {error}
            </p>
          )}
        </div>
      </form>

      <h3 className="detail__subtitle" id={`${ids}-history`}>
        History
      </h3>
      {history.length === 0 ? (
        <p className="detail__empty">No completions recorded yet.</p>
      ) : (
        <ul className="detail__history" aria-labelledby={`${ids}-history`}>
          {history.map((completion) => (
            <li key={completion.id}>{formatDisplayDate(completion.completedOn)}</li>
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
          particulars, not a delete-a-job dialog. T103 hands it a different
          question to remove one completion from the history above. */}
      {confirmingDelete && (
        <ConfirmDialog
          question={`Delete “${view.item.name}”?`}
          consequence={consequence}
          confirmLabel="Delete permanently"
          onConfirm={onDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  )
}
