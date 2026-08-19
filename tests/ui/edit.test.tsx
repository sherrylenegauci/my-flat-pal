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

/**
 * The interval count box, found by its visible label — "Every" (T115).
 *
 * Anchored on `^every$` rather than the old `/how often/i`, and that is
 * deliberate. The fieldset's legend still asks "How often does it need doing?"
 * and the box borrows it via `aria-labelledby`, so `/how often/i` goes on
 * matching this input either way — it cannot tell the two wordings apart and so
 * cannot be observed failing. `^every$` can.
 *
 * The assertion is here rather than at each of the seven call sites below
 * because the risk is that the query silently starts resolving to the `<select>`
 * next to it, or to the legend. Proving it once, where the lookup lives, is what
 * makes every `countField()` below mean the number box.
 */
const countField = () => {
  const field = screen.getByLabelText(/^every$/i) as HTMLInputElement
  expect(field.tagName).toBe('INPUT')
  expect(field.type).toBe('number')
  return field
}

const unitField = () => screen.getByLabelText(/period/i) as HTMLSelectElement

const storedJob = () => load().document.items[0]
const storedJobs = () => load().document.items

/**
 * Three jobs, all last done 1 June 2026, each on its own interval so that every
 * row in the list carries a date no other row could have produced:
 *
 *   - Smoke alarms, monthly — due 1 July, so overdue on 8 August
 *   - Boiler service, monthly — the one that gets edited
 *   - Water filter, every 3 months — due 1 September, not due yet
 */
const threeJobs = () => [
  anItem({
    id: 'itm_alarms',
    name: 'Smoke alarms',
    interval: MONTHLY,
    completions: [aCompletion('2026-06-01')],
  }),
  anItem({
    id: 'itm_boiler',
    name: 'Boiler service',
    interval: MONTHLY,
    completions: [aCompletion('2026-06-01')],
  }),
  anItem({
    id: 'itm_filter',
    name: 'Water filter',
    interval: { count: 3, unit: 'month' },
    completions: [aCompletion('2026-06-01')],
  }),
]

/** The list row for a job, found by the control that opens it. */
function rowFor(name: string) {
  const row = screen
    .getAllByRole('listitem')
    .find((candidate) => within(candidate).queryByRole('button', { name }) !== null)
  if (row === undefined) throw new Error(`No row in the list for “${name}”`)
  return row
}

/** What a row says about when the job is next due — "Next 1 December 2026". */
const whenDue = (name: string) => within(rowFor(name)).getByText(/^(Was|Next) /).textContent

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

  it('changes only the job that was opened', async () => {
    // **The job edited here is deliberately the middle one of three.** Every
    // other test in this file seeds a single job and reads storage back as
    // `items[0]`, which cannot tell a correct edit from one that ignores the id
    // and rewrites the first item — an `editItem` that did exactly that passed
    // all 257 tests in the suite, verified by sabotage.
    //
    // **The name and the interval are changed in the same edit, and both are
    // asserted for all three jobs.** An implementation that resolved the right
    // item for one field and the wrong item for the other would survive an
    // assertion about either one alone. The period is moved as well as the
    // count, because nothing else in the suite saves a *changed* unit — every
    // other test types a number and leaves the dropdown where it started.
    seed(threeJobs())
    const { user } = launch()

    await openTheEditForm(user)
    await user.clear(nameField())
    await user.type(nameField(), 'Boiler service and flue check')
    await user.clear(countField())
    await user.type(countField(), '2')
    await user.selectOptions(unitField(), 'year')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    // Wait for the form to close without presupposing which job was changed —
    // "Edit job" is on the detail view whatever the save did, so a wrong edit
    // reaches the assertions below rather than timing out short of them.
    await screen.findByRole('button', { name: 'Edit job' })

    // Storage first, in seeded order, and both fields together: this is the
    // assertion that names the defect if the wrong job is edited, and the
    // screen being right while storage holds something else is the shape of the
    // duplicate-job bug — invisible until the next reload, unrecoverable in an
    // app with no export.
    expect(storedJobs().map((item) => item.name)).toEqual([
      'Smoke alarms',
      'Boiler service and flue check',
      'Water filter',
    ])
    expect(storedJobs().map((item) => item.interval)).toEqual([
      { count: 1, unit: 'month' },
      { count: 2, unit: 'year' },
      { count: 3, unit: 'month' },
    ])

    // And on screen: the job that was opened carries both changes...
    expect(
      screen.getByRole('heading', { name: 'Boiler service and flue check', level: 2 }),
    ).toBeTruthy()
    expect(screen.getByText('Next due 1 June 2028')).toBeTruthy()

    // ...while back in the list the other two are untouched, each still on the
    // schedule its own interval gives it.
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(whenDue('Smoke alarms')).toBe('Was 1 July 2026')
    expect(whenDue('Water filter')).toBe('Next 1 September 2026')
    expect(whenDue('Boiler service and flue check')).toBe('Next 1 June 2028')
    expect(screen.queryByRole('button', { name: 'Boiler service' })).toBeNull()
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

  it('still changes only the job that was opened', async () => {
    // Again the middle of three — see the note on the non-StrictMode version.
    // Worth repeating here because the stale-write recovery re-runs the change
    // function against freshly read items, so an edit that resolved its target
    // by position rather than by id would have a second chance to land on the
    // wrong job.
    seed(threeJobs())
    const { user } = launch(true)

    await openTheEditForm(user)
    await user.clear(nameField())
    await user.type(nameField(), 'Boiler service and flue check')
    await user.clear(countField())
    await user.type(countField(), '2')
    await user.selectOptions(unitField(), 'year')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByRole('button', { name: 'Edit job' })

    expect(storedJobs().map((item) => item.name)).toEqual([
      'Smoke alarms',
      'Boiler service and flue check',
      'Water filter',
    ])
    expect(storedJobs().map((item) => item.interval)).toEqual([
      { count: 1, unit: 'month' },
      { count: 2, unit: 'year' },
      { count: 3, unit: 'month' },
    ])
  })
})
