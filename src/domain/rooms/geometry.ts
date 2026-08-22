import type { Piece, PlacedObject, Room } from './types'

/**
 * The arithmetic over a room. See 003 plan.md § D4 and § D5.
 *
 * Pure functions over rectangles: no React, no storage, no clock, no renderer.
 * That is what makes "does the sofa fit" answerable in the domain tier with no
 * browser and no scene, and it is the whole reason the model comes first.
 *
 * Every number here is an integer number of millimetres. See `types.ts` for why
 * that matters more than it looks like it should.
 */

/**
 * The ready-made set: a table of names and roughly what size one is.
 *
 * A table, deliberately — not a component each, not a registry, not a plugin
 * point (§ D5). Adding a piece is adding a row, and that is the whole extension
 * story. Nothing reads this by index or by count, so a row may be added or
 * reordered freely; ids are what a placed object remembers, so an id must not
 * change once it has shipped.
 *
 * The dimensions are ordinary British furniture, rounded to the nearest 50 mm.
 * They are a starting point, not a claim about the user's actual sofa —
 * FR-003a is the answer to "mine is a different size", and a resized piece is
 * how you describe something the set does not cover.
 */
export const pieces: readonly Piece[] = [
  { id: 'sofa', name: 'Sofa', widthMm: 2000, depthMm: 900, heightMm: 850 },
  { id: 'armchair', name: 'Armchair', widthMm: 850, depthMm: 850, heightMm: 800 },
  { id: 'coffee-table', name: 'Coffee table', widthMm: 1100, depthMm: 550, heightMm: 400 },
  { id: 'tv-unit', name: 'TV unit', widthMm: 1200, depthMm: 400, heightMm: 500 },
  { id: 'bookcase', name: 'Bookcase', widthMm: 800, depthMm: 300, heightMm: 1800 },
  { id: 'bed-double', name: 'Double bed', widthMm: 1500, depthMm: 2050, heightMm: 550 },
  { id: 'bed-single', name: 'Single bed', widthMm: 950, depthMm: 2000, heightMm: 550 },
  { id: 'wardrobe', name: 'Wardrobe', widthMm: 1000, depthMm: 600, heightMm: 2000 },
  { id: 'chest-of-drawers', name: 'Chest of drawers', widthMm: 800, depthMm: 450, heightMm: 800 },
  { id: 'bedside-table', name: 'Bedside table', widthMm: 450, depthMm: 400, heightMm: 550 },
  { id: 'desk', name: 'Desk', widthMm: 1200, depthMm: 600, heightMm: 750 },
  { id: 'dining-table', name: 'Dining table', widthMm: 1400, depthMm: 800, heightMm: 750 },
  { id: 'dining-chair', name: 'Dining chair', widthMm: 450, depthMm: 500, heightMm: 900 },
]

/**
 * Is this object wholly within the room's walls? (FR-005)
 *
 * Four comparisons, one per wall. Flush against a wall counts as fitting: a
 * wardrobe with its back to the wall is the normal arrangement, not a
 * violation, so the comparisons are inclusive.
 *
 * Height takes no part, here as in `collidesWith` — an object taller than the
 * room is a different question from one that will not fit on the floor, and
 * nothing in this feature asks it.
 */
export function fitsInRoom(room: Room, object: PlacedObject): boolean {
  return (
    object.xMm >= 0 &&
    object.yMm >= 0 &&
    object.xMm + object.widthMm <= room.widthMm &&
    object.yMm + object.depthMm <= room.depthMm
  )
}

/**
 * Do these two objects overlap on the floor? (FR-005a)
 *
 * **Footprints, not volumes** (§ D4). Two objects collide when their
 * rectangles overlap; height is stored and drawn and takes no part. That
 * deliberately forbids a shelf above a desk — the wrong answer for a handful of
 * real cases, the right one for the common case, and it keeps this to four
 * comparisons anyone can read. If the shelf case ever matters it becomes an
 * interval check on a third axis, and the tests written now still hold.
 *
 * Strictly less-than, so edge-to-edge is not a collision: pushing the bookcase
 * up against the wardrobe is the point of the exercise.
 *
 * An object collides with itself, which is true and unhelpful — a caller
 * testing a move must exclude the object being moved.
 */
export function collidesWith(a: PlacedObject, b: PlacedObject): boolean {
  return (
    a.xMm < b.xMm + b.widthMm &&
    b.xMm < a.xMm + a.widthMm &&
    a.yMm < b.yMm + b.depthMm &&
    b.yMm < a.yMm + a.depthMm
  )
}
