import { describe, it, expect, beforeEach } from 'vitest'
import { load, save, resetReadOnlyForTests } from '../../src/storage/repository'
import { STORAGE_KEY, RECOVERY_KEY_PREFIX, SCHEMA_VERSION, emptyDocument } from '../../src/storage/schema'
import type { LoadOutcome, StoredDocument } from '../../src/storage/schema'
import type { Room } from '../../src/domain/rooms/types'
import { anItem } from '../domain/helpers'
import { aRoom, anObject } from '../domain/rooms/helpers'
import v1Fixture from './fixtures/v1.json'

/**
 * T008 — rooms in the stored document.
 *
 * Two things are being pinned here, and the second is the important one.
 *
 * **A room round-trips.** Names, dimensions, objects, positions, order —
 * everything, with nothing dropped. There is no export path, so what is in
 * localStorage is the whole of what the user has. A room that comes back with
 * its objects reordered is a room the user did not arrange.
 *
 * **A document the app cannot make sense of is `corrupt`, not a crash.** This
 * is the lesson of T114 in feature 001. `looksLikeADocument` checked that an
 * item's `interval` was an object and stopped there, so a hand-edited count of
 * zero reached `addInterval`, which throws — on load, on the only copy of the
 * user's data, leaving no way back into the app. Rooms are a bigger surface for
 * the same bug: two nested levels of numbers, and geometry that will divide,
 * scale and render them.
 *
 * Every rejection below is a document that is valid in every other respect, so
 * a rejection can only be about the rooms.
 *
 * **One ordering fact this file depends on**: `load()` validates the parsed
 * document *before* migrating it, so validation meets v1 documents that have no
 * `rooms` key at all. It must accept them. If it does not, the v2 build calls
 * every existing user's document corrupt on first launch — see the last
 * describe block, which is the single most consequential test in this file.
 */

beforeEach(() => {
  localStorage.clear()
  // `readOnly` is module state that is never cleared for the life of a session
  // by design. Reset it so no test here can be affected by an earlier one.
  resetReadOnlyForTests()
})

function aDocumentWith(rooms: Room[]): StoredDocument {
  return { ...emptyDocument(), rooms }
}

/** Loads, and fails the test with a readable message if loading threw. */
function loadWithoutCrashing(): LoadOutcome {
  let outcome: LoadOutcome | undefined

  expect(
    () => {
      outcome = load()
    },
    'load() threw instead of returning an outcome. This runs at startup on the only ' +
      'copy of the user data: a throw here is an app that will not open and a user ' +
      'with no way back in. T114 is exactly this bug.',
  ).not.toThrow()

  return outcome as LoadOutcome
}

// ---------------------------------------------------------------------------
// The round trip
// ---------------------------------------------------------------------------

