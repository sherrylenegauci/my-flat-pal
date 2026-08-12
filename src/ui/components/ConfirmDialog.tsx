import { useEffect, useId, useRef } from 'react'
import type { KeyboardEvent } from 'react'

/**
 * Asking before doing something that cannot be undone (T067).
 *
 * **Deliberately general, and it has a second customer already.** T103 — the
 * release blocker that lets a mistaken completion be removed from a job's
 * history — reuses this, so the caller supplies the question, the consequence
 * and the confirm label. Nothing about deleting a *job* is in here. That is the
 * second concrete use case Principle I asks for before an abstraction appears,
 * and it existed before this file did.
 *
 * **Why not `<dialog>`.** The platform element would give focus trapping,
 * Escape, the top layer and focus restoration for free, and in a browser it
 * would be the right answer. jsdom 25 does not implement `showModal` at all —
 * probed, not assumed — so with a native dialog the behaviour tier could not
 * exercise any of that, and the constitution forbids writing a check that
 * cannot check. What is hand-rolled below is therefore also what is tested:
 * roughly forty lines, all of it observable in `tests/ui/confirm-dialog.test.tsx`.
 *
 * **What this file cannot establish.** Whether a VoiceOver user is told a
 * dialog has opened, whether the rotor is confined to it, and whether the
 * question is announced before the buttons. `role="dialog"`, `aria-modal` and
 * `inert` are instructions to a screen reader, not evidence about one, and
 * constitution v1.4.0 makes VoiceOver on a real iPhone the check that
 * discharges the accessibility gate. This needs driving on the device.
 */
export interface ConfirmDialogProps {
  /** The question, as a heading. e.g. `Delete “Boiler service”?` */
  question: string
  /** What confirming costs, in plain words. Shown as the dialog's description. */
  consequence: string
  /**
   * The destructive button's label. e.g. `Delete permanently`.
   *
   * Deliberately not the same words as the control that opened the dialog. The
   * opener is `Delete job`; if the confirm button said that too, "the button
   * named Delete job" would match two elements while the dialog is open, and
   * neither a test nor a screen-reader user could tell which one they had.
   */
  confirmLabel: string
  /** The safe button's label. Defaults to `Cancel`. */
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * What Tab may land on inside the dialog.
 *
 * `tabindex="-1"` is excluded because the dialog itself carries it: it is a
 * focus *target* on open, not a stop in the cycle. Mirrors
 * `INTERACTIVE_SELECTOR` in `e2e/support/probe.ts`, which asks the same
 * question of the whole page.
 */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export function ConfirmDialog({
  question,
  consequence,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ids = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  /**
   * Open the dialog, and put everything back on the way out.
   *
   * Three things happen here and the order of the two in the cleanup matters,
   * which is why they share one effect rather than sitting in two:
   *
   *   1. **The rest of the page is made `inert`**, by walking up from the dialog
   *      and marking every sibling on the way. `aria-modal` alone is an
   *      instruction a screen reader may or may not honour; `inert` actually
   *      removes the content from the focus order and the accessibility tree, so
   *      a VoiceOver user swiping forward cannot walk out of the dialog into the
   *      page behind it. It is also what stops the browser-tier sweeps measuring
   *      controls nobody can reach.
   *   2. **Focus moves into the dialog**, so a keyboard or screen-reader user is
   *      taken to the question rather than left to discover it.
   *   3. **On the way out, `inert` comes off first and focus goes back second.**
   *      The other order silently fails in a real browser: `focus()` on an
   *      element still inside an inert subtree does nothing, and the user lands
   *      on `<body>` — the top of the document, with nothing to say why.
   *
   * **The restore fires only when focus has been lost**, and the condition is
   * written that way because of when this actually runs. A `useEffect` cleanup
   * is passive: React has already detached the dialog by the time it executes,
   * so focus is on `<body>` and asking "does the dialog still contain the
   * focused element" — the first thing tried here — answers no in every case,
   * including the ones that need the restore. What is left on `<body>` is the
   * real signal: focus fell off the end when the dialog went, and the control
   * that opened it is where it belongs. If the caller has already placed focus
   * somewhere — which is what happens after a confirmed deletion, where the
   * opener disappears with the view it lived in — that placement stands.
   */
  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null) return

    const opener = document.activeElement

    const inerted: HTMLElement[] = []
    let node: HTMLElement = dialog
    while (node.parentElement !== null) {
      const parent: HTMLElement = node.parentElement
      for (const sibling of Array.from(parent.children)) {
        if (sibling !== node && sibling instanceof HTMLElement && !sibling.hasAttribute('inert')) {
          sibling.setAttribute('inert', '')
          inerted.push(sibling)
        }
      }
      node = parent
    }

    dialog.focus()

    return () => {
      for (const element of inerted) element.removeAttribute('inert')

      const active = document.activeElement
      const focusWasLost = active === null || active === document.body
      if (focusWasLost && opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [])

  /**
   * Escape closes; Tab cycles and never leaves.
   *
   * The wrap is computed from whatever is focusable at the moment the key is
   * pressed rather than from a list captured on open, so a dialog whose contents
   * change cannot trap the user against a control that has gone.
   */
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
      return
    }

    if (event.key !== 'Tab') return

    const dialog = dialogRef.current
    if (dialog === null) return

    const stops = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (stops.length === 0) return

    const first = stops[0]
    const last = stops[stops.length - 1]
    const at = stops.indexOf(document.activeElement as HTMLElement)

    // Focus is on the dialog itself (the state it opens in) rather than on one
    // of the stops, so the browser has no next element inside to move to.
    if (at === -1) {
      event.preventDefault()
      ;(event.shiftKey ? last : first)?.focus()
      return
    }

    if (event.shiftKey && at === 0) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && at === stops.length - 1) {
      event.preventDefault()
      first?.focus()
    }
  }

  return (
    <div className="scrim">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-question`}
        aria-describedby={`${ids}-consequence`}
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={handleKeyDown}
      >
        <h2 className="dialog__question" id={`${ids}-question`}>
          {question}
        </h2>
        <p className="dialog__consequence" id={`${ids}-consequence`}>
          {consequence}
        </p>
        <div className="dialog__actions">
          {/* Cancel first, and it is not a style choice: this dialog only ever
              guards something irreversible, so the safe way out is the one Tab
              reaches first and the one a thumb finds nearest the edge. */}
          <button type="button" className="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="button button--danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
