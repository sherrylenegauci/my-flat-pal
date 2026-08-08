import { SCHEMA_VERSION } from './schema'
import type { StoredDocument } from './schema'

/**
 * Brings a stored document up to the current schema version.
 *
 * At v1 the chain is empty and this is nearly the identity function. It exists
 * now, before there is any data to lose, because writing the first migration
 * later means writing it against documents already sitting on people's phones,
 * with no way to inspect them and no backup if it goes wrong.
 *
 * Rules for adding a version:
 *   - Migrations are pure functions of the document. No clock, no storage, no
 *     network — so each one can be tested against a committed fixture.
 *   - Never drop a field you do not recognise.
 *   - Renaming or removing a field is a version bump, never an edit to what an
 *     existing version means.
 */
type Upgrade = (doc: Record<string, unknown>) => Record<string, unknown>

/** Keyed by the version being upgraded *from*. Empty at v1. */
const UPGRADES: Record<number, Upgrade> = {}

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
