import { addInterval, daysBetween } from './interval'
import { needsAttention } from './types'
import type {
  CalendarDate,
  Completion,
  ItemStatus,
  ItemView,
  MaintenanceItem,
} from './types'

/**
 * The scheduling rules. Pure functions — today's date comes in as a parameter,
 * never from the clock, and nothing here touches storage.
 *
 * That is what makes the midnight-rollover case an ordinary test rather than
 * one needing fake timers, and it is why `useCurrentDate` (the thing that
 * actually watches the clock) lives in the UI layer instead.
 */

/** The newest tick-off by date, or null if it has never been done. */
export function lastCompletedOn(item: MaintenanceItem): CalendarDate | null {
  let newest: CalendarDate | null = null
  for (const completion of item.completions) {
    if (newest === null || completion.completedOn > newest) {
      newest = completion.completedOn
    }
  }
  return newest
}

/**
 * When the job is next due — counted from when it was actually done, never
 * from the date it was meant to meet (FR-013).
 *
 * Null while it has never been done: the app does not invent a due date from a
 * service that never happened (FR-004a).
 */
export function nextDueOn(item: MaintenanceItem): CalendarDate | null {
  const last = lastCompletedOn(item)
  return last === null ? null : addInterval(last, item.interval)
}

export function classifyStatus(item: MaintenanceItem, today: CalendarDate): ItemStatus {
  const due = nextDueOn(item)
  if (due === null) return 'never-done'

  // Comparing `YYYY-MM-DD` as strings is a correct date comparison, because the
  // format sorts lexicographically. No parsing, no timezone.
  if (due < today) return 'overdue'
  if (due === today) return 'due'
  return 'not-due'
}

export function toView(item: MaintenanceItem, today: CalendarDate): ItemView {
  const status = classifyStatus(item, today)
  const due = nextDueOn(item)

  return {
    item,
    status,
    lastCompletedOn: lastCompletedOn(item),
    nextDueOn: due,
    daysOverdue: status === 'overdue' && due !== null ? daysBetween(due, today) : 0,
  }
}

/** Lower sorts first. See `ATTENTION_STATUSES` for why `due` is in the group. */
const STATUS_RANK: Record<ItemStatus, number> = {
  overdue: 0,
  due: 1,
  'never-done': 2,
  'not-due': 3,
}

/**
 * The list order: everything needing attention first (FR-004), then the rest.
 *
 * Within each group there is a sensible secondary order — longest overdue
 * first, soonest due first, and oldest-added first for never-done jobs, which
 * have no due date to sort by. That last one is the only thing `createdAt` is
 * for.
 */
export function orderForDisplay(items: MaintenanceItem[], today: CalendarDate): ItemView[] {
  return [...items]
    .map((item) => toView(item, today))
    .sort((a, b) => {
      const byGroup = Number(needsAttention(b.status)) - Number(needsAttention(a.status))
      if (byGroup !== 0) return byGroup

      const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status]
      if (byStatus !== 0) return byStatus

      switch (a.status) {
        case 'overdue':
          return b.daysOverdue - a.daysOverdue
        case 'never-done':
          return a.item.createdAt.localeCompare(b.item.createdAt)
        case 'not-due':
          return (a.nextDueOn ?? '').localeCompare(b.nextDueOn ?? '')
        case 'due':
          return 0
      }
    })
}

/**
 * Record that a job was done.
 *
 * Backdating is allowed — recording a service you forgot is normal. Future
 * dates are not: you cannot have already done something you have not done yet.
 */
export function completeItem(
  item: MaintenanceItem,
  completion: Completion,
  today?: CalendarDate,
): MaintenanceItem {
  if (today !== undefined && completion.completedOn > today) {
    throw new Error(`Cannot complete an item in the future: ${completion.completedOn} > ${today}`)
  }

  return { ...item, completions: [...item.completions, completion] }
}

/** A tick-off together with the job it belongs to. */
export interface RecordedCompletion {
  item: MaintenanceItem
  completion: Completion
}

/**
 * The tick-off undo would remove: the highest `recordedAt` anywhere in the
 * schedule, and the job holding it.
 *
 * Undo is one step across the whole schedule rather than per job, so the
 * question "what would undo do" has to be answerable from the items alone —
 * which is what makes it survive the app being closed (FR-007). There is no
 * remembered session, nothing to expire, and nothing to restore on start-up:
 * the answer is derived from the same document the completions live in.
 *
 * Ties on `recordedAt` resolve to the last one encountered, which is the most
 * recently appended. They are only reachable when two entries share a
 * millisecond, but leaving it to chance would make undo and the notice
 * describing it disagree about which entry they mean.
 */
export function mostRecentlyRecorded(items: MaintenanceItem[]): RecordedCompletion | null {
  let newest: RecordedCompletion | null = null
  for (const item of items) {
    for (const completion of item.completions) {
      if (newest === null || completion.recordedAt >= newest.completion.recordedAt) {
        newest = { item, completion }
      }
    }
  }
  return newest
}

/**
 * Undo the most recently *recorded* tick-off — the highest `recordedAt`, not
 * the latest `completedOn`.
 *
 * Those differ exactly when someone backdates an entry, which is the case where
 * getting it wrong hurts: you mistype a date, hit undo, and the wrong tick-off
 * disappears. The entry you just made is the one you mean.
 *
 * Defined in terms of `mostRecentlyRecorded` so that the entry the app *names*
 * in its undo notice and the entry undo actually removes cannot drift apart.
 */
export function undoCompletion(item: MaintenanceItem): MaintenanceItem {
  const target = mostRecentlyRecorded([item])
  if (target === null) return item

  // By identity rather than by id: two entries sharing an id would be a bug,
  // but it must not become a bug that silently deletes both.
  return { ...item, completions: item.completions.filter((c) => c !== target.completion) }
}

/**
 * The job's history in the order a person reads it: most recent first (FR-008).
 *
 * Ordered by the day the work happened, since that is what the list shows.
 * `recordedAt` breaks ties, so two jobs done on the same day appear with the
 * one entered later at the top — the same "newest" the rest of the app means.
 *
 * Sorted rather than trusted: `completeItem` appends, so the stored array is in
 * the order entries were made, which is only the same thing until somebody
 * backdates one.
 */
export function completionsNewestFirst(item: MaintenanceItem): Completion[] {
  return [...item.completions].sort((a, b) =>
    a.completedOn === b.completedOn
      ? b.recordedAt.localeCompare(a.recordedAt)
      : b.completedOn.localeCompare(a.completedOn),
  )
}
