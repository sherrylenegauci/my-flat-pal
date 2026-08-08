import { useEffect, useState } from 'react'
import type { CalendarDate } from '../domain/types'

/**
 * Today's date, kept current while the app is open (FR-005).
 *
 * The domain layer deliberately never reads the clock, which makes the
 * scheduling rules testable by passing a date in. Something still has to
 * *supply* that date and notice when it changes — and that is the piece that
 * was missing entirely. `plan.md` said status is "recomputed on every render",
 * but a phone sitting in a pocket does not render, so a job due today would
 * still have read "due" the next morning until something happened to wake the
 * app up.
 *
 * Two triggers, because neither is sufficient alone:
 *
 *   - **A timer to the next local midnight.** Handles the app being open and
 *     visible as the day turns.
 *   - **`visibilitychange`.** Browsers throttle or suspend timers in
 *     backgrounded tabs, and an installed app spends most of its life
 *     backgrounded, so the timer cannot be relied on to have fired. Re-checking
 *     when the app comes back to the foreground covers that.
 */

/**
 * Today as `YYYY-MM-DD` in the device's local timezone.
 *
 * Deliberately not `toISOString().slice(0, 10)`, which converts to UTC first
 * and therefore reports the wrong calendar day for anyone not on UTC — the
 * previous day for the Americas, the next day for Asia-Pacific, every evening.
 */
export function todayLocal(now: Date = new Date()): CalendarDate {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Milliseconds until the next local midnight, plus a second of slack. */
function msUntilNextMidnight(now: Date = new Date()): number {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1, 0)
  return midnight.getTime() - now.getTime()
}

export function useCurrentDate(): CalendarDate {
  const [today, setToday] = useState<CalendarDate>(() => todayLocal())

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined

    // `setToday` with the same string is a no-op in React, so an unchanged day
    // costs nothing and does not re-render.
    const check = () => setToday(todayLocal())

    const scheduleNextMidnight = () => {
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(() => {
        check()
        scheduleNextMidnight()
      }, msUntilNextMidnight())
    }

    const onVisibilityChange = () => {
      check()
      // Reschedule too: while backgrounded the timer may have been throttled
      // or dropped, so its next firing time can no longer be trusted.
      scheduleNextMidnight()
    }

    scheduleNextMidnight()
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', onVisibilityChange)

    return () => {
      if (timer !== undefined) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', onVisibilityChange)
    }
  }, [])

  return today
}
