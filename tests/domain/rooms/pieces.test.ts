import { describe, it, expect } from 'vitest'
import { pieces } from '../../../src/domain/rooms/geometry'

/**
 * T004 — the ready-made set (FR-003, plan.md § D5).
 *
 * The set is *data*: a table of names and default dimensions, not a component
 * each and not a registry. Adding a piece is adding a row, so nothing here
 * asserts how many rows there are or what order they come in — a test that
 * breaks when someone adds a coffee table is a test that discourages adding a
 * coffee table.
 *
 * What is asserted is what a caller can rely on: there is something to place,
 * every row describes a real-sized box in whole millimetres, ids do not
 * collide (a placed object stores `pieceId`, so a duplicate id makes it
 * ambiguous what it started as), and the three pieces the spec names by hand
 * are actually there.
 *
 * Note the `pieces.length` guard repeated below. Every one of these tests
 * iterates the set, and on an empty set an iteration asserts nothing at all —
 * it would report a pass while checking nothing, which the constitution's
 * testing strategy calls out as worse than no check.
 */
describe('the ready-made pieces', () => {
  it('offers at least one thing to place', () => {
    expect(Array.isArray(pieces)).toBe(true)
    expect(
      pieces.length,
      'the picker has nothing in it, so no object can be placed in any room',
    ).toBeGreaterThan(0)
  })

  it('gives every piece a positive whole number of millimetres in each dimension', () => {
    expect(pieces.length).toBeGreaterThan(0)

    const dimensions = ['widthMm', 'depthMm', 'heightMm'] as const

    for (const piece of pieces) {
      for (const dimension of dimensions) {
        const value = piece[dimension]

        expect(
          Number.isInteger(value),
          `piece "${piece.id}" has a ${dimension} of ${String(value)}. Dimensions are ` +
            'whole millimetres: a placed object copies these numbers, and a fractional ' +
            'one puts the collision check back into floating point, where two objects ' +
            'pushed against each other differ by 0.0000001.',
        ).toBe(true)

        expect(
          value,
          `piece "${piece.id}" has a ${dimension} of ${String(value)}, which is not a size ` +
            'anything can be',
        ).toBeGreaterThan(0)
      }
    }
  })

  it('gives every piece an id and a name to show', () => {
    expect(pieces.length).toBeGreaterThan(0)

    for (const piece of pieces) {
      expect(typeof piece.id).toBe('string')
      expect(piece.id.length, "a piece with no id cannot be recorded as an object's origin").toBeGreaterThan(0)
      expect(typeof piece.name).toBe('string')
      expect(piece.name.trim().length, 'a piece with no name is a blank row in the picker').toBeGreaterThan(0)
    }
  })

  it('does not reuse an id between two pieces', () => {
    expect(pieces.length).toBeGreaterThan(0)

    const ids = pieces.map((piece) => piece.id)
    const duplicated = ids.filter((id, index) => ids.indexOf(id) !== index)

    expect(
      duplicated,
      'a placed object records which piece it started as by id, so a repeated id ' +
        'makes that record ambiguous',
    ).toEqual([])
  })

  /**
   * The spec names these three by hand ("a sofa, a bed, a wardrobe"). Matched
   * on the name a user reads rather than on an id, and on a whole word so that
   * a bedside table cannot stand in for a bed.
   */
  describe('includes the pieces the spec names', () => {
    const namedInTheSpec: ReadonlyArray<{ what: string; pattern: RegExp }> = [
      { what: 'a sofa', pattern: /\bsofa\b/i },
      { what: 'a bed', pattern: /\bbed\b/i },
      { what: 'a wardrobe', pattern: /\bwardrobe\b/i },
    ]

    for (const { what, pattern } of namedInTheSpec) {
      it(what, () => {
        expect(
          pieces.some((piece) => pattern.test(piece.name)),
          `no piece is named ${what}. The set offers: ${pieces.map((p) => p.name).join(', ') || '(nothing)'}`,
        ).toBe(true)
      })
    }
  })
})
