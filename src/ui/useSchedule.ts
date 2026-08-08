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

  const mutate = useCallback(
    (change: (items: MaintenanceItem[]) => MaintenanceItem[]) => {
      setDoc((current) => {
        const attempt = { ...current, items: change(current.items) }
        try {
          return save(attempt)
        } catch (error) {
          if (error instanceof StaleWriteError) {
            // Someone else wrote first. Re-apply on top of theirs rather than
            // clobbering it or bothering the user about it.
            const fresh = load().document
            return save({ ...fresh, items: change(fresh.items) })
          }
          throw error
        }
      })
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
