import { describe, it, expect } from 'vitest'
import { collidesWith } from '../../../src/domain/rooms/geometry'
import { anObject } from './helpers'
import type { PlacedObject } from '../../../src/domain/rooms/types'

/**
 * T006 — FR-005a: two objects MUST NOT occupy the same space.
 *
 * The second negative requirement, and the same discipline as `fits.test.ts`:
 * the sabotage T031 names is `collidesWith` returning `false` unconditionally,
 * and every "collides" case below goes red under it. The mirror sabotage —
 * returning `true` unconditionally — is caught by the touching, apart and
 * single-axis cases.
 *
 * Two things are worth reading before changing anything here.
 *
 * **Touching is not colliding.** Pushing the sofa up against the bookcase is
 * the arrangement people want. A check written with `<=` instead of `<` calls
 * that a collision and makes the feature refuse the most ordinary thing a user
 * will try.
 *
 * **The answer must not depend on which object is named first.** The user
 * places one object into a room that already holds others; whichever way round
 * the caller happens to pass them, the room is the same room. Every case below
 * is checked both ways round.
 */

/**
 * Asserts that both orderings agree, and returns the answer.
 *
 * Not a convenience: an overlap check that gets one of its four comparisons
 * backwards is asymmetric, and an asymmetric check is one that answers "does
 * the sofa hit the bookcase" differently from "does the bookcase hit the sofa".
 */
function collidesEitherWayRound(a: PlacedObject, b: PlacedObject): boolean {
  const forwards = collidesWith(a, b)
  const backwards = collidesWith(b, a)

  expect(
    backwards,
    `collidesWith answered ${String(forwards)} one way round and ${String(backwards)} the ` +
      'other. Whether two objects overlap cannot depend on the order they are given in.',
  ).toBe(forwards)

  return forwards
}

/** A 1 m x 1 m box at the near-left corner. Everything below is placed relative to it. */
const anchor = anObject({
  id: 'obj_anchor',
  name: 'Bookcase',
  widthMm: 1000,
  depthMm: 1000,
  xMm: 0,
  yMm: 0,
})

const boxAt = (xMm: number, yMm: number, overrides: Partial<PlacedObject> = {}) =>
  anObject({ id: 'obj_other', name: 'Sofa', widthMm: 1000, depthMm: 1000, xMm, yMm, ...overrides })

describe('two objects in the same space', () => {
  it('collide when their footprints partly overlap', () => {
    expect(
      collidesEitherWayRound(anchor, boxAt(500, 500)),
      'two objects overlapping by half a metre in each direction were allowed to ' +
        'share the space. FR-005a exists because a plan that permits that cannot ' +
        'answer whether the furniture fits.',
    ).toBe(true)
  })

  it('collide when they overlap by a single millimetre', () => {
    // The boundary, from the colliding side. One millimetre in from flush.
    expect(collidesEitherWayRound(anchor, boxAt(999, 0))).toBe(true)
    expect(collidesEitherWayRound(anchor, boxAt(0, 999))).toBe(true)
  })

  it('collide when one is entirely inside the other', () => {
    const large = anObject({ id: 'obj_rug', widthMm: 2000, depthMm: 2000, xMm: 0, yMm: 0 })
    const small = anObject({ id: 'obj_stool', widthMm: 400, depthMm: 400, xMm: 500, yMm: 500 })

    expect(
      collidesEitherWayRound(large, small),
      'a small object wholly within a larger one was not reported as a collision. ' +
        'Containment is the case a check written only from the edges inwards misses.',
    ).toBe(true)
  })

  it('collide when they occupy exactly the same footprint', () => {
    const twin = anObject({ id: 'obj_twin', widthMm: 1000, depthMm: 1000, xMm: 0, yMm: 0 })

    expect(collidesEitherWayRound(anchor, twin)).toBe(true)
  })
})

/**
 * Flush on each of the four sides, plus corner to corner. These are legal
 * arrangements, and each is the boundary case for one of the four comparisons
 * an overlap check makes.
 */
