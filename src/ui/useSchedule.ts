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
   * Scoped to what *this session* recorded, and bounded to a short window
   * measured from when that tick-off was recorded (FR-007).
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
   * The one tick-off this session recorded and has not yet taken back — the
   * only entry undo may ever be offered for (FR-007).
   *
   * **This used to be the opposite marker, and inverting it is T102.** It held
   * the single id the app would *refuse* to offer, set when a job was added with
   * a last-done date and again after an undo. That was enough while the session
   * lasted and wrong across a relaunch: the offer is computed from the stored
   * document and survives one, while a ref does not, so reopening the app lost
   * the refusal and kept the offer. Both rules below came back broken, and both
   * were reproduced by probe — an offer to strip the date off a job created
   * seconds earlier, and an offer naming a job whose tick-off the user had not
   * touched.
   *
   * As a positive marker it fails closed. Losing it means no offer, where losing
   * a refusal meant a wrong one, and there is nothing to keep in step with the
   * document: an id that no longer matches the newest completion simply withholds
   * the offer. The cost is that undo does not survive the app going away, which
   * FR-007 now states outright — the same cost already accepted when the window
   * was set at ten seconds, since locking the phone after a tap loses the offer
   * anyway.
   *
   *   - **FR-007b.** Adding a job with a last-done date raises no offer, because
   *     nothing sets this. Taking one would strip the date and leave the job the
   *     user created a second ago reading "Never done" — not a way back from
   *     anything they did. No rule reading the document could deliver this: an
   *     item created today holding one completion recorded a second ago is what
   *     you get *both* from adding a job with a date and from adding a job and
   *     then ticking it off.
   *   - **FR-007a.** After an undo this is cleared, so whatever becomes the
   *     newest entry is not offered next. Without that, ticking two jobs off
   *     within ten seconds and pressing undo twice walks backwards through
   *     history.
   */
  const recordedThisSession = useRef<string | null>(null)

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

      // FR-007b is satisfied here by *doing nothing*, which is the point of the
      // inversion: the user added a job rather than completing one, so nothing
      // marks this entry undoable and no offer can name it. Undo would otherwise
      // delete the date they typed into the form and leave the job behind,
      // reading "Never done" a second after they created it.
      //
      // The ref is deliberately not cleared either. Adding a job with a date
      // makes that completion the newest, so an offer standing from a tick-off a
      // moment ago is withheld by the check below without help; adding one
      // *without* a date changes nothing about what is newest, and there is no
      // reason a way back from the previous tap should disappear because the
      // user added something unrelated.
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

      // The one place an entry becomes undoable (FR-007). This covers ticking a
      // job off from the list and recording a past completion from the detail
      // view — both are the user completing something, which is what undo is a
      // way back from.
      recordedThisSession.current = completion.id

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
   * Three things have to hold, and each refuses on its own. The entry must be
   * the newest in the schedule by `recordedAt`, so undo never reaches past
   * something recorded since. It must be the entry *this session* recorded, so a
   * freshly opened app offers nothing whatever the clock says. And it must be
   * inside the undo window, measured from when it was recorded against the clock
   * **now**.
   *
   * The clock is read here, at render, rather than captured when this component
   * mounted. That distinction was the whole of the first fix: mount-relative
   * expiry passes a casual test and still resurrects an expired offer every time
   * the app is reopened.
   *
   * The newest-entry check is what makes the identity check safe to write this
   * way. `undoLast` removes the most recently recorded completion, so offering
   * anything else would delete an entry other than the one named — which is why
   * the offer withdraws itself when another tab records something, rather than
   * standing there doing nothing when pressed.
   */
  const newest = mostRecentlyRecorded(doc.items)
  const undoable =
    newest !== null &&
    newest.completion.id === recordedThisSession.current &&
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
    if (offerId === null || offerRecordedAt === null) return

    // The window is re-checked *here*, at the press, and not only when the app
    // last rendered. Withdrawing the offer on screen depends on a timer firing,
    // and a phone suspends a backgrounded page and throttles its timers — so the
    // button can still be painted from before the suspend when the user comes
    // back to it minutes later. Whether WebKit runs a pending timeout before the
    // first paint after a resume is a real-device question nobody here can
    // answer, and this deletes history irrecoverably, so it must not depend on
    // the answer. Rendering is an optimisation; this is the enforcement.
    if (!isWithinUndoWindow(offerRecordedAt, new Date())) {
      // Not a silent no-op: re-render so the dead offer leaves the screen. A
      // control that visibly does nothing when pressed reads as a fault, which
      // is the same reasoning FR-006a gives for announcing an unmoved schedule.
      setExpiryTick((tick) => tick + 1)
      return
    }

    mutate((items) => {
      const target = mostRecentlyRecorded(items)
      if (target === null || target.completion.id !== offerId) return items
      return items.map((item) => (item.id === target.item.id ? undoCompletion(item) : item))
    })

    // FR-007a. The entry this session recorded has just been taken back, so
    // there is nothing left to offer. Whatever is newest now is earlier history
    // rather than something the user just did, and clearing here is what stops
    // it sliding into the offer that was occupied a moment ago — the
    // walk-backwards through history the requirement forbids.
    recordedThisSession.current = null
  }, [mutate, offerId, offerRecordedAt])

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
