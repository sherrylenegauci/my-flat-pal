/**
 * STUB — T067 is not implemented yet.
 *
 * This exists so the tests written for T065 fail on their *assertions* rather
 * than on a module that cannot be resolved. A module-not-found error proves
 * nothing about missing behaviour: it fails identically whether the behaviour is
 * absent or merely misspelled, so the "observe it fail for the right reason"
 * half of Principle III would be unverifiable.
 *
 * The props are the real contract and are deliberately general. T103 — removing
 * a single completion from a job's history — reuses this dialog, so the caller
 * supplies the question, the consequence and the confirm label. Nothing about
 * deleting a *job* belongs in here.
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

export function ConfirmDialog(_props: ConfirmDialogProps) {
  return null
}
