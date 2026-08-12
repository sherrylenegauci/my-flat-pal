import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'
import { load } from '../../src/storage/repository'
import { MONTHLY, aCompletion, anItem, seed } from './seed'

/**
 * T063 — correcting a job. US3 scenario 1, FR-009 (name and interval),
 * FR-003 (the due date is derived, never stored) and FR-008 (history is kept).
 *
 * **Why the due date is asserted rather than the interval.** "The filter needs
 * doing every six months now" is only worth anything if the schedule moves with
 * it, and the schedule is the part the user reads. Checking that the stored
 * interval says 6 would pass an app that went on showing July.
 *
 * **Why history is asserted on an edit at all.** Nothing else in the suite would
 * notice a save path that rebuilt the item and dropped its completions: the name
 * would be right, the due date would be right, and the loss would only show up
 * the next time someone opened the history — by which point there is no way back,
 * because this app has no export (spec, "No backup, no export").
 *
 * **What this file cannot check.** Whether the edit form is legible, whether its
 * focus ring can be seen, and whether its controls are big enough to hit
 * one-handed. jsdom resolves no cascaded colour and computes no layout — every
 * element measures 0x0 here — so all three belong to `e2e/` and the device.
 */
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0))
})
afterEach(() => vi.useRealTimers())

/** Monthly, last done 1 June 2026 — so today, 8 August, it is overdue. */
const monthlyBoiler = () =>
  anItem({
    name: 'Boiler service',
    interval: MONTHLY,
    completions: [aCompletion('2026-06-01')],
  })

const launch = (strict = false) => ({
  user: userEvent.setup({ advanceTimers: vi.advanceTimersByTime }),
  ...render(strict ? <StrictMode><App /></StrictMode> : <App />),
})

async function openTheEditForm(user: ReturnType<typeof userEvent.setup>, job = 'Boiler service') {
  await user.click(await screen.findByRole('button', { name: job }))
  await user.click(await screen.findByRole('button', { name: 'Edit job' }))
  await screen.findByRole('heading', { name: 'Edit job', level: 2 })
}

const nameField = () => screen.getByLabelText(/name/i) as HTMLInputElement
const countField = () => screen.getByLabelText(/how often/i) as HTMLInputElement
const unitField = () => screen.getByLabelText(/period/i) as HTMLSelectElement

const storedJob = () => load().document.items[0]

