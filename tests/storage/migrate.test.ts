import { describe, it, expect } from 'vitest'
import { migrate } from '../../src/storage/migrate'
import { SCHEMA_VERSION } from '../../src/storage/schema'
import v1Fixture from './fixtures/v1.json'

/**
 * T027 — the migration chain.
 *
 * The fixture exists so that future migrations are tested against a real
 * historical document rather than one reconstructed from memory. In the
 * previous task list the fixture was created and then nothing ever consumed
 * it, which made it decorative.
 *
 * At v1 the chain is empty, so these tests are mostly about it being wired up
 * and honest — but they are what a v2 migration will be written against, and
 * writing them later means writing them against documents already on people's
 * phones.
 */
describe('migrate', () => {
  it('leaves a current-version document unchanged', () => {
    const result = migrate(v1Fixture)
    expect(result).toEqual(v1Fixture)
  })

  it('brings the document to the current schema version', () => {
    expect(migrate(v1Fixture).schemaVersion).toBe(SCHEMA_VERSION)
  })

  it('preserves every item and its history', () => {
    const result = migrate(v1Fixture)

    expect(result.items).toHaveLength(2)
    expect(result.items[0]?.name).toBe('Boiler service')
    expect(result.items[0]?.completions).toHaveLength(1)
    expect(result.items[1]?.name).toBe('Smoke alarm test')
    expect(result.items[1]?.completions).toHaveLength(0)
  })

  it('preserves the revision counter', () => {
    expect(migrate(v1Fixture).revision).toBe(3)
  })

  it('does not mutate the document it is given', () => {
    const before = JSON.stringify(v1Fixture)
    migrate(v1Fixture)
    expect(JSON.stringify(v1Fixture)).toBe(before)
  })

  it('does not drop fields it does not recognise', () => {
    // Forward compatibility: a newer build may have written a field this build
    // knows nothing about, and round-tripping should not silently delete it.
    const withExtra = { ...v1Fixture, somethingNewer: 'keep me' }
    expect(migrate(withExtra)).toHaveProperty('somethingNewer', 'keep me')
  })

  it('refuses a document from the future rather than guessing', () => {
    expect(() => migrate({ ...v1Fixture, schemaVersion: 99 })).toThrow()
  })
})