describe('two objects touching edge to edge', () => {
  const flush: ReadonlyArray<{ where: string; xMm: number; yMm: number }> = [
    { where: 'to its right', xMm: 1000, yMm: 0 },
    { where: 'to its left', xMm: -1000, yMm: 0 },
    { where: 'beyond it', xMm: 0, yMm: 1000 },
    { where: 'in front of it', xMm: 0, yMm: -1000 },
  ]

  for (const { where, xMm, yMm } of flush) {
    it(`do not collide when one sits ${where}`, () => {
      expect(
        collidesEitherWayRound(anchor, boxAt(xMm, yMm)),
        `two objects pushed up against each other ${where} were called a collision. ` +
          'Furniture against furniture is a legitimate arrangement; refusing it would ' +
          'make the feature refuse the most ordinary thing a user does.',
      ).toBe(false)
    })
  }

  it('do not collide when they meet only at a corner', () => {
    expect(collidesEitherWayRound(anchor, boxAt(1000, 1000))).toBe(false)
  })
})

describe('two objects that are nowhere near each other', () => {
  it('do not collide', () => {
    expect(collidesEitherWayRound(anchor, boxAt(3000, 3000))).toBe(false)
  })
})

/**
 * Overlap in one axis only. This is the case that separates a real overlap
 * check from one that ORs its comparisons instead of ANDing them: two objects
 * along the same wall share every x from 500 to 1000 and are still a metre
 * apart across the room.
 */
describe('two objects that overlap in only one direction', () => {
  it('do not collide when their x ranges overlap but their y ranges do not', () => {
    expect(
      collidesEitherWayRound(anchor, boxAt(500, 2000)),
      'two objects sharing part of the same width but two metres apart across the ' +
        'room were called a collision. Overlap in one axis is not overlap.',
    ).toBe(false)
  })

  it('do not collide when their y ranges overlap but their x ranges do not', () => {
    expect(collidesEitherWayRound(anchor, boxAt(2000, 500))).toBe(false)
  })
})

/**
 * **Height is stored and takes no part** (plan.md § D4).
 *
 * This is a decision, not an omission: collision is a comparison of footprints,
 * which deliberately forbids a shelf above a desk. It is the wrong answer for a
 * handful of real cases and the right one for the common case, and it keeps the
 * check to four readable comparisons.
 *
 * These tests pin it from both sides — a colliding pair stays colliding and a
 * touching pair stays clear, whatever their heights. What that catches is
 * someone consulting `heightMm` at all: the only way to express "the shelf is
 * above the desk" with the data as it stands is to compare the two heights and
 * let a difference excuse the overlap, and that goes red here immediately.
 *
 * What it cannot catch, stated plainly: `PlacedObject` has no vertical
 * coordinate, so every object stands on the floor and spans 0 to its height. A
 * future third-axis check that also added an elevation would still call these
 * pairs colliding, and this file would not notice. There is no way to write
 * that test until the model can express "off the floor".
 */
describe('height', () => {
  const heights: ReadonlyArray<{ what: string; a: number; b: number }> = [
    { what: 'the same height', a: 800, b: 800 },
    { what: 'a low object under a tall one', a: 300, b: 2100 },
    { what: 'a tall object under a low one', a: 2100, b: 300 },
    { what: 'heights an order of magnitude apart', a: 50, b: 2400 },
  ]

  for (const { what, a, b } of heights) {
    it(`does not stop two overlapping footprints colliding — ${what}`, () => {
      expect(
        collidesEitherWayRound(
          anObject({ id: 'obj_desk', widthMm: 1200, depthMm: 600, xMm: 0, yMm: 0, heightMm: a }),
          anObject({ id: 'obj_shelf', widthMm: 1200, depthMm: 300, xMm: 0, yMm: 0, heightMm: b }),
        ),
        'two objects on the same patch of floor stopped colliding once their heights ' +
          'differed. Height is stored and drawn, and takes no part in collision ' +
          '(plan.md D4) — a shelf above a desk is deliberately refused.',
      ).toBe(true)
    })

    it(`does not make two touching footprints collide — ${what}`, () => {
      expect(
        collidesEitherWayRound(
          anObject({ id: 'obj_desk', widthMm: 1000, depthMm: 1000, xMm: 0, yMm: 0, heightMm: a }),
          anObject({ id: 'obj_shelf', widthMm: 1000, depthMm: 1000, xMm: 1000, yMm: 0, heightMm: b }),
        ),
      ).toBe(false)
    })
  }
})
