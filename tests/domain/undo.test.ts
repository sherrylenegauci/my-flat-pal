import { describe, it, expect } from 'vitest'
import { completeItem, undoCompletion, classifyStatus, nextDueOn } from '../../src/domain/schedule'
import { anItem, aCompletion, yearly } from './helpers'

/**
 * T018 — ticking off and undoing.
 *
 * The subtle rule: undo removes the most recently *recorded* tick-off, not the
 * one with the latest date. Those differ exactly in the backdating case, which
 * plan.md § Data model calls normal — and getting it wrong means a user who
 * mistypes a backdated entry has the wrong one removed.
 */
describe('completeItem', () => {
  it('appends a completion and reschedules', () => {
    const item = anItem({ interval: yearly, completions: [] })
    const done = completeItem(item, { completedOn: '2026-08-08', recordedAt: '2026-08-08T10:00:00.000Z', id: 'c1' })

    expect(done.completions).toHaveLength(1)
    expect(nextDueOn(done)).toBe('2027-08-08')
  })

  it('does not mutate the original job', () => {
    const item = anItem({ completions: [] })
    completeItem(item, { completedOn: '2026-08-08', recordedAt: '2026-08-08T10:00:00.000Z', id: 'c1' })
    expect(item.completions).toHaveLength(0)
  })

  it('rejects a completion dated in the future', () => {
    // You cannot have already done something you have not done yet.
    const item = anItem()
    expect(() =>
      completeItem(
        item,
        { completedOn: '2027-01-01', recordedAt: '2026-08-08T10:00:00.000Z', id: 'c1' },
        '2026-08-08',
      ),
    ).toThrow()
  })

  it('allows a completion dated before the job was added', () => {
    // A boiler serviced years before you installed the app is exactly the
    // history worth recording.
    const item = anItem({ createdAt: '2026-08-01', completions: [] })
    const done = completeItem(
      item,
      { completedOn: '2020-03-15', recordedAt: '2026-08-08T10:00:00.000Z', id: 'c1' },
      '2026-08-08',
    )
    expect(done.completions).toHaveLength(1)
  })
})

describe('undoCompletion', () => {
  it('removes the most recently recorded tick-off, not the latest-dated one', () => {
    const item = anItem({
      interval: yearly,
      completions: [
        // Newest by date, recorded first.
        aCompletion('2026-06-01', { id: 'older-entry', recordedAt: '2026-06-01T09:00:00.000Z' }),
        // Older by date, but this is the one just typed — and mistyped.
        aCompletion('2020-01-01', { id: 'just-typed', recordedAt: '2026-08-08T10:00:00.000Z' }),
      ],
    })

    const undone = undoCompletion(item)

    expect(undone.completions.map((c) => c.id)).toEqual(['older-entry'])
  })

  it('restores the exact previous due date', () => {
    const before = anItem({ interval: yearly, completions: [aCompletion('2026-06-01')] })
    const dueBefore = nextDueOn(before)

    const after = completeItem(before, {
      completedOn: '2026-08-08',
      recordedAt: '2026-08-08T10:00:00.000Z',
      id: 'oops',
    })
    expect(nextDueOn(after)).not.toBe(dueBefore)

    expect(nextDueOn(undoCompletion(after))).toBe(dueBefore)
  })

  it('returns a job to never-done when its only tick-off is undone', () => {
    const item = anItem({
      interval: yearly,
      completions: [aCompletion('2026-08-08')],
    })

    const undone = undoCompletion(item)

    expect(undone.completions).toHaveLength(0)
    expect(classifyStatus(undone, '2026-08-08')).toBe('never-done')
    expect(nextDueOn(undone)).toBeNull()
  })

  it('is a no-op on a job that has never been done', () => {
    const item = anItem({ completions: [] })
    expect(undoCompletion(item).completions).toHaveLength(0)
  })

  it('does not mutate the original job', () => {
    const item = anItem({ completions: [aCompletion('2026-08-08')] })
    undoCompletion(item)
    expect(item.completions).toHaveLength(1)
  })
})
