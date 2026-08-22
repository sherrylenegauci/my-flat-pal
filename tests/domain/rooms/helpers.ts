import type { PlacedObject, Room } from '../../../src/domain/rooms/types'

/**
 * Factories for the room model, in the spirit of `tests/domain/helpers.ts`.
 *
 * Everything has a sensible default so that a test names only the numbers it
 * is actually about. Millimetres throughout, as integers (see
 * `src/domain/rooms/types.ts` for why).
 *
 * The default room is 4.0 m x 3.0 m x 2.4 m and the default object is a
 * 2.0 m x 0.9 m x 0.8 m sofa — both comfortably within a real flat, so a
 * failure reads as a fact about a room rather than about arithmetic.
 */

export function aRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: 'rm_test',
    name: 'Living room',
    widthMm: 4000,
    depthMm: 3000,
    heightMm: 2400,
    objects: [],
    ...overrides,
  }
}

export function anObject(overrides: Partial<PlacedObject> = {}): PlacedObject {
  return {
    id: 'obj_test',
    pieceId: 'sofa',
    name: 'Sofa',
    widthMm: 2000,
    depthMm: 900,
    // Deliberately far below any room height used in these tests. Whether a
    // room refuses an object taller than its ceiling is not recorded anywhere
    // in the spec or the plan, so no test here decides it either way.
    heightMm: 800,
    xMm: 500,
    yMm: 500,
    ...overrides,
  }
}
