import type { ItemStatus } from '../../domain/types'

/**
 * Status, said in words.
 *
 * The word is the signal; colour only reinforces it. Roughly one man in twelve
 * has some colour vision deficiency, and the difference between "overdue" and
 * "not due yet" is the whole point of the app — so it cannot rest on a hue.
 */
const LABELS: Record<ItemStatus, string> = {
  'never-done': 'Never done',
  overdue: 'Overdue',
  due: 'Due today',
  'not-due': 'Scheduled',
}

export function StatusBadge({ status }: { status: ItemStatus }) {
  return <span className={`badge badge--${status}`}>{LABELS[status]}</span>
}
