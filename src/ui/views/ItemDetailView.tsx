import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { completionsNewestFirst } from '../../domain/schedule'
import type { CalendarDate, ItemView } from '../../domain/types'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { StatusBadge } from '../components/StatusBadge'
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
