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
 *
 * **Two controls, both real buttons.** The name opens the job; "Mark done"
 * ticks it off where it stands, which is what keeps SC-004's two-tap budget
 * comfortable — it costs one. Neither is a click-handled `div`, and both carry
 * the job's name in their accessible name, because a screen-reader user
 * arriving at the tenth "Mark done" of a list has no other way to tell which
 * job it belongs to. The name is appended to the visible label rather than
 * replacing it via `aria-label`, so the accessible name still contains what is
 * on screen (WCAG 2.5.3).
 */
export function ItemRow({
  view,
  onOpen,
  onMarkDone,
}: {
  view: ItemView
  onOpen: () => void
  onMarkDone: () => void
}) {
  return (
    <li className={`row row--${view.status}`}>
      <div className="row__main">
        <h3 className="row__name">
          <button type="button" className="row__open" onClick={onOpen}>
            {view.item.name}
          </button>
        </h3>
        <StatusBadge status={view.status} />
      </div>
      {view.nextDueOn !== null && (
        <p className="row__meta">
          {view.status === 'overdue' ? 'Was ' : 'Next '}
          {formatDisplayDate(view.nextDueOn)}
        </p>
      )}
      <div className="row__actions">
        <button type="button" className="button row__done" onClick={onMarkDone}>
          Mark done
          <span className="visually-hidden"> — {view.item.name}</span>
        </button>
      </div>
    </li>
  )
}
