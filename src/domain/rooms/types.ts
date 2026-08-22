/**
 * The room designer's data model. See 003 plan.md § Data model.
 *
 * Data only — no behaviour, no clock, no storage, no renderer. The arithmetic
 * over these shapes lives in `geometry.ts`, and the 3D view is a view of them
 * rather than the place they are defined (plan.md § D1).
 *
 * **Millimetres, as integers, everywhere.** Every dimension and every
 * coordinate in this file is a whole number of millimetres, and the `Mm`
 * suffix is on each of them so a caller cannot mistake one for centimetres.
 *
 * The reason is not tidiness. In floating-point centimetres, two objects the
 * user has pushed up against each other differ by 0.0000001, and a collision
 * check that compares their edges flickers between "touching" and "overlapping"
 * depending on how the numbers were arrived at. Integers make "exactly
 * touching" an exact answer. The unit shown to the user — centimetres, metres,
 * feet — is a display concern and does not belong here.
 */

/**
 * A ready-made piece of furniture: a name and roughly what size one is.
 *
 * **Never stored** (plan.md § Data model). This is code, so a placed object
 * carries its own copy of the dimensions it started with and is unaffected when
 * a default here changes. It is a table of rows, not a component each and not a
 * registry — Principle I forbids the abstraction before the second use case,
 * and there is one: put a box in a room at a sensible starting size (§ D5).
 */
export interface Piece {
  id: string
  /** Shown in the picker, and the name a newly placed object starts with. */
  name: string
  widthMm: number
  depthMm: number
  heightMm: number
}

/**
 * Something in a room. A box with a name, its own dimensions, and where it sits.
 *
 * Not shared between rooms: a room owns its objects, and deleting the room
 * deletes them (spec.md § Key Entities).
 */
export interface PlacedObject {
  id: string
  /** Which ready-made piece it started as. The piece may since have been resized. */
  pieceId: string
  name: string
  widthMm: number
  depthMm: number
  heightMm: number
  /**
   * Position of the object's near-left corner, measured from the room's
   * near-left corner. `x` runs along the room's width, `y` along its depth.
   *
   * Height takes no part in position: furniture sits on the floor, and
   * collision is a comparison of footprints (§ D4).
   */
  xMm: number
  yMm: number
}

/**
 * A rectangular space in the flat, and the things in it.
 *
 * Rectangular by decision (§ D6): a rectangle is what a tape measure gives you,
 * it is what the collision arithmetic assumes, and it is describable without
 * touching the screen. L-shapes and bay windows are a much larger feature.
 */
export interface Room {
  id: string
  name: string
  widthMm: number
  depthMm: number
  heightMm: number
  objects: PlacedObject[]
}