describe('correcting a job', () => {
  it('opens filled in with what is already stored', async () => {
    // An edit form that starts blank is a re-entry form: it asks the user to
    // retype what the app already knows, and a slip loses the real value.
    seed([monthlyBoiler()])
    const { user } = launch()

    await openTheEditForm(user)

    expect(nameField().value).toBe('Boiler service')
    expect(countField().value).toBe('1')
    expect(unitField().value).toBe('month')
  })

  it('saves a new name, and the job carries it from then on', async () => {
    seed([monthlyBoiler()])
    const { user } = launch()

    await openTheEditForm(user)
    await user.clear(nameField())
    await user.type(nameField(), 'Boiler service and flue check')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    // Back on the job, under its new name.
    expect(
      await screen.findByRole('heading', { name: 'Boiler service and flue check', level: 2 }),
    ).toBeTruthy()
    expect(storedJob()?.name).toBe('Boiler service and flue check')
  })

  it('moves the next due date the moment the interval changes', async () => {
    // US3 scenario 1 and FR-003. Last done 1 June 2026 on a monthly interval is
    // due 1 July; at six-monthly the same completion puts it at 1 December. No
    // reload, no reopening the job — the date on screen changes with the save.
    seed([monthlyBoiler()])
    const { user } = launch()

    // Read the date off the job before touching anything, so the assertion
    // after the save is a change and not a coincidence.
    await user.click(await screen.findByRole('button', { name: 'Boiler service' }))
    expect(await screen.findByText('Next due 1 July 2026')).toBeTruthy()

    await user.click(await screen.findByRole('button', { name: 'Edit job' }))
    await screen.findByRole('heading', { name: 'Edit job', level: 2 })
    await user.clear(countField())
    await user.type(countField(), '6')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Next due 1 December 2026')).toBeTruthy()
    expect(screen.queryByText('Next due 1 July 2026')).toBeNull()
  })

  it('keeps every completion already recorded', async () => {
    // FR-008. The history is the thing the spec says is "worth being able to
    // prove", and an edit is not a licence to discard it.
    seed([
      anItem({
        name: 'Boiler service',
        interval: MONTHLY,
        completions: [aCompletion('2024-05-06'), aCompletion('2025-05-11'), aCompletion('2026-06-01')],
      }),
    ])
    const { user } = launch()

    await openTheEditForm(user)
    await user.clear(nameField())
    await user.type(nameField(), 'Boiler')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByRole('heading', { name: 'Boiler', level: 2 })

    expect(storedJob()?.completions.map((c) => c.id)).toEqual([
      'cmp_2024-05-06',
      'cmp_2025-05-11',
      'cmp_2026-06-01',
    ])
    // And the user can see it, not only the storage layer.
    expect(
      within(screen.getByRole('list', { name: /history/i }))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['1 June 2026', '11 May 2025', '6 May 2024'])
  })

  it('still shows the change after the app is closed and reopened', async () => {
    // The edit has to reach storage, not just React state. Unmounting and
    // rendering again against the same localStorage is what "closed the app and
    // came back" means here, as in reload.test.tsx.
    seed([monthlyBoiler()])
    const { user, unmount } = launch()

    await openTheEditForm(user)
    await user.clear(countField())
    await user.type(countField(), '6')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByText('Next due 1 December 2026')

    unmount()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Boiler service' }))
    expect(await screen.findByText('Next due 1 December 2026')).toBeTruthy()
  })

  it('offers no way to rewrite history from the edit form', async () => {
    // FR-009 covers the name and the interval. A completion is immutable once
    // saved (spec, Key Entities), so a "last done" field here would either be a
    // lie or a second way to edit history — and the history list is where a
    // wrong entry gets removed.
    seed([monthlyBoiler()])
    const { user } = launch()

    await openTheEditForm(user)

    expect(screen.queryByLabelText(/last done/i)).toBeNull()
  })

  it('leaves everything alone when the edit is cancelled', async () => {
    seed([monthlyBoiler()])
    const { user } = launch()

    await openTheEditForm(user)
    await user.clear(nameField())
    await user.type(nameField(), 'Something else entirely')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(await screen.findByRole('heading', { name: 'Boiler service', level: 2 })).toBeTruthy()
    expect(storedJob()?.name).toBe('Boiler service')
  })
})

/**
 * The same edit, rendered the way `main.tsx` renders the app.
 *
 * A bug that duplicated every job the user added shipped past 136 passing tests
 * because no test used StrictMode: React double-invokes state updaters there to
 * prove they are pure, the second call hit the compare-and-swap, and the
 * stale-write recovery re-applied a change that had already landed. The screen
 * showed one job; storage held two, and the user found out on the next reload.
 *
 * So an edit is checked against storage, under StrictMode, or it is not checked.
 */
describe('correcting a job under StrictMode', () => {
  it('leaves one job with the new name, not two', async () => {
    seed([monthlyBoiler()])
    const { user } = launch(true)

    await openTheEditForm(user)
    await user.clear(nameField())
    await user.type(nameField(), 'Boiler service and flue check')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByRole('heading', { name: 'Boiler service and flue check', level: 2 })

    expect(load().document.items).toHaveLength(1)
    expect(storedJob()?.name).toBe('Boiler service and flue check')
    // A re-applied rename is idempotent, so a duplicated *completion* is how the
    // same fault would show itself here.
    expect(storedJob()?.completions).toHaveLength(1)
  })

  it('writes the document once for one save', async () => {
    // Seeding writes revision 1, so one save leaves 2. A 3 means the document
    // was written twice: harmless for a rename, but it moves the number the
    // compare-and-swap is checked against, which sends any other open window
    // into stale-write recovery over a change it had already seen.
    seed([monthlyBoiler()])
    const { user } = launch(true)

    await openTheEditForm(user)
    await user.clear(countField())
    await user.type(countField(), '6')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByText('Next due 1 December 2026')

    expect(load().document.revision).toBe(2)
  })
})
