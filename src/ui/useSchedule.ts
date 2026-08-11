import { useCallback, useEffect, useState } from 'react'
import { load, save, subscribeToExternalChanges, StaleWriteError } from '../storage/repository'
import { emptyDocument } from '../storage/schema'
import type { LoadOutcome, StoredDocument } from '../storage/schema'
import {
  completeItem as recordCompletion,
  mostRecentlyRecorded,
  orderForDisplay,
  undoCompletion,
} from '../domain/schedule'
import type { RecordedCompletion } from '../domain/schedule'
import { newItemId, newCompletionId } from '../domain/ids'
import type { CalendarDate, Interval, ItemView, MaintenanceItem } from '../domain/types'
import { useCurrentDate } from './useCurrentDate'

/**
 * The application state model.
 *
 * A compliance review flagged that persistence was specified in detail while
 * the *state* model was specified nowhere, which Technology Constraints
 * requires before implementation. This is it, and it is deliberately small:
 * one hook owning one document, no store, no context, no library.
 *
 * The interesting part is `mutate`. Saving can be refused if another
 * same-origin context wrote since we loaded — the compare-and-swap that stops
 * one tab destroying another's work. Rather than surfacing that as an error the
 * user did nothing to cause, we reload and re-apply the change against fresh
 * state, which is exactly the recovery the storage contract prescribes.
 */
export interface NewItemInput {
  name: string
  interval: Interval
  lastDone?: string
}

export interface Schedule {
  views: ItemView[]
  today: string
  /** Set when the stored document came from a newer build — no writes allowed. */
  readOnly: boolean
  /** How loading went, so the shell can be honest about corrupt data. */
  loadKind: LoadOutcome['kind']
  addItem: (input: NewItemInput) => void
  markDone: (itemId: string, completedOn: CalendarDate) => void
  /**
   * The tick-off undo would remove, or null when there is nothing to undo.
   *
   * Derived from the stored document rather than remembered, which is what
   * makes undo outlive the app being closed (FR-007).
   */
  undoable: RecordedCompletion | null
  undoLast: () => void
}

export function useSchedule(): Schedule {
  const today = useCurrentDate()
  const [doc, setDoc] = useState<StoredDocument>(emptyDocument)
  const [loadKind, setLoadKind] = useState<LoadOutcome['kind']>('empty')
  const [readOnly, setReadOnly] = useState(false)

  const reload = useCallback(() => {
    const outcome = load()
    setDoc(outcome.document)
    setLoadKind(outcome.kind)
    setReadOnly(outcome.kind === 'too-new')
    return outcome.document
  }, [])

  useEffect(() => {
    reload()
    // Another context writing is not an error — it is news. Reloading keeps
    // this one from sitting on stale state and then failing its next save.
    return subscribeToExternalChanges(reload)
  }, [reload])

  /**
   * Apply a change and persist it.
   *
   * **The save happens here, not inside a `setDoc` updater.** That is not a
   * style preference — it is the fix for a real bug. React requires state
   * updaters to be pure, and StrictMode invokes them twice in development to
   * prove it. With `save()` inside the updater, the second invocation ran
   * against stale state, hit the compare-and-swap, fell into the stale-write
   * recovery, and re-applied a change that had already landed — creating a
   * duplicate job with a duplicate id. The screen showed one; storage held two.
   *
   * Reading from storage rather than from React state also closes the window
   * where the two disagree: storage owns `revision`, so the compare-and-swap is
   * checked against the thing that actually holds it.
   */
  const mutate = useCallback(
    (change: (items: MaintenanceItem[]) => MaintenanceItem[]) => {
      const current = load().document

      try {
        setDoc(save({ ...current, items: change(current.items) }))
      } catch (error) {
        if (error instanceof StaleWriteError) {
          // A genuine race: another context wrote between our read and our
          // write. Re-apply on top of theirs rather than clobbering it. Safe
          // now, because `current` was read fresh — this path can only be
          // reached when someone else really did write in between.
          const fresh = load().document
          setDoc(save({ ...fresh, items: change(fresh.items) }))
          return
        }
        throw error
      }
    },
    [],
  )

  const addItem = useCallback(
    ({ name, interval, lastDone }: NewItemInput) => {
      const item: MaintenanceItem = {
        id: newItemId(),
        name: name.trim(),
        interval,
        createdAt: today,
        completions: lastDone
          ? [
              {
                id: newCompletionId(),
                completedOn: lastDone,
                recordedAt: new Date().toISOString(),
              },
            ]
          : [],
      }
      mutate((items) => [...items, item])
    },
    [mutate, today],
  )

  /**
   * Record that a job was done.
   *
   * The id and the timestamp are minted here, *outside* the change function.
   * That function can legitimately run twice — the stale-write recovery
   * re-applies it against freshly read state — and a completion that came out
   * with a different id the second time would make the retry indistinguishable
   * from a second tick-off. Same reasoning as `addItem`.
   */
  const markDone = useCallback(
    (itemId: string, completedOn: CalendarDate) => {
      const completion = {
        id: newCompletionId(),
        completedOn,
        recordedAt: new Date().toISOString(),
      }

      mutate((items) =>
        items.map((item) =>
          item.id === itemId ? recordCompletion(item, completion, today) : item,
        ),
      )
    },
    [mutate, today],
  )

  /**
   * Take back the most recent tick-off, wherever in the schedule it was made.
   *
   * The target is worked out inside the change function, from the items as they
   * are at the moment of writing, so a retry after a concurrent write undoes
   * what is actually there rather than what was on screen a moment ago.
   */
  const undoLast = useCallback(() => {
    mutate((items) => {
      const target = mostRecentlyRecorded(items)
      if (target === null) return items
      return items.map((item) => (item.id === target.item.id ? undoCompletion(item) : item))
    })
  }, [mutate])

  return {
    views: orderForDisplay(doc.items, today),
    today,
    readOnly,
    loadKind,
    addItem,
    markDone,
    undoable: mostRecentlyRecorded(doc.items),
    undoLast,
  }
}
