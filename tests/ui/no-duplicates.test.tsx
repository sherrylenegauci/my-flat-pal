import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'
import { load } from '../../src/storage/repository'

/**
 * Regression: adding one job created two.
 *
 * Reported from real use. The cause was a side effect inside a React state
 * updater — `useSchedule` called `save()` from within `setDoc(current => ...)`.
 * React requires updaters to be pure and StrictMode deliberately invokes them
 * twice in development to surface exactly this:
 *
 *   1. First run saves; the stored revision moves from R to R+1.
 *   2. StrictMode replays the updater with the same stale `current` (still R).
 *   3. The compare-and-swap correctly rejects it as a stale write.
 *   4. The recovery reloaded fresh state — which already contained the new
 *      job — and re-applied the change, adding it a second time.
 *
 * The guard worked. The recovery was wrong: re-applying a change on top of
 * state that already includes it duplicates it. The same fault would appear in
 * production without StrictMode whenever two tabs genuinely raced.
 *
 * These tests render inside StrictMode on purpose. Every other UI test renders
 * without it, which is why none of them caught this.
 */
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0))
})
afterEach(() => vi.useRealTimers())

async function addAJob(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole('button', { name: /add/i }))
  await user.type(screen.getByLabelText(/name/i), name)
  await user.click(screen.getByRole('button', { name: /save/i }))
  await screen.findByText(name)
}

describe('adding a job under StrictMode', () => {
  it('creates exactly one job, not two', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await addAJob(user, 'Boiler service')

    expect(screen.getAllByText('Boiler service')).toHaveLength(1)
  })

  it('stores exactly one job', async () => {
    // Asserting the stored document too: the screen could be right while the
    // saved data is wrong, and the saved data is the part with no backup.
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await addAJob(user, 'Boiler service')

    expect(load().document.items).toHaveLength(1)
  })

  it('adds one per submission across several jobs', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await addAJob(user, 'Boiler service')
    await addAJob(user, 'Smoke alarms')
    await addAJob(user, 'Gutters')

    expect(load().document.items).toHaveLength(3)
    expect(load().document.items.map((i) => i.name)).toEqual([
      'Boiler service',
      'Smoke alarms',
      'Gutters',
    ])
  })

  it('gives each job its own id', async () => {
    // Duplicates that share an id are a different, worse bug: React keys
    // collide and deleting one would remove both.
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await addAJob(user, 'Boiler service')
    await addAJob(user, 'Smoke alarms')

    const ids = load().document.items.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('advances the stored revision by exactly one per save', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    await addAJob(user, 'Boiler service')

    // A revision of 2 after one save means the document was written twice.
    expect(load().document.revision).toBe(1)
  })
})
