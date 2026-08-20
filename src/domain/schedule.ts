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
 * Undo is one step across the whole schedule rather than per job, so "which
 * entry would undo remove" has to be answerable from the items alone. That is
 * what this function is for, and it is all it is for.
 *
 * **It does not decide whether undo is offered, and must not be read as though
 * it did.** This comment used to say the derived answer was "what makes it
 * survive the app being closed", with "no remembered session, nothing to expire,
 * and nothing to restore on start-up". All three clauses are now false, and the
 * first was the defect: derived-with-nothing-to-expire-it meant a freshly opened
 * app offered to delete history it had never written — three presses removed
 * completions dated 2020, 2022 and 2024, with no confirmation at any point.
 *
 * FR-007 as amended on 2026-08-11 requires two further conditions that no
 * function reading the document can supply, and `useSchedule` applies both on
 * top of this one. The entry must have been recorded **in the current session**,
 * so a relaunch offers nothing whatever the clock says — storage cannot tell a
 * tick-off from a date typed into the add form, which is why this had to become
 * a remembered session (T102). And it must be inside a ten-second window
 * measured from its own `recordedAt` against the clock now, so there is very
 * much something to expire (T097). Being newest is necessary here and nowhere
 * near sufficient.
 *
 * What it still buys is that the entry the notice *names* and the entry
 * `undoCompletion` *removes* are computed the same way and cannot drift apart.
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
 * **STUB — T103. Not implemented; the tests for it are written and failing.**
 *
 * Remove one entry from a job's history, chosen by id: the correction FR-007a
 * already promises ("correcting an older mistake is done from the item's
 * history, not from the undo offer") and that nothing in the app provides.
 *
 * This body exists so that `tests/domain/remove-completion.test.ts` fails on
 * its assertions rather than on an unresolvable import. An import error proves
 * nothing — it reads the same whether the behaviour is missing or the name is
 * misspelled — so the stub is what makes the red in Red-Green mean something.
 *
 * Two rules the tests already pin, recorded here because they are the ones an
 * obvious implementation gets wrong:
 *
 *   - Chosen by **id**, never by recency. `undoCompletion` above takes the
 *     highest `recordedAt`; the history list is ordered by `completedOn`, and
 *     a backdated entry has a late `recordedAt` with an early `completedOn`.
 *   - An id that is not there returns **this same object**, by reference.
 *     `mutate` in `useSchedule` reads an unchanged array as a decision not to
 *     write; writing anyway bumps `revision` and sends any other open window
 *     into stale-write recovery over a write with nothing in it.
 */
export function removeCompletion(item: MaintenanceItem, _completionId: string): MaintenanceItem {
  return item
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
