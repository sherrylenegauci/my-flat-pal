import type { CalendarDate, Interval } from './types'

/**
 * Calendar arithmetic on `YYYY-MM-DD` strings.
 *
 * Everything here works on the date parts, and where it does use `Date` it uses
 * the UTC constructors, which have no daylight saving. That is deliberate:
 * adding N × 86_400_000 ms to a local-midnight `Date` lands on the wrong
 * calendar day twice a year, and an earlier version of the plan claimed this
 * design was "clear of timezone arithmetic entirely" while using native `Date`.
 * It wasn't. This is where that claim is made true.
 */

interface DateParts {
  year: number
  month: number // 1-12
  day: number // 1-31
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function parseDate(date: CalendarDate): DateParts {
  const match = DATE_PATTERN.exec(date)
  if (!match) throw new Error(`Not a calendar date: ${date}`)

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  if (month < 1 || month > 12) throw new Error(`Not a calendar date: ${date}`)
  if (day < 1 || day > daysInMonth(year, month)) throw new Error(`Not a calendar date: ${date}`)

  return { year, month, day }
}

export function formatDate({ year, month, day }: DateParts): CalendarDate {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`
}

/** Day 0 of the next month is the last day of this one. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * Whole days between two calendar dates. Uses UTC, so no DST boundary can
 * shorten or lengthen a day out from under it.
 */
export function daysBetween(from: CalendarDate, to: CalendarDate): number {
  const a = parseDate(from)
  const b = parseDate(to)
  const msPerDay = 86_400_000
  const fromUtc = Date.UTC(a.year, a.month - 1, a.day)
  const toUtc = Date.UTC(b.year, b.month - 1, b.day)
  return Math.round((toUtc - fromUtc) / msPerDay)
}

function addDays(parts: DateParts, days: number): DateParts {
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  utc.setUTCDate(utc.getUTCDate() + days)
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() }
}

function addMonths(parts: DateParts, months: number): DateParts {
  const zeroBased = parts.year * 12 + (parts.month - 1) + months
  const year = Math.floor(zeroBased / 12)
  const month = (zeroBased % 12) + 1

  // Clamp rather than overflow: 31 March + 1 month is 30 April, not 1 May.
  // Overflowing would drift a job forward every short month.
  const day = Math.min(parts.day, daysInMonth(year, month))

  return { year, month, day }
}

export function addInterval(date: CalendarDate, interval: Interval): CalendarDate {
  if (!Number.isInteger(interval.count) || interval.count < 1) {
    throw new Error(`Interval count must be a whole number of at least 1, got ${interval.count}`)
  }

  const parts = parseDate(date)

  switch (interval.unit) {
    case 'day':
      return formatDate(addDays(parts, interval.count))
    case 'week':
      return formatDate(addDays(parts, interval.count * 7))
    case 'month':
      return formatDate(addMonths(parts, interval.count))
    case 'year':
      return formatDate(addMonths(parts, interval.count * 12))
  }
}
