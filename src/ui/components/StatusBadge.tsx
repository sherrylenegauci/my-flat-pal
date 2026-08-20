import type { ItemStatus } from '../../domain/types'

/**
 * Status, said in words.
 *
 * The word is the signal; colour only reinforces it. Roughly one man in twelve
 * has some colour vision deficiency, and the difference between "overdue" and
 * "not due yet" is the whole point of the app — so it cannot rest on a hue.
 */
/**
 * Exported because a second caller has to say the same words.
 *
 * The confirmation before removing a completion tells the user what the job
 * will show as afterwards (T103), and if that sentence and this badge could
 * drift apart the dialog would promise a state the screen never displays. One
 * record of the vocabulary, read by both.
 */
export const STATUS_LABELS: Record<ItemStatus, string> = {
  'never-done': 'Never done',
  overdue: 'Overdue',
  due: 'Due today',
  'not-due': 'Scheduled',
}

export function StatusBadge({ status }: { status: ItemStatus }) {
  return <span className={`badge badge--${status}`}>{STATUS_LABELS[status]}</span>
}
