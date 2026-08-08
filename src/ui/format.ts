import type { CalendarDate } from '../domain/types'
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
