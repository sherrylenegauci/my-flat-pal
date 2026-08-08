import { describe, it, expect, beforeEach } from 'vitest'
import { load, save, isReadOnly, ReadOnlyError } from '../../src/storage/repository'
import { STORAGE_KEY, RECOVERY_KEY_PREFIX, emptyDocument } from '../../src/storage/schema'

/**
 * T026 — the two ways loading can go wrong.
 *
 * Both matter more than usual here, because there is no export path: whatever
 * is in localStorage is the only copy of the user's history.
 */
beforeEach(() => localStorage.clear())

describe('corrupted data', () => {
  it('preserves the original before starting fresh', () => {
    localStorage.setItem(STORAGE_KEY, '{ this is not valid json')

    const outcome = load()

    expect(outcome.kind).toBe('corrupt')
    // Silently starting fresh is not acceptable. The unparseable string may be
    // the only remaining copy, and unparseable is not the same as
    // unrecoverable.
    const recoveryKeys = Object.keys(localStorage).filter((k) => k.startsWith(RECOVERY_KEY_PREFIX))
    expect(recoveryKeys).toHaveLength(1)
    expect(localStorage.getItem(recoveryKeys[0]!)).toBe('{ this is not valid json')
  })

  it('still gives the app a usable empty schedule', () => {
    localStorage.setItem(STORAGE_KEY, 'nonsense')
    expect(load().document.items).toEqual([])
  })

  it('treats a structurally valid document with the wrong shape as corrupt', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, revision: 1, items: 'nope' }))
    expect(load().kind).toBe('corrupt')
  })

  it('reports where the original was parked', () => {
    localStorage.setItem(STORAGE_KEY, 'nonsense')
    const outcome = load()

    if (outcome.kind !== 'corrupt') throw new Error('expected corrupt')
    expect(outcome.recoveryKey).toMatch(RECOVERY_KEY_PREFIX)
  })
})

describe('a document written by a newer build', () => {
  const newerDocument = JSON.stringify({ schemaVersion: 99, revision: 5, items: [] })

  it('refuses to load it', () => {
    localStorage.setItem(STORAGE_KEY, newerDocument)
    const outcome = load()

    expect(outcome.kind).toBe('too-new')
    if (outcome.kind !== 'too-new') throw new Error('expected too-new')
    expect(outcome.foundVersion).toBe(99)
  })

  it('puts the session into read-only mode', () => {
    localStorage.setItem(STORAGE_KEY, newerDocument)
    load()
    expect(isReadOnly()).toBe(true)
  })

  it('refuses every subsequent write', () => {
    // This is the whole point. An old build reading a new document — a stale
    // service worker serving an old bundle — must fail closed. Parsing half of
    // it and then saving would overwrite the newer document with a downgraded
    // one, which the storage contract calls the single most destructive bug
    // available in this design.
    localStorage.setItem(STORAGE_KEY, newerDocument)
    load()

    expect(() => save(emptyDocument())).toThrow(ReadOnlyError)
  })

  it('leaves the newer document byte-for-byte intact', () => {
    localStorage.setItem(STORAGE_KEY, newerDocument)
    load()
    try {
      save(emptyDocument())
    } catch {
      // expected
    }

    expect(localStorage.getItem(STORAGE_KEY)).toBe(newerDocument)
  })

  it('does not park a newer document under a recovery key', () => {
    // It is not corrupt — it is simply from the future. Copying it would
    // double storage consumption for no benefit.
    localStorage.setItem(STORAGE_KEY, newerDocument)
    load()

    expect(Object.keys(localStorage).filter((k) => k.startsWith(RECOVERY_KEY_PREFIX))).toHaveLength(0)
  })
})
