import { describe, it, expect } from 'vitest'
import { newItemId, newCompletionId } from '../../src/domain/ids'

/**
 * T020 — id generation.
 *
 * plan.md § Data model states ids are "stable, unique, never reused", and
 * nothing implemented or tested that. "Never reused after deletion" cannot be
 * guaranteed by a counter that resets, so these pin the properties that make
 * reuse effectively impossible.
 */
describe('id generation', () => {
  it('produces unique item ids across a large batch', () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => newItemId()))
    expect(ids.size).toBe(10_000)
  })

  it('produces unique completion ids across a large batch', () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => newCompletionId()))
    expect(ids.size).toBe(10_000)
  })

  it('never collides with ids already in use, including deleted ones', () => {
    // Simulates the reuse hazard: generate, "delete" half, generate more.
    const everSeen = new Set(Array.from({ length: 1_000 }, () => newItemId()))
    const fresh = Array.from({ length: 1_000 }, () => newItemId())

    for (const id of fresh) {
      expect(everSeen.has(id)).toBe(false)
      everSeen.add(id)
    }
  })

  it('prefixes ids so they are recognisable in stored data', () => {
    expect(newItemId()).toMatch(/^itm_/)
    expect(newCompletionId()).toMatch(/^cmp_/)
  })

  it('does not depend on the clock alone', () => {
    // Two ids generated in the same millisecond must still differ.
    const a = newItemId()
    const b = newItemId()
    expect(a).not.toBe(b)
  })
})
