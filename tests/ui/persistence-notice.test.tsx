import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StorageNotice } from '../../src/ui/components/StorageNotice'
import { requestPersistence } from '../../src/storage/persistence'
import { expectNoViolations } from './axe-helper'

/**
 * T031 — telling the user the truth about durability.
 *
 * The app cannot detect data loss after the fact: anything proving the data
 * existed is wiped along with it. Verification (T010) established that an
 * installed app is exempt from WebKit's seven-day storage cap and that being
 * installed is one of the things that earns a persistence grant — so a grant is
 * likely. But when it is refused, saying so once is the only honest signal
 * available, and it is the whole mitigation.
 */
type StorageManagerStub = { persist?: () => Promise<boolean>; persisted?: () => Promise<boolean> }

function stubStorage(stub: StorageManagerStub | undefined) {
  Object.defineProperty(navigator, 'storage', {
    value: stub,
    configurable: true,
    writable: true,
  })
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('requestPersistence', () => {
  it('reports granted when the browser agrees', async () => {
    stubStorage({ persisted: async () => false, persist: async () => true })
    await expect(requestPersistence()).resolves.toBe('granted')
  })

  it('reports refused when the browser declines', async () => {
    stubStorage({ persisted: async () => false, persist: async () => false })
    await expect(requestPersistence()).resolves.toBe('refused')
  })

  it('does not ask again when persistence is already granted', async () => {
    const persist = vi.fn(async () => true)
    stubStorage({ persisted: async () => true, persist })

    await expect(requestPersistence()).resolves.toBe('granted')
    expect(persist).not.toHaveBeenCalled()
  })

  it('degrades gracefully where the Storage API is absent', async () => {
    // Older browsers, and any non-secure context. The app must still work.
    stubStorage(undefined)
    await expect(requestPersistence()).resolves.toBe('unsupported')
  })

  it('degrades gracefully when the call throws', async () => {
    stubStorage({
      persisted: async () => false,
      persist: async () => {
        throw new Error('nope')
      },
    })
    await expect(requestPersistence()).resolves.toBe('unsupported')
  })
})

describe('StorageNotice', () => {
  it('says nothing when persistence is granted', async () => {
    stubStorage({ persisted: async () => true, persist: async () => true })
    render(<StorageNotice />)

    // Give the effect a chance to resolve before asserting absence.
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })

  it('warns in plain language when persistence is refused', async () => {
    stubStorage({ persisted: async () => false, persist: async () => false })
    render(<StorageNotice />)

    const notice = await screen.findByRole('status')
    // No jargon: not "persistent storage was denied by the user agent".
    expect(notice.textContent).toMatch(/history/i)
    expect(notice.textContent).not.toMatch(/user agent|quota|API/i)
  })

  it('can be dismissed, and stays dismissed', async () => {
    const user = userEvent.setup()
    stubStorage({ persisted: async () => false, persist: async () => false })

    const { unmount } = render(<StorageNotice />)
    await user.click(await screen.findByRole('button', { name: /dismiss|got it|ok/i }))
    expect(screen.queryByRole('status')).toBeNull()

    // "Once" means once — not once per launch.
    unmount()
    render(<StorageNotice />)
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })

  it('says nothing when the Storage API is unavailable', async () => {
    // No API means no answer, and inventing a warning from silence would be
    // its own kind of dishonesty.
    stubStorage(undefined)
    render(<StorageNotice />)
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })

  it('has no accessibility violations', async () => {
    stubStorage({ persisted: async () => false, persist: async () => false })
    const { container } = render(<StorageNotice />)
    await screen.findByRole('status')

    await expectNoViolations(container)
  })
})
