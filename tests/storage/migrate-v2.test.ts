import { describe, it, expect } from 'vitest'
import { migrate } from '../../src/storage/migrate'
import { SCHEMA_VERSION } from '../../src/storage/schema'
import v1Fixture from './fixtures/v1.json'
import v2Fixture from './fixtures/v2.json'

/**
 * T009 — the v1 to v2 migration (plan.md § Storage and the first real migration).
 *
 * `migrate.ts` has existed since 001 and has never done anything: the chain has
 * been empty and the function has been the identity at v1. This is the first
 * migration that will ever run for real, and it will run against documents
 * already sitting on people's phones. There is no export, no backup, and no way
 * back. A migration that drops a field here loses a user's history permanently
 * and the app cannot even tell them it happened.
 *
 * So these tests are written against the **committed v1 fixture** rather than a
 * document built here. A document reconstructed from memory tests the memory.
 *
 * The migration is additive: a v1 document gains an empty `rooms` array and
 * nothing else about it changes.
 */

describe('migrating a v1 document', () => {
  it('brings it to the current schema version', () => {
    expect(migrate(v1Fixture).schemaVersion).toBe(SCHEMA_VERSION)
  })

  it('gives it an empty rooms collection', () => {
    const result = migrate(v1Fixture)

    expect(
      result.rooms,
      'a migrated v1 document has no rooms collection, so every later read of it ' +
        'is reading undefined',
    ).toEqual([])
  })

  it('changes nothing else about it', () => {
    // The whole document in one assertion, so that anything dropped, renamed or
    // silently added shows up in the diff rather than in whichever field
    // somebody thought to check.
    expect(migrate(v1Fixture)).toEqual({
      ...v1Fixture,
      schemaVersion: SCHEMA_VERSION,
      rooms: [],
    })
  })

  it('preserves every job and its history', () => {
    expect(migrate(v1Fixture).items).toEqual(v1Fixture.items)
  })

  it('preserves the revision counter', () => {
    // Not cosmetic: the revision is the concurrency guard. A migration that
    // reset it would let a save from another tab overwrite this one.
    expect(migrate(v1Fixture).revision).toBe(3)
  })

  it('does not drop a field it does not recognise', () => {
    const withExtra = { ...v1Fixture, somethingNewer: 'keep me' }

    expect(migrate(withExtra)).toHaveProperty('somethingNewer', 'keep me')
  })

  it('does not mutate the document it is given', () => {
    // The caller still holds the original. A migration that edits in place is
    // how a half-applied upgrade gets written back.
    const before = JSON.stringify(v1Fixture)

    migrate(v1Fixture)

    expect(JSON.stringify(v1Fixture)).toBe(before)
  })
})

/**
 * The identity case. Most launches after the upgrade read a v2 document, so the
 * cheap path has to be the safe one: nothing added, nothing dropped, and in
 * particular the rooms are not reset to empty by a migration that runs when it
 * should not.
 */
describe('migrating a document already at v2', () => {
  it('leaves it exactly as it was', () => {
    expect(migrate(v2Fixture)).toEqual(v2Fixture)
  })

  it('keeps its rooms, with their objects, in order', () => {
    const result = migrate(v2Fixture)

    expect(
      result.rooms,
      'the rooms in an already-current document were changed by a migration that ' +
        'had nothing to do. An hour of arranging furniture is what is at stake.',
    ).toEqual(v2Fixture.rooms)
  })

  it('keeps a room that has nothing in it', () => {
    // The spec's edge case: an empty room is an empty room, not an error and
    // not something to tidy away.
    const result = migrate(v2Fixture)

    expect(result.rooms.map((room) => room.objects.length)).toEqual(
      v2Fixture.rooms.map((room) => room.objects.length),
    )
  })

  it('does not mutate it', () => {
    const before = JSON.stringify(v2Fixture)

    migrate(v2Fixture)

    expect(JSON.stringify(v2Fixture)).toBe(before)
  })
})
