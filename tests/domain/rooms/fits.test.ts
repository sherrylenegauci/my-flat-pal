import { describe, it, expect } from 'vitest'
import { fitsInRoom } from '../../../src/domain/rooms/geometry'
import { aRoom, anObject } from './helpers'

/**
 * T005 — FR-005: the system MUST NOT allow an object positioned outside the
 * room that contains it.
 *
 * This is a negative requirement, and this project has twice shipped negative
 * requirements whose tests could not fail. So the shape of this file is
 * deliberate:
 *
 *   - **All four walls, separately.** A containment check that compares only
 *     the right and far edges — the easy half, `x + width <= widthMm` — passes
 *     a test that only pushes an object off the right-hand side. Each wall gets
 *     its own case so that half a check fails half of them.
 *   - **Flush against a wall fits.** A sofa against the wall is the normal
 *     arrangement, not a violation. Getting this wrong with a strict `<` would
 *     be invisible to a test that only ever places things in mid-air.
 *   - The sabotage T031 names is `fitsInRoom` returning `true` unconditionally.
 *     Every "does not fit" case below goes red under it.
 *
 * Height takes no part in any of this. The plan records that furniture sits on
 * the floor and that containment and collision are comparisons of footprints;
 * whether a room refuses an object taller than its ceiling is not recorded
 * anywhere, so every object here is 800 mm tall in a 2400 mm room and no test
 * decides that question by accident.
 */

const room = aRoom({ widthMm: 4000, depthMm: 3000 })

/** A 2.0 m x 0.9 m sofa, the default from the helper, named here for the arithmetic below. */
const WIDTH_MM = 2000
const DEPTH_MM = 900

const sofaAt = (xMm: number, yMm: number) =>
  anObject({ widthMm: WIDTH_MM, depthMm: DEPTH_MM, xMm, yMm })

describe('an object inside the room', () => {
  it('fits when it is nowhere near a wall', () => {
    expect(fitsInRoom(room, sofaAt(500, 500))).toBe(true)
  })

  it('fits when it fills the room exactly', () => {
    // Flush on all four walls at once. The most demanding "yes".
    const wallToWall = anObject({
      widthMm: room.widthMm,
      depthMm: room.depthMm,
      xMm: 0,
      yMm: 0,
    })

    expect(fitsInRoom(room, wallToWall)).toBe(true)
  })
})

/**
 * Flush against each wall in turn. Real furniture is put against walls, and a
 * check written with `<` instead of `<=` refuses the commonest arrangement in
 * the feature.
 */
describe('an object touching a wall exactly', () => {
  const flush: ReadonlyArray<{ wall: string; xMm: number; yMm: number }> = [
    { wall: 'the left wall', xMm: 0, yMm: 500 },
    { wall: 'the near wall', xMm: 500, yMm: 0 },
    { wall: 'the right wall', xMm: room.widthMm - WIDTH_MM, yMm: 500 },
    { wall: 'the far wall', xMm: 500, yMm: room.depthMm - DEPTH_MM },
  ]

  for (const { wall, xMm, yMm } of flush) {
    it(`fits when it is flush against ${wall}`, () => {
      expect(
        fitsInRoom(room, sofaAt(xMm, yMm)),
        `an object flush against ${wall} was refused. Pushing the sofa against the ` +
          'wall is the arrangement people actually want, not a violation of FR-005.',
      ).toBe(true)
    })
  }
})

/**
 * Crossing each wall in turn, by a single millimetre. One millimetre because a
 * generous overhang can be caught by arithmetic that is wrong at the boundary,
 * and the boundary is where this check lives.
 */
describe('an object crossing a wall', () => {
  const crossings: ReadonlyArray<{ wall: string; xMm: number; yMm: number }> = [
    { wall: 'the left wall', xMm: -1, yMm: 500 },
    { wall: 'the near wall', xMm: 500, yMm: -1 },
    { wall: 'the right wall', xMm: room.widthMm - WIDTH_MM + 1, yMm: 500 },
    { wall: 'the far wall', xMm: 500, yMm: room.depthMm - DEPTH_MM + 1 },
  ]

  for (const { wall, xMm, yMm } of crossings) {
    it(`does not fit when it crosses ${wall}`, () => {
      expect(
        fitsInRoom(room, sofaAt(xMm, yMm)),
        `an object crossing ${wall} was accepted. FR-005 forbids describing an ` +
          'object that is partly outside the room it is in.',
      ).toBe(false)
    })
  }

  it('does not fit when it crosses two walls at once', () => {
    expect(fitsInRoom(room, sofaAt(-1, -1))).toBe(false)
  })

  it('does not fit when it is entirely outside the room', () => {
    expect(fitsInRoom(room, sofaAt(10_000, 10_000))).toBe(false)
  })
})

/**
 * The edge case the spec names: an object bigger than the room. Placed at the
 * near-left corner, which is the most generous position there is — if it does
 * not fit there it fits nowhere.
 */
describe('an object bigger than the room', () => {
  it('does not fit when it is wider than the room', () => {
    const tooWide = anObject({ widthMm: room.widthMm + 1, depthMm: DEPTH_MM, xMm: 0, yMm: 0 })

    expect(
      fitsInRoom(room, tooWide),
      'an object wider than the room was accepted at the corner, so there is no ' +
        'position at which it would be refused',
    ).toBe(false)
  })

  it('does not fit when it is deeper than the room', () => {
    const tooDeep = anObject({ widthMm: WIDTH_MM, depthMm: room.depthMm + 1, xMm: 0, yMm: 0 })

    expect(
      fitsInRoom(room, tooDeep),
      'an object deeper than the room was accepted at the corner, so there is no ' +
        'position at which it would be refused',
    ).toBe(false)
  })

  it('does not fit when it is bigger in both directions', () => {
    const enormous = anObject({
      widthMm: room.widthMm + 1000,
      depthMm: room.depthMm + 1000,
      xMm: 0,
      yMm: 0,
    })

    expect(fitsInRoom(room, enormous)).toBe(false)
  })
})

/**
 * A narrow room and a wide one, so that nothing above passes by accident on a
 * room whose width and depth are interchangeable. A check that compares an
 * object's width against the room's *depth* survives every square-ish case.
 */
describe('rooms whose width and depth are very different', () => {
  const corridor = aRoom({ widthMm: 5000, depthMm: 1000 })

  it('fits an object that suits the corridor', () => {
    expect(fitsInRoom(corridor, anObject({ widthMm: 4000, depthMm: 800, xMm: 0, yMm: 0 }))).toBe(true)
  })

  it('does not fit the same object turned across the corridor', () => {
    expect(
      fitsInRoom(corridor, anObject({ widthMm: 800, depthMm: 4000, xMm: 0, yMm: 0 })),
      'the object is 4 m deep in a room 1 m deep. A check that compares width ' +
        'against width and depth against depth refuses this; one that mixes the two ' +
        'accepts it.',
    ).toBe(false)
  })
})
