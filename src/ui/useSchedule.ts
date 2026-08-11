import { useCallback, useEffect, useRef, useState } from 'react'
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
import { UNDO_WINDOW_MS, isWithinUndoWindow } from '../domain/undoWindow'
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
   * Derived from the stored document rather than remembered, and bounded to a
   * short window measured from when that tick-off was recorded (FR-007).
   */
  undoable: RecordedCompletion | null
  undoLast: () => void
}

export function useSchedule(): Schedule {
  const today = useCurrentDate()
  const [doc, setDoc] = useState<StoredDocument>(emptyDocument)
  const [loadKind, setLoadKind] = useState<LoadOutcome['kind']>('empty')
  const [readOnly, setReadOnly] = useState(false)

  /**
   * One entry the app must not offer to undo, however recent it is.
   *
   * The window alone cannot express either of the two rules below, because the
   * stored document does not distinguish the cases: an item created today
   * holding one completion recorded a second ago is what you get *both* from
   * adding a job with a last-done date and from adding a job and then ticking it
   * off. Nothing in the document tells them apart, so one id is remembered here
   * instead. It is only ever used to *withhold* an offer, so the worst it can do
   * when it is out of date is decline to undo something.
   *
   *   - **FR-007b.** Adding a job with a last-done date must raise no offer.
   *     Taking one would strip the date and leave the job the user created a
   *     second ago reading "Never done" — not a way back from anything they did.
   *   - **FR-007a.** After an undo, the entry that becomes the newest is not
   *     something the user just did, so it must not become the next offer.
   *     Without this, ticking two jobs off within ten seconds and pressing undo
   *     twice would walk backwards through history, which is the defect.
   */
  const notUndoable = useRef<string | null>(null)

  /**
   * A re-render trigger, and nothing else.
   *
   * The offer has to disappear while the user is looking at it, and a render is
   * the only thing that re-asks whether the window has passed. The answer itself
   * is computed from the clock at render time rather than from a value held
   * here, so a timer that a backgrounded phone throttled or dropped cannot leave
   * a stale offer standing.
   */
  const [, setExpiryTick] = useState(0)

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
      const completion = lastDone
        ? {
            id: newCompletionId(),
            completedOn: lastDone,
            recordedAt: new Date().toISOString(),
          }
        : null

      const item: MaintenanceItem = {
        id: newItemId(),
        name: name.trim(),
        interval,
        createdAt: today,
        completions: completion ? [completion] : [],
      }

      // FR-007b: the user added a job, they did not complete one. This entry is
      // the date they typed into the form, so undo here would delete it and
      // leave the job behind.
      notUndoable.current = completion?.id ?? notUndoable.current
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
   * The tick-off the app is currently offering to take back (FR-007).
   *
   * Still derived from the stored document — the newest entry by `recordedAt` —
   * but now bounded. Two things have to hold: the entry is inside the undo
   * window, measured from when it was recorded against the clock **now**; and it
   * is not the one entry being withheld. Everything else is refused, so a
   * freshly opened app offers nothing to delete.
   *
   * The clock is read here, at render, rather than captured when this component
   * mounted. That distinction is the whole fix: mount-relative expiry passes a
   * casual test and still resurrects an expired offer every time the app is
   * reopened.
   */
  const newest = mostRecentlyRecorded(doc.items)
  const undoable =
    newest !== null &&
    newest.completion.id !== notUndoable.current &&
    isWithinUndoWindow(newest.completion.recordedAt, new Date())
      ? newest
      : null

  /**
   * Withdraw the offer when its window runs out, without the user doing
   * anything.
   *
   * Nothing else would: the app re-renders when the document changes or the day
   * turns, and a phone sitting still does neither. The timer is armed for the
   * remaining part of the window rather than for its full length, so an offer
   * that is already half spent when this runs — after a reopen, say — expires on
   * time rather than late.
   */
  const offerId = undoable?.completion.id ?? null
  const offerRecordedAt = undoable?.completion.recordedAt ?? null

  useEffect(() => {
    if (offerRecordedAt === null) return
    const remaining = Date.parse(offerRecordedAt) + UNDO_WINDOW_MS - Date.now()
    if (remaining <= 0) return

    const timer = setTimeout(() => setExpiryTick((tick) => tick + 1), remaining)
    return () => clearTimeout(timer)
  }, [offerId, offerRecordedAt])

  /**
   * Take back the tick-off the offer named — that one, and only that one.
   *
   * The target is re-checked inside the change function against the items as
   * they are at the moment of writing, so a retry after a concurrent write
   * undoes what is actually there. If what is there is no longer the entry the
   * user was offered, nothing happens at all: another context having recorded
   * something in between is not licence to delete it.
   */
  const undoLast = useCallback(() => {
    if (offerId === null) return

    mutate((items) => {
      const target = mostRecentlyRecorded(items)
      if (target === null || target.completion.id !== offerId) return items
      return items.map((item) => (item.id === target.item.id ? undoCompletion(item) : item))
    })

    // FR-007a. Whatever is newest now is earlier history, not something the user
    // just did, so it must not slide into the offer that was occupied a moment
    // ago. Read back from storage, which `mutate` has already written.
    notUndoable.current = mostRecentlyRecorded(load().document.items)?.completion.id ?? null
  }, [mutate, offerId])

  return {
    views: orderForDisplay(doc.items, today),
    today,
    readOnly,
    loadKind,
    addItem,
    markDone,
    undoable,
    undoLast,
  }
}
