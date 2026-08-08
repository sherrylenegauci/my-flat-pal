import { describe, it, expect, beforeEach } from 'vitest'
import { load, save, STORAGE_KEY } from '../../src/storage/repository'
import { emptyDocument } from '../../src/storage/schema'
import type { StoredDocument } from '../../src/storage/schema'

/**
 * T024 — the round trip, and every mutation persisting.
 *
 * The "every mutation" part matters: an earlier version of the task list wired
 * persistence for creation only, and the update path did not arrive until a
 * later phase. Ticking a job off would have worked until reload and then
 * silently forgotten it.
 */
function aDocument(overrides: Partial<StoredDocument> = {}): StoredDocument {
  return {
    ...emptyDocument(),
    items: [
      {
        id: 'itm_1',
        name: 'Boiler service',
        interval: { count: 1, unit: 'year' },
        createdAt: '2026-01-01',
        completions: [],
      },
    ],
    ...overrides,
  }
}

beforeEach(() => localStorage.clear())

describe('load', () => {
  it('returns an empty schedule when nothing has been saved', () => {
    const outcome = load()

    // A first run and a wiped storage are indistinguishable — both mean an
    // empty schedule, and neither is an error.
    expect(outcome.kind).toBe('empty')
    expect(outcome.document.items).toEqual([])
  })

  it('reads back what was saved', () => {
    save(aDocument())
    const outcome = load()

    expect(outcome.kind).toBe('loaded')
    expect(outcome.document.items).toHaveLength(1)
    expect(outcome.document.items[0]?.name).toBe('Boiler service')
  })

  it('preserves completion history through a round trip', () => {
    const doc = aDocument()
    doc.items[0]!.completions = [
      { id: 'cmp_1', completedOn: '2026-06-14', recordedAt: '2026-06-14T09:00:00.000Z' },
    ]
    save(doc)

    expect(load().document.items[0]?.completions).toHaveLength(1)
    expect(load().document.items[0]?.completions[0]?.completedOn).toBe('2026-06-14')
  })
})

describe('save', () => {
  it('writes under the documented key', () => {
    save(aDocument())
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
  })

  it('stamps the current schema version', () => {
    save(aDocument())
    expect(load().document.schemaVersion).toBe(1)
  })

  it('replaces the whole document rather than merging', () => {
    save(aDocument())
    save({ ...emptyDocument(), revision: 1, items: [] })

    expect(load().document.items).toEqual([])
  })
})

describe('every mutation persists', () => {
  it('survives adding, editing, completing, and deleting', () => {
    // Add
    let doc = aDocument()
    save(doc)
    expect(load().document.items).toHaveLength(1)

    // Edit
    doc = load().document
    doc.items[0]!.name = 'Boiler service (annual)'
    save(doc)
    expect(load().document.items[0]?.name).toBe('Boiler service (annual)')

    // Complete
    doc = load().document
    doc.items[0]!.completions.push({
      id: 'cmp_x',
      completedOn: '2026-08-08',
      recordedAt: '2026-08-08T10:00:00.000Z',
    })
    save(doc)
    expect(load().document.items[0]?.completions).toHaveLength(1)

    // Undo
    doc = load().document
    doc.items[0]!.completions = []
    save(doc)
    expect(load().document.items[0]?.completions).toHaveLength(0)

    // Delete
    doc = load().document
    doc.items = []
    save(doc)
    expect(load().document.items).toHaveLength(0)
  })
})
