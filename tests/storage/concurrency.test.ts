import { describe, it, expect, beforeEach } from 'vitest'
import { load, save, StaleWriteError } from '../../src/storage/repository'
import { emptyDocument } from '../../src/storage/schema'

/**
 * T025 — the concurrency guard.
 *
 * localStorage is shared by every same-origin context. The installed app and a
 * browser tab on the same site can both be open — routine, because you open the
 * site in a browser in order to install it. Each holds the whole document in
 * memory and each save replaces the whole document.
 *
 * Without a guard, a tick-off recorded in one context is destroyed by the next
 * save from the other, and with no export path that loss is total and
 * unrecoverable. These tests pin the compare-and-swap that prevents it.
 */
beforeEach(() => localStorage.clear())

const docWith = (revision: number, name: string) => ({
  ...emptyDocument(),
  revision,
  items: [
    {
      id: 'itm_1',
      name,
      interval: { count: 1, unit: 'year' as const },
      createdAt: '2026-01-01',
      completions: [],
    },
  ],
})

describe('revision', () => {
  it('starts at 1 after the first save', () => {
    save(emptyDocument())
    expect(load().document.revision).toBe(1)
  })

  it('increments on every successful save', () => {
    save(emptyDocument())
    save(load().document)
    save(load().document)

    expect(load().document.revision).toBe(3)
  })
})

describe('a stale write is refused, not applied', () => {
  it('rejects a save whose revision no longer matches what is stored', () => {
    // Context A loads.
    save(docWith(0, 'original'))
    const contextA = load().document

    // Context B loads the same document and saves first.
    const contextB = load().document
    save({ ...contextB, items: [{ ...contextB.items[0]!, name: 'saved by B' }] })

    // Context A now tries to save against the revision it loaded. Without the
    // guard this silently destroys B's work.
    expect(() => save({ ...contextA, items: [{ ...contextA.items[0]!, name: 'saved by A' }] }))
      .toThrow(StaleWriteError)
  })

  it('leaves the stored document untouched when a write is refused', () => {
    save(docWith(0, 'original'))
    const stale = load().document

    save({ ...load().document, items: [{ ...stale.items[0]!, name: 'saved by B' }] })

    try {
      save({ ...stale, items: [{ ...stale.items[0]!, name: 'saved by A' }] })
    } catch {
      // expected
    }

    expect(load().document.items[0]?.name).toBe('saved by B')
  })

  it('succeeds once the caller reloads and re-applies against fresh state', () => {
    save(docWith(0, 'original'))
    const stale = load().document

    save({ ...load().document, items: [{ ...stale.items[0]!, name: 'saved by B' }] })

    // The documented recovery: reload, re-apply, save.
    const fresh = load().document
    save({ ...fresh, items: [{ ...fresh.items[0]!, name: 'saved by A' }] })

    expect(load().document.items[0]?.name).toBe('saved by A')
  })

  it('does not increment the revision when a write is refused', () => {
    save(docWith(0, 'original'))
    const stale = load().document
    save(load().document)

    const revisionBefore = load().document.revision
    try {
      save(stale)
    } catch {
      // expected
    }

    expect(load().document.revision).toBe(revisionBefore)
  })
})
