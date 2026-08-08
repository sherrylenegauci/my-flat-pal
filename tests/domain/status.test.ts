import { describe, it, expect } from 'vitest'
import { classifyStatus, toView } from '../../src/domain/schedule'
import { anItem, aCompletion, yearly } from './helpers'

/**
 * T016 — the four statuses.
 *
 * `classifyStatus` takes today's date as a parameter rather than reading the
 * clock. That is what makes the midnight-rollover case (FR-005) an ordinary
 * test instead of one needing fake timers — and it is why the domain layer is
 * kept free of browser APIs.
 */
describe('classifyStatus', () => {
  const today = '2026-08-08'

  it('is never-done when there are no completions', () => {
    expect(classifyStatus(anItem({ completions: [] }), today)).toBe('never-done')
  })

  it('is overdue when the due date has passed', () => {
    const item = anItem({ interval: yearly, completions: [aCompletion('2025-01-01')] })
    expect(classifyStatus(item, today)).toBe('overdue')
  })

  it('is due when the due date is today', () => {
    const item = anItem({ interval: yearly, completions: [aCompletion('2025-08-08')] })
    expect(classifyStatus(item, today)).toBe('due')
  })

  it('is not-due when the due date is in the future', () => {
    const item = anItem({ interval: yearly, completions: [aCompletion('2026-08-01')] })
    expect(classifyStatus(item, today)).toBe('not-due')
  })
})

describe('FR-012 — a long-overdue job is one job, not a pile', () => {
  it('yields exactly one overdue status after three missed years', () => {
    const item = anItem({ interval: yearly, completions: [aCompletion('2023-05-01')] })
    const view = toView(item, '2026-08-08')

    expect(view.status).toBe('overdue')
    // There is no concept of a missed occurrence in the model, so they cannot
    // accumulate — nextDueOn is a single date, not a series.
    expect(view.nextDueOn).toBe('2024-05-01')
  })
})

describe('FR-005 — status re-evaluates when the date changes', () => {
  it('turns from due into overdue as the day rolls over', () => {
    const item = anItem({ interval: yearly, completions: [aCompletion('2025-08-08')] })

    expect(classifyStatus(item, '2026-08-08')).toBe('due')
    expect(classifyStatus(item, '2026-08-09')).toBe('overdue')
  })
})

describe('toView', () => {
  it('reports null dates and zero days overdue for a never-done job', () => {
    const view = toView(anItem({ completions: [] }), '2026-08-08')

    expect(view.status).toBe('never-done')
    expect(view.lastCompletedOn).toBeNull()
    expect(view.nextDueOn).toBeNull()
    expect(view.daysOverdue).toBe(0)
  })

  it('counts days overdue for ordering', () => {
    const item = anItem({ interval: yearly, completions: [aCompletion('2025-08-01')] })
    const view = toView(item, '2026-08-08')

    // Due 2026-08-01, today is 2026-08-08 → seven days late.
    expect(view.daysOverdue).toBe(7)
  })

  it('reports the newest completion as last done', () => {
    const item = anItem({
      completions: [aCompletion('2026-06-14'), aCompletion('2024-03-02')],
    })
    expect(toView(item, '2026-08-08').lastCompletedOn).toBe('2026-06-14')
  })
})
