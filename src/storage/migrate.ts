import { SCHEMA_VERSION } from './schema'
import type { StoredDocument } from './schema'

/**
 * Brings a stored document up to the current schema version.
 *
 * From 001 until the room designer this was the identity: the chain was empty
 * and nothing had ever been migrated. It was written then, before there was any
 * data to lose, because writing the first migration later means writing it
 * against documents already sitting on people's phones, with no way to inspect
 * them and no backup if it goes wrong. That bet is now being collected on — the
 * 1 → 2 upgrade below is the first one that will run on a real device.
 *
 * Rules for adding a version:
 *   - Migrations are pure functions of the document. No clock, no storage, no
 *     network — so each one can be tested against a committed fixture.
 *   - Never drop a field you do not recognise.
 *   - Renaming or removing a field is a version bump, never an edit to what an
 *     existing version means.
 */
type Upgrade = (doc: Record<string, unknown>) => Record<string, unknown>

/** Keyed by the version being upgraded *from*. */
const UPGRADES: Record<number, Upgrade> = {
  /**
   * 1 → 2: the room designer (003). Additive — a v1 document gains an empty
   * `rooms` collection and nothing else about it changes.
   *
   * **This is the first migration this project has ever run for real.** It runs
   * on documents already sitting on people's phones, with no export and no way
   * back, and the app cannot even detect afterwards that something was lost. So
   * it is written to be the smallest thing that could work: one key added, by
   * spreading rather than rebuilding, so that a field this build has never
   * heard of survives the trip.
   *
   * A `rooms` array that is already there is kept rather than replaced. It
   * should be impossible — a document with rooms is a v2 document and never
   * reaches this function — but the rule above this is "never drop a field you
   * do not recognise", and an interrupted upgrade is a cheaper thing to survive
   * than to reason about.
   */
  1: (doc) => ({ ...doc, rooms: Array.isArray(doc['rooms']) ? doc['rooms'] : [] }),
}

export function migrate(input: unknown): StoredDocument {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Cannot migrate: not an object')
  }

  let doc = { ...(input as Record<string, unknown>) }
  const startingVersion = typeof doc['schemaVersion'] === 'number' ? doc['schemaVersion'] : 0

  if (startingVersion > SCHEMA_VERSION) {
    // Guessing at a future shape is how you destroy the newer document.
    throw new Error(
      `Cannot migrate a document from schema version ${startingVersion}; this build understands ${SCHEMA_VERSION}`,
    )
  }

  for (let version = startingVersion; version < SCHEMA_VERSION; version++) {
    const upgrade = UPGRADES[version]
    if (!upgrade) {
      throw new Error(`No migration registered from schema version ${version} to ${version + 1}`)
    }
    doc = upgrade(doc)
  }

  return { ...doc, schemaVersion: SCHEMA_VERSION } as unknown as StoredDocument
}
