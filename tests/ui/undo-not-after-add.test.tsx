import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'
import { load } from '../../src/storage/repository'

/**
 * T096 — adding a job raises no undo offer (FR-007b).
 *
 * Undo covers marking done and backdating. It does not cover adding, and the
 * reason is concrete rather than tidy-minded: the completion an add creates is
 * the *last done* date the user just typed, so taking the offer strips that date
 * and turns the job they created a second ago into "Never done", leaving the job
 * behind. That is not a way back from anything the user did. A wrong date on a
 * new job is fixed by editing the job (FR-009).
 *
 * **This is an absence assertion, so it is written to be capable of failing.**
 * Two things make it so, and both are deliberate:
 *
 *   - It drives the real form through the Add job button rather than seeding a
 *     document, because the offer is raised by the add *flow*, and a seeded
 *     document never runs it.
 *   - It asserts that the completion really was recorded before asserting that
 *     no offer appeared. Without that, an app that silently discarded the
 *     last-done date would pass — there would be nothing to undo, and the test
 *     would read as coverage of a requirement it never exercised.
 *
 * The positive control at the bottom marks a job done in the same session and
 * asserts the offer *does* appear, so the file cannot pass by rendering an app
 * that never offers undo at all.
 *
 * `<StrictMode>` and stored-document assertions throughout, for the reason in
 * `complete.test.tsx`.
 */
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0)) // 8 August 2026
})
afterEach(() => vi.useRealTimers())

function launch() {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  return user
}

async function addAJob(
  user: ReturnType<typeof userEvent.setup>,
  fields: { name: string; count: string; unit: string; lastDone?: string },
) {
  await user.click(await screen.findByRole('button', { name: /add/i }))

  await user.clear(screen.getByLabelText(/name/i))
  await user.type(screen.getByLabelText(/name/i), fields.name)
  await user.clear(screen.getByLabelText(/how often/i))
  await user.type(screen.getByLabelText(/how often/i), fields.count)
  await user.selectOptions(screen.getByLabelText(/period|unit/i), fields.unit)
  if (fields.lastDone !== undefined) {
    await user.type(screen.getByLabelText(/last done/i), fields.lastDone)
  }

  await user.click(screen.getByRole('button', { name: /save|add/i }))
  await screen.findByText(fields.name)
}

const undoControl = () => screen.queryByRole('button', { name: /undo/i })
const storedCompletions = () => load().document.items[0]?.completions ?? []

describe('adding a job', () => {
  it('raises no undo offer, even though it records a last-done date', async () => {
    const user = launch()

    await addAJob(user, { name: 'Boiler service', count: '1', unit: 'year', lastDone: '2026-06-14' })

    // The date was genuinely recorded — so there *is* a completion here, and the
    // absence below is about the offer rather than about nothing having
    // happened.
    expect(storedCompletions()).toHaveLength(1)
    expect(storedCompletions()[0]?.completedOn).toBe('2026-06-14')

    expect(undoControl()).toBeNull()
  })

  it('leaves the job showing the date it was given, with nothing offering to strip it', async () => {
    // What taking the offer actually costs: the job created a second ago
    // becomes "Never done" and the date the user typed is gone.
    const user = launch()

    await addAJob(user, { name: 'Boiler service', count: '1', unit: 'year', lastDone: '2026-06-14' })

    const row = screen.getByRole('listitem')
    expect(row.textContent).toContain('14 June 2027')
    expect(row.textContent).not.toMatch(/never done/i)
    expect(undoControl()).toBeNull()
  })

  it('raises no undo offer when no last-done date is given either', async () => {
    // Nothing is recorded in this case, so there is nothing to take back. Worth
    // stating, because the fix must not become "offer undo after any add".
    const user = launch()

    await addAJob(user, { name: 'Boiler service', count: '1', unit: 'year' })

    expect(storedCompletions()).toHaveLength(0)
    expect(undoControl()).toBeNull()
  })

  it('still offers undo when a job is marked done in the same session', async () => {
    // The positive control. Without it, this file would pass against an app that
    // had lost undo entirely.
    const user = launch()
    await addAJob(user, { name: 'Boiler service', count: '1', unit: 'year', lastDone: '2026-06-14' })
    expect(undoControl()).toBeNull()

    await user.click(screen.getByRole('button', { name: /mark done/i }))

    expect(undoControl()).not.toBeNull()
    expect(storedCompletions()).toHaveLength(2)
  })

  it('does not let that undo take back the date the job was created with', async () => {
    // FR-007a through the add flow: one press, one removal. The completion the
    // add created is earlier history now, and undo must not reach it.
    const user = launch()
    await addAJob(user, { name: 'Boiler service', count: '1', unit: 'year', lastDone: '2026-06-14' })

    await user.click(screen.getByRole('button', { name: /mark done/i }))
    await user.click(screen.getByRole('button', { name: /undo/i }))

    expect(storedCompletions()).toHaveLength(1)
    expect(storedCompletions()[0]?.completedOn).toBe('2026-06-14')
    expect(undoControl()).toBeNull()
  })
})
