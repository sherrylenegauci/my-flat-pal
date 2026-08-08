import { describe, it, expect } from 'vitest'
import { nextDueOn, classifyStatus } from '../../src/domain/schedule'
import { anItem, aCompletion, yearly, daily } from './helpers'

/**
 * T015 — when is a job next due.
 *
 * This is the feature's central rule, and it is the one that was specified
 * wrongly. FR-013 originally required due dates to count from the completion
 * date *and* forbade a job ever being immediately overdue — which cannot both
 * hold, because FR-002 lets you record a last-done date when adding. Split into
 * FR-013 and FR-013a; both halves are pinned here.
 */
describe('nextDueOn', () => {
  it('is null when the job has never been done', () => {
    // FR-004a — the app never invents a service history.
    expect(nextDueOn(anItem({ completions: [] }))).toBeNull()
  })

  it('counts from the completion date, not the date that was missed', () => {
    // FR-013. Due March, done June, annual → next June. Not next March.
    const item = anItem({
      interval: yearly,
      completions: [aCompletion('2026-06-14')],
    })
    expect(nextDueOn(item)).toBe('2027-06-14')
  })

  it('counts from the newest completion when there are several', () => {
    const item = anItem({
      interval: yearly,
      completions: [aCompletion('2026-06-14'), aCompletion('2024-03-02')],
    })
    expect(nextDueOn(item)).toBe('2027-06-14')
  })

  it('ignores a backdated entry older than the newest one', () => {
    // Recording a service you forgot adds to the history without moving the
    // schedule, because `lastCompletedOn` is still the newest date.
    const item = anItem({
      interval: yearly,
      completions: [aCompletion('2026-06-14'), aCompletion('2020-01-01')],
    })
    expect(nextDueOn(item)).toBe('2027-06-14')
  })
})

describe('FR-013a — completing today never leaves a job immediately due', () => {
  it('holds even for the shortest interval', () => {
    const today = '2026-08-08'
    const item = anItem({ interval: daily, completions: [aCompletion(today)] })

    expect(nextDueOn(item)).toBe('2026-08-09')
    expect(classifyStatus(item, today)).toBe('not-due')
  })

  it('holds when the job was wildly overdue before being done', () => {
    const today = '2026-08-08'
    const item = anItem({
      interval: yearly,
      completions: [aCompletion('2020-01-01'), aCompletion(today)],
    })
    expect(classifyStatus(item, today)).toBe('not-due')
  })
})

describe('FR-013a — a backdated completion may legitimately be overdue', () => {
  it('is overdue when the only completion is older than one interval', () => {
    // This is the primary add flow: you move in, you know the boiler was done
    // about two years ago, you say so. Overdue is the truth, and an earlier
    // version of the spec forbade the app from saying it.
    const today = '2026-08-08'
    const item = anItem({
      interval: yearly,
      completions: [aCompletion('2024-05-01')],
    })

    expect(nextDueOn(item)).toBe('2025-05-01')
    expect(classifyStatus(item, today)).toBe('overdue')
  })
})

describe('completing early', () => {
  it('moves the next due date earlier rather than leaving the old one', () => {
    // Done today, though it was not due until next month. The next one counts
    // from today; it must not still be sitting there due next month.
    const today = '2026-08-08'
    const item = anItem({
      interval: { count: 1, unit: 'month' },
      completions: [aCompletion('2026-07-25'), aCompletion(today)],
    })

    expect(nextDueOn(item)).toBe('2026-09-08')
  })
})
