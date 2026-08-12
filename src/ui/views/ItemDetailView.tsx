import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { completionsNewestFirst } from '../../domain/schedule'
import type { CalendarDate, ItemView } from '../../domain/types'
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
 */
export function ItemDetailView({
  view,
  today,
  onRecord,
}: {
  view: ItemView
  today: CalendarDate
  onRecord: (completedOn: CalendarDate) => void
}) {
  const ids = useId()
  const [completedOn, setCompletedOn] = useState('')
  const [error, setError] = useState<string | null>(null)

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
    </div>
  )
}
