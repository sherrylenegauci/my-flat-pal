import { useCallback, useEffect, useState } from 'react'
import { load, save, subscribeToExternalChanges, StaleWriteError } from '../storage/repository'
import { emptyDocument } from '../storage/schema'
import type { LoadOutcome, StoredDocument } from '../storage/schema'
import { orderForDisplay } from '../domain/schedule'
import { newItemId, newCompletionId } from '../domain/ids'
import type { Interval, ItemView, MaintenanceItem } from '../domain/types'
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

  return {
    views: orderForDisplay(doc.items, today),
    today,
    readOnly,
    loadKind,
    addItem,
  }
}
