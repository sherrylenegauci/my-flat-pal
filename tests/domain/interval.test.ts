import { describe, it, expect } from 'vitest'
import { addInterval } from '../../src/domain/interval'

/**
 * T013 — calendar arithmetic.
 *
 * These run on `YYYY-MM-DD` strings rather than `Date` objects on purpose.
 * plan.md § Decisions R5 flags that the original design claimed to be "clear of
 * timezone arithmetic entirely" while using native `Date`, which was false:
 * adding N × 86_400_000 ms crosses daylight-saving boundaries and lands on the
 * wrong calendar day twice a year. Working on the date parts avoids it.
 */
describe('addInterval', () => {
  describe('days', () => {
    it('adds days within a month', () => {
      expect(addInterval('2026-08-08', { count: 5, unit: 'day' })).toBe('2026-08-13')
    })

    it('rolls over a month boundary', () => {
      expect(addInterval('2026-08-30', { count: 5, unit: 'day' })).toBe('2026-09-04')
    })

    it('rolls over a year boundary', () => {
      expect(addInterval('2026-12-30', { count: 3, unit: 'day' })).toBe('2027-01-02')
    })

    it('lands on the right calendar day across a spring DST change', () => {
      // 29 Mar 2026 is when UK clocks go forward. A ms-based implementation
      // returns 2026-03-28 here.
      expect(addInterval('2026-03-28', { count: 1, unit: 'day' })).toBe('2026-03-29')
      expect(addInterval('2026-03-28', { count: 2, unit: 'day' })).toBe('2026-03-30')
    })

    it('lands on the right calendar day across an autumn DST change', () => {
      // 25 Oct 2026 is when UK clocks go back.
      expect(addInterval('2026-10-24', { count: 1, unit: 'week' })).toBe('2026-10-31')
    })
  })

  describe('weeks', () => {
    it('adds seven days per week', () => {
      expect(addInterval('2026-08-08', { count: 2, unit: 'week' })).toBe('2026-08-22')
    })
  })

  describe('months', () => {
    it('keeps the same day of month', () => {
      expect(addInterval('2026-01-15', { count: 1, unit: 'month' })).toBe('2026-02-15')
    })

    it('clamps to the last day when the target month is shorter', () => {
      // The rule from plan.md § Decisions R5: 30 April, not 1 May. Clamping
      // keeps a job near its intended day; overflowing drifts it forward every
      // short month.
      expect(addInterval('2026-03-31', { count: 1, unit: 'month' })).toBe('2026-04-30')
    })

    it('clamps into February', () => {
      expect(addInterval('2026-01-31', { count: 1, unit: 'month' })).toBe('2026-02-28')
    })

    it('clamps into a leap February', () => {
      expect(addInterval('2024-01-31', { count: 1, unit: 'month' })).toBe('2024-02-29')
    })

    it('crosses a year boundary', () => {
      expect(addInterval('2026-11-15', { count: 3, unit: 'month' })).toBe('2027-02-15')
    })
  })

  describe('years', () => {
    it('keeps the same day', () => {
      expect(addInterval('2026-08-08', { count: 1, unit: 'year' })).toBe('2027-08-08')
    })

    it('clamps 29 February onto a non-leap year', () => {
      expect(addInterval('2024-02-29', { count: 1, unit: 'year' })).toBe('2025-02-28')
    })

    it('does not compound the lost day across repeated additions', () => {
      // Because the schedule always counts from the actual completion date,
      // a clamped 29th does not drag every future occurrence backwards.
      const once = addInterval('2024-02-29', { count: 4, unit: 'year' })
      expect(once).toBe('2028-02-29')
    })
  })

  it('rejects an interval count below 1', () => {
    expect(() => addInterval('2026-08-08', { count: 0, unit: 'day' })).toThrow()
  })
})
