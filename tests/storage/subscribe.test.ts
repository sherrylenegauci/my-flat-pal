import { describe, it, expect, beforeEach, vi } from 'vitest'
import { save, subscribeToExternalChanges } from '../../src/storage/repository'
import { STORAGE_KEY, emptyDocument } from '../../src/storage/schema'

/**
 * T030 — noticing when another context changes the data.
 *
 * The compare-and-swap in `save` stops one context destroying another's work,
 * but on its own it turns a silent data loss into a visible error. That is
 * better, and still not good: the user sees a failure for something they did
 * nothing wrong to cause.
 *
 * The `storage` event closes the gap. It fires in *other* same-origin contexts
 * when one of them writes, so an open app can refresh itself rather than sit
 * on stale state and then fail its next save.
 */
beforeEach(() => localStorage.clear())

/** The browser fires this in other tabs; jsdom leaves it to us. */
function fireStorageEvent(key: string | null, newValue: string | null) {
  window.dispatchEvent(new StorageEvent('storage', { key, newValue }))
}

describe('subscribeToExternalChanges', () => {
  it('notifies when another context writes the schedule', () => {
    const onChange = vi.fn()
    subscribeToExternalChanges(onChange)

    fireStorageEvent(STORAGE_KEY, JSON.stringify(emptyDocument()))

    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('ignores writes to unrelated keys', () => {
    const onChange = vi.fn()
    subscribeToExternalChanges(onChange)

    fireStorageEvent('some.other.app', 'irrelevant')

    expect(onChange).not.toHaveBeenCalled()
  })

  it('notifies when the schedule is cleared entirely', () => {
    // `newValue: null` means removed — the user cleared site data in another
    // tab. The app needs to know rather than keep showing a schedule that no
    // longer exists.
    const onChange = vi.fn()
    subscribeToExternalChanges(onChange)

    fireStorageEvent(STORAGE_KEY, null)

    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('does not fire for this context own writes', () => {
    // The spec says `storage` fires only in *other* documents, so our own
    // `save` must not trigger it. Verified here so the app does not build a
    // refresh loop on the assumption that it might.
    const onChange = vi.fn()
    subscribeToExternalChanges(onChange)

    save(emptyDocument())

    expect(onChange).not.toHaveBeenCalled()
  })

  it('stops notifying once unsubscribed', () => {
    const onChange = vi.fn()
    const unsubscribe = subscribeToExternalChanges(onChange)

    unsubscribe()
    fireStorageEvent(STORAGE_KEY, JSON.stringify(emptyDocument()))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('supports more than one subscriber', () => {
    const a = vi.fn()
    const b = vi.fn()
    subscribeToExternalChanges(a)
    subscribeToExternalChanges(b)

    fireStorageEvent(STORAGE_KEY, JSON.stringify(emptyDocument()))

    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })
})