describe('a document holding rooms', () => {
  const sofa = anObject({ id: 'obj_sofa', pieceId: 'sofa', name: 'Sofa', xMm: 0, yMm: 0 })
  const wardrobe = anObject({
    id: 'obj_wardrobe',
    pieceId: 'wardrobe',
    name: 'Wardrobe',
    widthMm: 1000,
    depthMm: 600,
    heightMm: 2100,
    xMm: 2500,
    yMm: 0,
  })
  const livingRoom = aRoom({ id: 'rm_living', name: 'Living room', objects: [sofa, wardrobe] })
  const bedroom = aRoom({
    id: 'rm_bedroom',
    name: 'Bedroom',
    widthMm: 3000,
    depthMm: 3400,
    objects: [],
  })

  it('reads back every room exactly as it was saved', () => {
    save(aDocumentWith([livingRoom, bedroom]))

    const outcome = load()

    expect(outcome.kind).toBe('loaded')
    expect(
      outcome.document.rooms,
      'a room came back different from the way it was stored. Names, dimensions, ' +
        'objects, positions and order are the whole of what the user arranged.',
    ).toEqual([livingRoom, bedroom])
  })

  it('keeps the rooms in the order they were saved in', () => {
    save(aDocumentWith([bedroom, livingRoom]))

    expect(load().document.rooms.map((room) => room.id)).toEqual([
      'rm_bedroom',
      'rm_living',
    ])
  })

  it('keeps the objects within a room in order', () => {
    save(aDocumentWith([aRoom({ objects: [wardrobe, sofa] })]))

    expect(
      load().document.rooms[0]?.objects.map((object) => object.id),
    ).toEqual(['obj_wardrobe', 'obj_sofa'])
  })

  it('keeps a room that has nothing in it', () => {
    // The spec's edge case: an empty room is an empty room, not an absence.
    save(aDocumentWith([bedroom]))

    expect(load().document.rooms[0]?.objects).toEqual([])
  })

  it('keeps the maintenance schedule alongside the rooms', () => {
    // Rooms are an addition, not a replacement. Adding a collection that
    // quietly costs the user their job list would be the worst possible trade.
    save({ ...aDocumentWith([livingRoom]), items: [anItem()] })

    const outcome = load()

    expect(outcome.document.items).toEqual([anItem()])
    expect(outcome.document.rooms).toEqual([livingRoom])
  })

  it('stores an empty rooms collection for a flat with no rooms described yet', () => {
    save(emptyDocument())

    const outcome = load()

    expect(outcome.kind).toBe('loaded')
    expect(outcome.document.rooms).toEqual([])
  })

  it('starts a fresh install with an empty rooms collection', () => {
    expect(load().document.rooms).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Documents the app must refuse rather than crash on
// ---------------------------------------------------------------------------

/**
 * Stores a document that is valid in every respect except its rooms, so a
 * rejection can only be about the rooms. Returns the raw JSON, for the tests
 * that check the original was parked rather than destroyed.
 */
function storeDocumentWithRooms(rooms: unknown): string {
  const raw = JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    revision: 1,
    items: [anItem()],
    rooms,
  })
  localStorage.setItem(STORAGE_KEY, raw)
  return raw
}

/** A valid room, as an ordinary object, for the cases below to spoil one field of. */
const soundRoom = () => ({ ...aRoom(), objects: [] as unknown[] })
const soundObject = () => ({ ...anObject() })

describe('rooms that are not a collection at all', () => {
  const notArrays: ReadonlyArray<{ why: string; rooms: unknown }> = [
    { why: 'a string', rooms: 'Living room' },
    { why: 'a number', rooms: 2 },
    { why: 'an object', rooms: { rm_living: { name: 'Living room' } } },
    { why: 'null', rooms: null },
    { why: 'a boolean', rooms: true },
  ]

  for (const { why, rooms } of notArrays) {
    it(`makes the document corrupt when rooms is ${why}`, () => {
      storeDocumentWithRooms(rooms)

      expect(loadWithoutCrashing().kind).toBe('corrupt')
    })
  }
})

describe('a room that is not a room', () => {
  const notRooms: ReadonlyArray<{ why: string; room: unknown }> = [
    { why: 'null', room: null },
    { why: 'a bare string', room: 'Living room' },
    { why: 'a number', room: 4 },
    { why: 'an array', room: [] },
  ]

  for (const { why, room } of notRooms) {
    it(`makes the document corrupt when a room is ${why}`, () => {
      storeDocumentWithRooms([room])

      expect(loadWithoutCrashing().kind).toBe('corrupt')
    })
  }
})

/**
 * A room whose dimensions cannot describe a real room. FR-002 refuses these at
 * the form; the routes past the form are a hand-edited document and a future
 * writer, and this is a plain JSON blob in a store any browser will open.
 *
 * Every one of these numbers is about to be divided by, scaled and rendered.
 */
describe('a room with impossible dimensions', () => {
  const impossible: ReadonlyArray<{ why: string; room: unknown }> = [
    { why: 'a width of zero', room: { ...soundRoom(), widthMm: 0 } },
    { why: 'a depth of zero', room: { ...soundRoom(), depthMm: 0 } },
    { why: 'a height of zero', room: { ...soundRoom(), heightMm: 0 } },
    { why: 'a negative width', room: { ...soundRoom(), widthMm: -4000 } },
    { why: 'a negative depth', room: { ...soundRoom(), depthMm: -1 } },
    { why: 'a fractional width', room: { ...soundRoom(), widthMm: 4000.5 } },
    { why: 'a fractional height', room: { ...soundRoom(), heightMm: 2400.0001 } },
    // Hand-edited JSON produces strings that look right in a text editor. This
    // is the shape T114 actually found on the interval count.
    { why: 'a width that is a string of digits', room: { ...soundRoom(), widthMm: '4000' } },
    { why: 'a width that is null', room: { ...soundRoom(), widthMm: null } },
    { why: 'no width at all', room: withoutKey(soundRoom(), 'widthMm') },
    { why: 'no depth at all', room: withoutKey(soundRoom(), 'depthMm') },
    { why: 'no height at all', room: withoutKey(soundRoom(), 'heightMm') },
    { why: 'no id', room: withoutKey(soundRoom(), 'id') },
    { why: 'no name', room: withoutKey(soundRoom(), 'name') },
    { why: 'no objects collection', room: withoutKey(soundRoom(), 'objects') },
    { why: 'an objects collection that is not a collection', room: { ...soundRoom(), objects: 'sofa' } },
  ]

  for (const { why, room } of impossible) {
    it(`makes the document corrupt when a room has ${why}`, () => {
      storeDocumentWithRooms([room])

      expect(
        loadWithoutCrashing().kind,
        `a room with ${why} was loaded into the app. Every dimension here is about ` +
          'to be scaled, divided by and rendered.',
      ).toBe('corrupt')
    })
  }
})

describe('an object with impossible dimensions', () => {
  const impossible: ReadonlyArray<{ why: string; object: unknown }> = [
    { why: 'a width of zero', object: { ...soundObject(), widthMm: 0 } },
    { why: 'a depth of zero', object: { ...soundObject(), depthMm: 0 } },
    { why: 'a height of zero', object: { ...soundObject(), heightMm: 0 } },
    { why: 'a negative width', object: { ...soundObject(), widthMm: -900 } },
    { why: 'a negative depth', object: { ...soundObject(), depthMm: -1 } },
    { why: 'a fractional depth', object: { ...soundObject(), depthMm: 900.25 } },
    { why: 'a width that is a string of digits', object: { ...soundObject(), widthMm: '2000' } },
    { why: 'no width at all', object: withoutKey(soundObject(), 'widthMm') },
    { why: 'no depth at all', object: withoutKey(soundObject(), 'depthMm') },
    { why: 'no height at all', object: withoutKey(soundObject(), 'heightMm') },
    { why: 'no position', object: withoutKey(withoutKey(soundObject(), 'xMm'), 'yMm') },
    { why: 'no id', object: withoutKey(soundObject(), 'id') },
    // A position is the same class of value as a dimension, and integers are
    // the whole reason "exactly touching" has an exact answer. A fractional
    // coordinate is something only a hand edit or a foreign writer can produce
    // — the app cannot write one — so refusing it costs a real user nothing.
    { why: 'a fractional x', object: { ...soundObject(), xMm: 500.5 } },
    { why: 'a fractional y', object: { ...soundObject(), yMm: 0.0001 } },
    { why: 'an x that is a string of digits', object: { ...soundObject(), xMm: '500' } },
    { why: 'a y that is null', object: { ...soundObject(), yMm: null } },
  ]

  for (const { why, object } of impossible) {
    it(`makes the document corrupt when an object has ${why}`, () => {
      storeDocumentWithRooms([{ ...soundRoom(), objects: [object] }])

      expect(loadWithoutCrashing().kind).toBe('corrupt')
    })
  }

  it('makes the document corrupt when an object is not an object', () => {
    storeDocumentWithRooms([{ ...soundRoom(), objects: [null] }])

    expect(loadWithoutCrashing().kind).toBe('corrupt')
  })
})

/**
 * An object outside the walls of the room it is in. **This loads.**
 *
 * That is a decision, and it goes the opposite way from every block above, so
 * it is written down here rather than left as an absence.
 *
 * FR-005 forbids *positioning* an object outside the room, and the form is
 * where that is refused, with a reason. It does not follow that a stored
 * document holding one is unreadable, and treating it as corrupt would be
 * dangerous in a way the other rejections are not:
 *
 *   - `load()` rejects the **whole document**, not the offending room. One
 *     stranded sofa would take the user's entire maintenance history with it —
 *     parked under a recovery key they will never be told to look in.
 *   - FR-004 lets a user change a room's dimensions, and US1 scenario 4 does
 *     not say what happens to the furniture when a room shrinks. Until that is
 *     settled, "objects end up outside a room that got smaller" is a state the
 *     app itself might write. Strict validation here would turn shrinking a
 *     room into total data loss, one launch later, with nothing connecting the
 *     cause to the effect.
 *   - It is not the T114 class of fault. T114 was about values that make the
 *     app *throw* while working out what to show — a zero interval count, an
 *     unrecognised unit — leaving no way back in. A position outside the walls
 *     computes fine and draws fine: a sofa through a wall, visible, wrong, and
 *     fixable by moving it.
 *
 * So the rule is: refuse numbers that cannot be computed with, accept
 * arrangements that are merely wrong. If that trade is ever revisited, it must
 * be revisited together with what a room resize does to its contents, and with
 * some way of rejecting one room rather than the document.
 *
 * The room is 4000 x 3000 and the object is 2000 x 900 throughout.
 */
describe('an object positioned outside the room that contains it', () => {
  const room = aRoom({ widthMm: 4000, depthMm: 3000 })
  const objectAt = (xMm: number, yMm: number, overrides: Record<string, unknown> = {}) => ({
    ...soundObject(),
    widthMm: 2000,
    depthMm: 900,
    xMm,
    yMm,
    ...overrides,
  })

  const outside: ReadonlyArray<{ why: string; object: unknown }> = [
    { why: 'past the left wall', object: objectAt(-1, 500) },
    { why: 'past the near wall', object: objectAt(500, -1) },
    { why: 'past the right wall', object: objectAt(2001, 500) },
    { why: 'past the far wall', object: objectAt(500, 2101) },
    { why: 'entirely outside the room', object: objectAt(10_000, 10_000) },
    { why: 'wider than the room it is in', object: objectAt(0, 0, { widthMm: 4001 }) },
    { why: 'deeper than the room it is in', object: objectAt(0, 0, { depthMm: 3001 }) },
  ]

  for (const { why, object } of outside) {
    it(`loads a document where an object is ${why}`, () => {
      storeDocumentWithRooms([{ ...room, objects: [object] }])

      expect(
        loadWithoutCrashing().kind,
        `a document with an object ${why} was called corrupt, which throws away the ` +
          "user's whole document — jobs, history and every other room — over one " +
          'misplaced sofa. Refuse the position at the form, not the document at load.',
      ).toBe('loaded')
    })
  }

  it('does not park the document under a recovery key', () => {
    storeDocumentWithRooms([{ ...room, objects: [objectAt(10_000, 10_000)] }])

    load()

    expect(
      Object.keys(localStorage).filter((key) => key.startsWith(RECOVERY_KEY_PREFIX)),
    ).toHaveLength(0)
  })
})

describe('a corrupt rooms document', () => {
  it('leaves the app a usable empty schedule rather than failing to start', () => {
    storeDocumentWithRooms('nope')

    const outcome = loadWithoutCrashing()

    expect(outcome.document.items).toEqual([])
    expect(outcome.document.rooms).toEqual([])
  })

  it('parks the original rather than destroying it', () => {
    // Unreadable is not the same as unrecoverable, and this is the only copy.
    const raw = storeDocumentWithRooms([{ ...soundRoom(), widthMm: 0 }])

    const outcome = loadWithoutCrashing()

    if (outcome.kind !== 'corrupt') throw new Error('expected corrupt')
    expect(outcome.recoveryKey).toMatch(RECOVERY_KEY_PREFIX)
    expect(localStorage.getItem(outcome.recoveryKey as string)).toBe(raw)
  })
})

/**
 * The other half, and the half that stops all of the above from being satisfied
 * by refusing everything. Each of these is a document the app itself writes.
 */
describe('rooms the app must accept', () => {
  const cases: ReadonlyArray<{ what: string; rooms: unknown }> = [
    { what: 'no rooms at all', rooms: [] },
    { what: 'a room with nothing in it', rooms: [{ ...soundRoom() }] },
    {
      what: 'an object flush against every wall at once',
      rooms: [
        {
          ...aRoom({ widthMm: 4000, depthMm: 3000 }),
          objects: [{ ...soundObject(), widthMm: 4000, depthMm: 3000, xMm: 0, yMm: 0 }],
        },
      ],
    },
    {
      what: 'two objects pushed up against each other',
      rooms: [
        {
          ...aRoom({ widthMm: 4000, depthMm: 3000 }),
          objects: [
            { ...soundObject(), id: 'obj_a', widthMm: 1000, depthMm: 1000, xMm: 0, yMm: 0 },
            { ...soundObject(), id: 'obj_b', widthMm: 1000, depthMm: 1000, xMm: 1000, yMm: 0 },
          ],
        },
      ],
    },
    {
      what: 'several rooms, each with its own contents',
      rooms: [
        { ...soundRoom(), id: 'rm_a', objects: [{ ...soundObject() }] },
        { ...soundRoom(), id: 'rm_b', objects: [] },
      ],
    },
  ]

  for (const { what, rooms } of cases) {
    it(`loads a document describing ${what}`, () => {
      storeDocumentWithRooms(rooms)

      const outcome = loadWithoutCrashing()

      expect(
        outcome.kind,
        `a document describing ${what} was rejected. Rejecting everything is not ` +
          'validation, and this is a document the app itself writes.',
      ).toBe('loaded')
      expect(outcome.document.rooms).toEqual(rooms)
      expect(
        Object.keys(localStorage).filter((key) => key.startsWith(RECOVERY_KEY_PREFIX)),
        'a valid document was parked as if it were corrupt',
      ).toHaveLength(0)
    })
  }
})

/**
 * **The upgrade path, and the most consequential test in this file.**
 *
 * `load()` validates before it migrates, so validation meets documents that
 * predate rooms entirely. Every existing user has one. If validation demands a
 * `rooms` key, then the first launch of the v2 build declares their document
 * corrupt, hands them an empty schedule and parks their history under a
 * recovery key they will never be told to look in. With no export and no
 * backup, that is the whole of their data.
 *
 * So: be strict about `rooms` when it is there, and silent about it when it is
 * not.
 */
describe('a document written before rooms existed', () => {
  function storeTheV1Fixture(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v1Fixture))
  }

  it('loads rather than being called corrupt', () => {
    storeTheV1Fixture()

    expect(
      loadWithoutCrashing().kind,
      'a v1 document with no rooms key was rejected. Every existing user has one of ' +
        'these, there is no export and no backup, and this is what they would see on ' +
        'the first launch after the upgrade.',
    ).toBe('loaded')
  })

  it('arrives with an empty rooms collection', () => {
    storeTheV1Fixture()

    expect(load().document.rooms).toEqual([])
  })

  it('keeps every job and its history', () => {
    storeTheV1Fixture()

    expect(load().document.items).toEqual(v1Fixture.items)
  })

  it('keeps the revision counter, so the next save is not treated as stale', () => {
    storeTheV1Fixture()

    expect(load().document.revision).toBe(v1Fixture.revision)
  })

  it('is not parked under a recovery key', () => {
    storeTheV1Fixture()

    load()

    expect(Object.keys(localStorage).filter((key) => key.startsWith(RECOVERY_KEY_PREFIX))).toHaveLength(0)
  })
})

/** Removes a key, for describing the document a hand edit leaves behind. */
function withoutKey(source: unknown, key: string): Record<string, unknown> {
  const copy = { ...(source as Record<string, unknown>) }
  delete copy[key]
  return copy
}
