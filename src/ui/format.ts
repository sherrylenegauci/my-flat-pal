import type { CalendarDate, Interval } from '../domain/types'
import { parseDate } from '../domain/interval'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * "14 June 2027".
 *
 * Formatted from the date parts rather than via `Date`, for the same reason the
 * domain layer works on strings: constructing a Date from a calendar date and
 * formatting it back can shift the day by one, either way, depending on the
 * reader's timezone.
 */
export function formatDisplayDate(date: CalendarDate): string {
  const { year, month, day } = parseDate(date)
  return `${day} ${MONTHS[month - 1]} ${year}`
}

/**
 * "Every year", "Every 3 months".
 *
 * The count is dropped only when it is 1, and that "only" is the whole of the
 * rule. Keying off the unit instead — "the unit is month, so say 'Every month'"
 * — reads correctly on the annual job that prompts the change and quietly
 * misstates every other one, turning a quarterly filter into a monthly one. In
 * an app whose only job is telling you when something is due, that is a wrong
 * answer rather than a typo, so `tests/ui/detail-interval.test.tsx` checks all
 * four units at four counts rather than the case anyone would think of.
 *
 * Every unit pluralises by adding an s, so no lookup table is needed and none is
 * built. If a unit ever arrives that does not, this is where it goes.
 */
export function formatInterval(interval: Interval): string {
  const { count, unit } = interval
  return count === 1 ? `Every ${unit}` : `Every ${count} ${unit}s`
}
