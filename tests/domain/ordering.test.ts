import { describe, it, expect } from 'vitest'
import { orderForDisplay } from '../../src/domain/schedule'
import { needsAttention } from '../../src/domain/types'
import { anItem, aCompletion, yearly } from './helpers'

/**
 * T017 — how the list is ordered.
 *
 * This function previously shipped with no unit test at all: the task list
 * claimed it was covered by the status and next-due tests, and none of them
 * asserted ordering. It was tested only indirectly through the UI.
 *
 * It also resolves an open question. spec.md FR-004 says "items needing
 * attention" without saying which statuses those are, so a `due` job could sort
 * anywhere and every test still passed. Decision recorded in
 * `src/domain/types.ts`: attention = overdue, due, never-done. A job due today
 * is something you should do today.
 */
const today = '2026-08-08'

const names = (views: ReturnType<typeof orderForDisplay>) => views.map((v) => v.item.name)

describe('orderForDisplay', () => {
  it('puts everything needing attention ahead of everything else', () => {
    const notDue = anItem({
      id: 'a',
      name: 'not due',
      interval: yearly,
      completions: [aCompletion('2026-08-01')],
    })
    const overdue = anItem({
      id: 'b',
      name: 'overdue',
      interval: yearly,
      completions: [aCompletion('2024-01-01')],
    })
    const neverDone = anItem({ id: 'c', name: 'never done', completions: [] })

    expect(names(orderForDisplay([notDue, overdue, neverDone], today))).toEqual([
      'overdue',
      'never done',
      'not due',
    ])
  })

  it('treats a job due today as needing attention', () => {
    expect(needsAttention('due')).toBe(true)

    const dueToday = anItem({
      id: 'a',
      name: 'due today',
      interval: yearly,
      completions: [aCompletion('2025-08-08')],
    })
    const notDue = anItem({
      id: 'b',
      name: 'not due',
      interval: yearly,
      completions: [aCompletion('2026-08-01')],
    })

    expect(names(orderForDisplay([notDue, dueToday], today))).toEqual(['due today', 'not due'])
  })

  it('orders overdue jobs by how long they have been overdue', () => {
    const slightly = anItem({
      id: 'a',
      name: 'slightly late',
      interval: yearly,
      completions: [aCompletion('2025-08-01')],
    })
    const badly = anItem({
      id: 'b',
      name: 'badly late',
      interval: yearly,
      completions: [aCompletion('2022-01-01')],
    })

    expect(names(orderForDisplay([slightly, badly], today))).toEqual([
      'badly late',
      'slightly late',
    ])
  })

  it('puts overdue ahead of due, and due ahead of never-done', () => {
    const overdue = anItem({
      id: 'a',
      name: 'overdue',
      interval: yearly,
      completions: [aCompletion('2024-01-01')],
    })
    const due = anItem({
      id: 'b',
      name: 'due',
      interval: yearly,
      completions: [aCompletion('2025-08-08')],
    })
    const never = anItem({ id: 'c', name: 'never', completions: [] })

    expect(names(orderForDisplay([never, due, overdue], today))).toEqual([
      'overdue',
      'due',
      'never',
    ])
  })

  it('orders never-done jobs by when they were added', () => {
    // They have no due date, so `createdAt` is the only stable ordering
    // available — and until now nothing used that field at all.
    const later = anItem({ id: 'a', name: 'added later', createdAt: '2026-05-01' })
    const earlier = anItem({ id: 'b', name: 'added earlier', createdAt: '2026-01-01' })

    expect(names(orderForDisplay([later, earlier], today))).toEqual([
      'added earlier',
      'added later',
    ])
  })

  it('orders not-due jobs soonest first', () => {
    const soon = anItem({
      id: 'a',
      name: 'soon',
      interval: yearly,
      completions: [aCompletion('2025-09-01')],
    })
    const later = anItem({
      id: 'b',
      name: 'later',
      interval: yearly,
      completions: [aCompletion('2026-07-01')],
    })

    expect(names(orderForDisplay([later, soon], today))).toEqual(['soon', 'later'])
  })

  it('does not mutate the array it is given', () => {
    const items = [anItem({ id: 'a', name: 'one' }), anItem({ id: 'b', name: 'two' })]
    const before = [...items]
    orderForDisplay(items, today)
    expect(items).toEqual(before)
  })
})
