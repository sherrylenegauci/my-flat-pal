/**
 * The shapes the whole app is built on. See plan.md § Data model.
 *
 * Everything here is data — no behaviour, no clock, no storage. The scheduling
 * rules in `schedule.ts` take dates as parameters so they can be tested by
 * passing a date in, including the midnight-rollover case.
 */

/** How often a job comes round. Simple periods only. */
export type IntervalUnit = 'day' | 'week' | 'month' | 'year'

export interface Interval {
  /** At least 1. */
  count: number
  unit: IntervalUnit
}

/**
 * A calendar date with no time component, as `YYYY-MM-DD`.
 *
 * This is a distinct type on purpose. A job is due for the whole of its due
 * date, not at an instant — keeping calendar dates out of `Date` avoids the
 * timezone trap where a local-midnight `Date` serialises to the previous day
 * for anyone west of UTC.
 */
export type CalendarDate = string

/** A real instant, ISO 8601. Distinct from CalendarDate — see above. */
export type Timestamp = string

/** A record that a job was done. Immutable once saved, except by undo. */
export interface Completion {
  id: string
  /** When the work happened. May be backdated; never in the future. */
  completedOn: CalendarDate
  /** When the entry was made. The ordering key for undo. */
  recordedAt: Timestamp
}

/** Something the flat needs doing repeatedly. */
export interface MaintenanceItem {
  id: string
  name: string
  interval: Interval
  createdAt: CalendarDate
  /** Newest `completedOn` first. Empty means never done. */
  completions: Completion[]
}

/**
 * Never stored — always derived. A stored status would quietly go stale the
 * moment the date changed while the app sat in the background, and FR-005
 * requires status to re-evaluate without a reload.
 */
export type ItemStatus = 'never-done' | 'overdue' | 'due' | 'not-due'

/** A job plus everything worked out about it right now. */
export interface ItemView {
  item: MaintenanceItem
  status: ItemStatus
  /** Null until the job has been done at least once (FR-004a). */
  lastCompletedOn: CalendarDate | null
  /** Null when never done — the app never invents a due date. */
  nextDueOn: CalendarDate | null
  /** Days past due; 0 or negative when not overdue. Used for ordering. */
  daysOverdue: number
}

/**
 * Statuses that need the user's attention, presented ahead of the rest.
 *
 * `due` is included. spec.md FR-004 says "items needing attention" without
 * enumerating them, which left `due` unplaced — a job due today is something
 * you should do today, so it belongs with the group that needs attention.
 */
export const ATTENTION_STATUSES: readonly ItemStatus[] = ['overdue', 'due', 'never-done']

export function needsAttention(status: ItemStatus): boolean {
  return ATTENTION_STATUSES.includes(status)
}
