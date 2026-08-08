import type { ItemView } from '../../domain/types'
import { StatusBadge } from './StatusBadge'
import { formatDisplayDate } from '../format'

/**
 * One job in the list.
 *
 * Shows the next due date inline, so you can tell when something is due without
 * opening it (US1 scenario 4). A never-done job shows no date at all — the app
 * does not invent one, and it must not display anything that reads like a due
 * date it does not have.
 */
export function ItemRow({ view }: { view: ItemView }) {
  return (
    <li className={`row row--${view.status}`}>
      <div className="row__main">
        <h3 className="row__name">{view.item.name}</h3>
        <StatusBadge status={view.status} />
      </div>
      {view.nextDueOn !== null && (
        <p className="row__meta">
          {view.status === 'overdue' ? 'Was ' : 'Next '}
          {formatDisplayDate(view.nextDueOn)}
        </p>
      )}
    </li>
  )
}
