import { useEffect, useRef } from 'react'
import { Mark } from './components/Mark'
import { StorageNotice } from './components/StorageNotice'
import { UndoNotice } from './components/UndoNotice'
import { ScheduleView } from './views/ScheduleView'
import { ItemDetailView } from './views/ItemDetailView'
import { ItemFormView } from './views/ItemFormView'
import { ReadOnlyView } from './views/ReadOnlyView'
import { useNavigation } from './navigation'
import { useSchedule } from './useSchedule'
import type { NewItemInput } from './useSchedule'
import './tokens.css'
import './fonts.css'
import './focus.css'
import './app.css'

/**
 * The app shell.
 *
 * Layout notes that matter once installed:
 *   - `env(safe-area-inset-*)` in app.css keeps content clear of the notch and
 *     the home indicator.
 *   - The back control is drawn here, not borrowed from the browser. An
 *     installed iOS app has no back button and its edge-swipe is unreliable
 *     (verified, T011).
 */
export function App() {
  const nav = useNavigation()
  const schedule = useSchedule()
  const headingRef = useRef<HTMLHeadingElement>(null)

  // Moving focus after a view change keeps a keyboard or screen-reader user
  // oriented. Without it focus falls to <body> and they are silently returned
  // to the top of the document with no idea anything happened.
  useEffect(() => {
    headingRef.current?.focus()
  }, [nav.view.name])

  function handleSave(input: NewItemInput) {
    schedule.addItem(input)
    nav.back()
  }

  function handleSaveEdit(itemId: string, input: NewItemInput) {
    // `lastDone` is deliberately dropped: the edit form does not render that
    // field, so it is always absent here. Saying so where the value is ignored
    // is cheaper than the next reader wondering whether an edit can rewrite a
    // completion. It cannot — see ItemFormView.
    schedule.editItem(itemId, { name: input.name, interval: input.interval })
    nav.back()
  }

  /**
   * Delete, then put focus somewhere.
   *
   * The dialog's own rule is to give focus back to whatever opened it, and here
   * that button goes away with the view it lived in, so focus is placed
   * explicitly — the same treatment `handleUndo` gives a control that removes
   * itself.
   *
   * **What this line is actually worth is not established, and the comment used
   * to claim more.** It said "without this the user lands on `<body>`", which
   * verification disproved: deleting the line leaves all 262 tests green,
   * because `nav.back()` changes the view name and the effect above focuses the
   * heading anyway. What the line covers is the gap *before* that — `back()`
   * goes through `history.back()`, so the view name does not change until
   * `popstate` arrives, and until then the detail view has already gone (its
   * item is no longer in the schedule) with focus sitting on `<body>`. Whether
   * that gap is observable through Testing Library's act-based waiting is not
   * something anyone here has shown either way. Kept, because the failure it
   * guards against is silent and the cost is one line; recorded as T109 rather
   * than left reading as a proven necessity.
   */
  function handleDelete(itemId: string) {
    schedule.deleteItem(itemId)
    headingRef.current?.focus()
    nav.back()
  }

  /**
   * Undo removes its own control, so focus would fall to `<body>` — which
   * silently returns a keyboard or screen-reader user to the top of the
   * document with no indication that anything happened. Same treatment as a
   * view change, for the same reason.
   */
  function handleUndo() {
    schedule.undoLast()
    headingRef.current?.focus()
  }

  /**
   * The offer also withdraws itself when its window runs out, and it can do that
   * while the Undo button holds focus — which drops focus to `<body>` exactly as
   * pressing it once did, except that this time the user did nothing to cause
   * it. Catching it here rather than inside the notice keeps it to one rule:
   * if the offer has gone and focus went nowhere, put it back on the heading.
   */
  const undoId = schedule.undoable?.completion.id ?? null
  useEffect(() => {
    if (undoId !== null) return
    if (document.activeElement === null || document.activeElement === document.body) {
      headingRef.current?.focus()
    }
  }, [undoId])

  // A detail view for a job that is no longer there is not a state to render;
  // falling through to the list is what the user would do next anyway. The same
  // goes for an edit form: deleting a job in another window while this one has
  // its edit form open is exactly how you get here.
  const detailId = nav.view.name === 'detail' ? nav.view.itemId : null
  const detail =
    detailId === null ? undefined : schedule.views.find((view) => view.item.id === detailId)

  const editId = nav.view.name === 'edit' ? nav.view.itemId : null
  const editing =
    editId === null ? undefined : schedule.views.find((view) => view.item.id === editId)

  /**
   * Whether the schedule list is what `<main>` is actually showing.
   *
   * Derived from the same four conditions the render below branches on, rather
   * than from the route name, because the two can disagree: the fall-throughs
   * above mean a `detail` or `edit` route whose job has gone — deleted in
   * another window — renders the list while the route still says otherwise.
   * Asking `nav.view.name === 'schedule'` left the storage warning off a screen
   * that was, to the user, the schedule list.
   *
   * An empty schedule counts. `ScheduleView` draws the empty state itself, and
   * a first run is precisely the launch the warning exists for.
   */
  const showingScheduleList =
    !schedule.readOnly && nav.view.name !== 'new' && editing === undefined && detail === undefined

  return (
    <div className="app">
      <header className="app__header">
        {nav.canGoBack && (
          <button type="button" className="app__back" onClick={nav.back}>
            <span aria-hidden="true">‹</span> Back
          </button>
        )}
        {/* The mark sits *inside* the heading, not beside it.

            Two reasons, and the second is the one that matters. Visually it
            keeps the mark glued to the words at every width, including the
            detail view where Back also shares this row. And in the accessibility
            tree it changes nothing at all: the mark is `aria-hidden`, so the
            heading's accessible name is computed from its text alone and is
            still exactly "FlatPal". A sibling would have been equally silent
            but would have had to be positioned against the heading rather than
            with it. */}
        <h1 className="app__title" ref={headingRef} tabIndex={-1}>
          <Mark />
          FlatPal
        </h1>
      </header>

      <div className="app__notices">
        {/* The storage warning belongs where the user lands, and nowhere else.
            It is a first-run message about whether this device has promised to
            keep their records, and it sat above `<main>` on every view — at
            375px, roughly the top third of the detail view, both forms and the
            delete confirmation, repeated at someone who is part-way through
            filling one in. Saying it again is not saying it more clearly.

            On the list only, therefore — and on the list as rendered rather
            than as routed, which is why the condition is derived above instead
            of asked of `nav`. A read-only session is excluded because it
            replaces that view entirely with a different message about the same
            records, and puts a "Got it" button on a screen whose whole contract
            is that there is nothing to press (FR-010a).

            It unmounts on the way out and mounts again on the way back, so the
            persistence question is asked again each time. That is deliberate
            rather than tolerated: the answer can change, and on iOS installing
            the app to the home screen is one of the things that earns a grant,
            so a user who was refused on their first visit is not held to that
            answer for the life of the session. Neither engine prompts for it.
            Dismissal is untouched — it is recorded in localStorage, so it
            survives the unmount, the relaunch and this.

            The other three notices in this region are unchanged. Read-only and
            corrupt-data are about the data the app just tried to read, and the
            undo offer must follow the user off the list, because marking a job
            done from the list is what raises it. */}
        {showingScheduleList && <StorageNotice />}
        {schedule.readOnly && (
          <div role="alert" className="storage-notice">
            <p>
              This app is showing an older version than the one that saved your data. Nothing can
              be changed until it updates, so your records stay safe.
            </p>
          </div>
        )}
        {schedule.loadKind === 'corrupt' && (
          <div role="alert" className="storage-notice">
            <p>
              Some saved data couldn’t be read, so the schedule is starting empty. The original
              was kept in case it can be recovered.
            </p>
          </div>
        )}
        {schedule.undoable && (
          <UndoNotice undoable={schedule.undoable} onUndo={handleUndo} />
        )}
        {/* An undo press that could not be honoured, said out loud.

            The offer leaves the screen whether the press worked or not, so
            silence here means the user cannot tell a tick-off that was taken
            back from one that is still recorded — they would find out on the
            next reload, if ever. `role="alert"` rather than `status` because
            they asked for something and did not get it, and because focus moves
            to the heading on every press: a polite announcement would queue
            behind the heading's and could be cut off.

            Styled as `.storage-notice` on purpose. That colour pair is already
            walked by `e2e/contrast.spec.ts` against real browser-resolved
            colours, so reusing it inherits a measured result instead of adding
            an unaudited one — the same reasoning recorded on `.undo-notice`. */}
        {schedule.undoRefusedFor !== null && (
          <div role="alert" className="storage-notice">
            <p>
              {schedule.undoRefusedFor} is still recorded. Something else was saved in another
              window, so nothing was taken back.
            </p>
          </div>
        )}
      </div>

      <main className="app__main">
        {/* Read-only comes first, and it replaces the view rather than
            decorating it. Every other branch below draws a control that would
            write, and FR-010a says a control that appears usable but silently
            does nothing must not be shown. */}
        {schedule.readOnly ? (
          <ReadOnlyView />
        ) : nav.view.name === 'new' ? (
          <ItemFormView key="new" today={schedule.today} onSave={handleSave} onCancel={nav.back} />
        ) : editing ? (
          // Keyed by the job, so opening a different one never inherits the
          // previous job's half-typed name from the form's own state.
          <ItemFormView
            key={`edit-${editing.item.id}`}
            today={schedule.today}
            editing={{ name: editing.item.name, interval: editing.item.interval }}
            onSave={(input) => handleSaveEdit(editing.item.id, input)}
            onCancel={nav.back}
          />
        ) : detail ? (
          <ItemDetailView
            view={detail}
            today={schedule.today}
            onRecord={(completedOn) => schedule.markDone(detail.item.id, completedOn)}
            onEdit={() => nav.go({ name: 'edit', itemId: detail.item.id })}
            onDelete={() => handleDelete(detail.item.id)}
            // No `nav.back()` and no focus placement here, unlike deleting:
            // the job survives a corrected history, so the user stays where
            // they are and the view puts focus back on its own History heading.
            onRemoveCompletion={(completionId) =>
              schedule.removeCompletion(detail.item.id, completionId)
            }
          />
        ) : (
          <ScheduleView
            views={schedule.views}
            onAdd={() => nav.go({ name: 'new' })}
            onOpen={(itemId) => nav.go({ name: 'detail', itemId })}
            onMarkDone={(itemId) => schedule.markDone(itemId, schedule.today)}
          />
        )}
      </main>
    </div>
  )
}
