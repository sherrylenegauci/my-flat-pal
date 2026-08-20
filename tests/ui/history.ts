import { screen, within } from '@testing-library/react'

/**
 * The dates shown in a job's history, in the order they appear on screen.
 *
 * **Why this is not just `li.textContent`, which is what three tests used to
 * do.** Every history row now carries its own Remove control (T103, FR-007a),
 * and that control's accessible name repeats the row's date — so the raw text
 * of a row reads "5 June 2025Remove the completion on 5 June 2025". Comparing
 * that against a list of dates is comparing markup, and it would tie every
 * FR-008 test to the exact wording of a button that has nothing to do with
 * FR-008.
 *
 * So the controls are taken out and the row's own text is what is compared.
 * That is still what a user sees on the row, and the assertions built on it are
 * unchanged: the same dates, in the same order, failing the same way if the
 * view stops sorting or drops an entry. Verified by sabotage rather than
 * asserted — removing the sort from `completionsNewestFirst` turns all three
 * red, which is the point of writing this down.
 *
 * Factored out rather than copied a fourth time: three call sites exist
 * (`item-detail`, `edit`, `undo`), which is what Principle I asks for before
 * something becomes shared.
 */
export function historyDates(): string[] {
  return within(screen.getByRole('list', { name: /history/i }))
    .getAllByRole('listitem')
    .map((row) => {
      const withoutControls = row.cloneNode(true) as HTMLElement
      for (const control of withoutControls.querySelectorAll('button')) control.remove()
      return (withoutControls.textContent ?? '').trim()
    })
}
