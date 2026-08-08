import { useRef } from 'react'
import type { ItemView } from '../../domain/types'
import { needsAttention } from '../../domain/types'
import { EmptyState } from '../components/EmptyState'
import { ItemRow } from '../components/ItemRow'

/**
 * The list (T050).
 *
 * Order comes from `orderForDisplay`, and status is recomputed from today's
 * date on every render — never read back from storage, which is what stops it
 * going stale while the phone sits in a pocket.
 */
export function ScheduleView({ views, onAdd }: { views: ItemView[]; onAdd: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null)

  if (views.length === 0) return <EmptyState onAdd={onAdd} />

  const attention = views.filter((v) => needsAttention(v.status))
  const rest = views.filter((v) => !needsAttention(v.status))

  return (
    <div className="schedule">
      <div className="schedule__head">
        <h2 className="schedule__title" ref={heading} tabIndex={-1}>
          {attention.length > 0
            ? `${attention.length} needing attention`
            : 'Nothing due right now'}
        </h2>
        <button type="button" className="button button--primary" onClick={onAdd}>
          Add job
        </button>
      </div>

      {/* One list, not two. Splitting into separate lists would make the
          ordering rule invisible to a screen reader, which reads them as
          unrelated groups rather than one prioritised sequence. */}
      <ul className="schedule__list">
        {[...attention, ...rest].map((view) => (
          <ItemRow key={view.item.id} view={view} />
        ))}
      </ul>
    </div>
  )
}
