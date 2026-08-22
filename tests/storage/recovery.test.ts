import { describe, it, expect, beforeEach } from 'vitest'
import { load, save, isReadOnly, ReadOnlyError } from '../../src/storage/repository'
import { STORAGE_KEY, RECOVERY_KEY_PREFIX, emptyDocument } from '../../src/storage/schema'
import { anItem, aCompletion } from '../domain/helpers'

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

/**
 * T114 — an interval the app cannot compute with.
 *
 * `looksLikeADocument` establishes that `interval` is an object and stops
 * there. Nothing says `count` is a whole number of at least 1, and nothing says
 * `unit` is one of the four the domain understands. The add form refuses both,
 * so the only ways in are a hand-edited document and a future writer — but this
 * is the only copy of the user's data and it is a plain JSON blob in a store
 * anyone can open, so "nobody would do that" is not a guarantee.
 *
 * ## Why this is rejection rather than a display rule
 *
 * T114 names two acceptable answers — the repository rejects the document, or
 * the spec says what a nonsense interval reads as — and requires exactly one.
 * Rejection is the one chosen, recorded here because the file is where someone
 * will meet the decision.
 *
 * The task line frames the cost as a display bug: `formatInterval` keys on
 * `count === 1`, and `"1" === 1` is false, so `{ count: "1", unit: "year" }`
 * renders "Every 1 years". That undersells it. `addInterval` **throws** on a
 * count that is not an integer >= 1, and its `switch` on `unit` has no
 * `default`, so an unrecognised unit returns `undefined` and the date formatter
 * then throws `Not a calendar date: undefined`. A bad interval does not
 * misprint a line; it takes the app down on load, and the user has no way to
 * get back in because the document that crashes it is the one loaded at start.
 *
 * So the contract is the existing one for a document of the wrong shape: the
 * load is `corrupt`, the original is parked under a recovery key rather than
 * destroyed, and the app is handed an empty schedule it can actually run.
 */
describe('an interval the domain cannot compute with', () => {
  /**
   * A document that is valid in every respect except the interval, so a
   * rejection can only be about the interval. `anItem()` supplies the rest.
   */
  function storeItemWithInterval(interval: unknown): string {
    const item = { ...anItem(), interval }
    const raw = JSON.stringify({ schemaVersion: 1, revision: 1, items: [item] })
    localStorage.setItem(STORAGE_KEY, raw)
    return raw
  }

  const rejected: ReadonlyArray<{ why: string; interval: unknown }> = [
    // Looks right in a text editor and is not. This is the one T114 found:
    // `"1" === 1` is false, so it would have rendered "Every 1 years".
    { why: 'count is a string that looks like a number', interval: { count: '1', unit: 'year' } },
    { why: 'count is zero', interval: { count: 0, unit: 'day' } },
    { why: 'count is negative', interval: { count: -1, unit: 'week' } },
    { why: 'count is fractional', interval: { count: 1.5, unit: 'month' } },
    { why: 'count is null', interval: { count: null, unit: 'year' } },
    { why: 'count is missing', interval: { unit: 'year' } },
    // Not one of the four units, so `addInterval`'s switch falls off the end
    // and returns undefined.
    { why: 'unit is not one the domain knows', interval: { count: 2, unit: 'fortnight' } },
    { why: 'unit is missing', interval: { count: 2 } },
  ]

  for (const { why, interval } of rejected) {
    describe(why, () => {
      it('is corrupt rather than loaded', () => {
        storeItemWithInterval(interval)

        expect(
          load().kind,
          `interval ${JSON.stringify(interval)} reached the app. addInterval throws on ` +
            'a count that is not a whole number >= 1, and returns undefined for a unit ' +
            'it does not recognise — either way the app fails on load rather than ' +
            'showing a slightly wrong line.',
        ).toBe('corrupt')
      })

      it('leaves the app a usable empty schedule', () => {
        storeItemWithInterval(interval)
        expect(load().document.items).toEqual([])
      })

      it('parks the original rather than destroying it', () => {
        const raw = storeItemWithInterval(interval)

        const outcome = load()

        if (outcome.kind !== 'corrupt') throw new Error('expected corrupt')
        expect(outcome.recoveryKey).toMatch(RECOVERY_KEY_PREFIX)
        // Byte for byte. There is no export path, so a document the app cannot
        // read is still the only copy of whatever history it holds.
        expect(localStorage.getItem(outcome.recoveryKey!)).toBe(raw)
      })
    })
  }

  it('rejects the whole document when only one item among several is bad', () => {
    // The check has to hold for every item, not the first one. A document is
    // loaded whole and saved whole, so one uncomputable job is enough to take
    // the list down.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        revision: 1,
        items: [
          anItem({ id: 'itm_ok' }),
          { ...anItem({ id: 'itm_bad' }), interval: { count: 0, unit: 'day' } },
        ],
      }),
    )

    expect(load().kind).toBe('corrupt')
  })
})

/**
 * The other half of T114, and the half that stops the rejection above from
 * being satisfied by refusing everything. Each of these is a document a user
 * can produce through the add form today.
 */
describe('an interval the domain can compute with', () => {
  const units = ['day', 'week', 'month', 'year'] as const

  for (const unit of units) {
    it(`loads a schedule measured in ${unit}s`, () => {
      const item = anItem({ id: `itm_${unit}`, interval: { count: 3, unit } })
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ schemaVersion: 1, revision: 1, items: [item] }),
      )

      const outcome = load()

      expect(outcome.kind).toBe('loaded')
      expect(outcome.document.items).toEqual([item])
      expect(
        Object.keys(localStorage).filter((k) => k.startsWith(RECOVERY_KEY_PREFIX)),
        'a valid document was parked as if it were corrupt',
      ).toHaveLength(0)
    })
  }

  it('loads a job with a completion history intact', () => {
    // A count above 1 and a real history, so "rejects everything" cannot pass
    // this either.
    const item = anItem({
      interval: { count: 6, unit: 'month' },
      completions: [aCompletion('2026-06-14')],
    })
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, revision: 1, items: [item] }),
    )

    const outcome = load()

    expect(outcome.kind).toBe('loaded')
    expect(outcome.document.items).toEqual([item])
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
