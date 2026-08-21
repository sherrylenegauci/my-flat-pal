import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'
import { load } from '../../src/storage/repository'
import { UNDO_WINDOW_MS } from '../../src/domain/undoWindow'
import { YEARLY, aCompletion, anItem, seed } from './seed'

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
 * **A second block was added later**, for the other half of the rule: an add
 * that arrives while an offer from a tick-off seconds earlier is still standing
 * has to take that offer away, because the date it records is now the newest
 * thing in the schedule and undo can no longer reach past it. Nothing in the
 * suite covered that, and the block says what goes wrong without it.
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
  // The interval count box, by its visible label "Every" (T115). Not
  // `/how often/i`: the legend is borrowed back through `aria-labelledby`, so
  // that regex matches this input under both wordings and can never go red.
  await user.clear(screen.getByLabelText(/^every$/i))
  await user.type(screen.getByLabelText(/^every$/i), fields.count)
  await user.selectOptions(screen.getByLabelText(/period|unit/i), fields.unit)
  if (fields.lastDone !== undefined) {
    await user.type(screen.getByLabelText(/last done/i), fields.lastDone)
  }

  await user.click(screen.getByRole('button', { name: /save|add/i }))
  await screen.findByText(fields.name)
}

const undoControl = () => screen.queryByRole('button', { name: /undo/i })
const storedCompletions = () => load().document.items[0]?.completions ?? []

/** Let the mocked clock run forward and let React react to it. */
async function timePasses(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

/**
 * The undo control, but only if it offers to take back *that* job's tick-off.
 * Which job the offer names is the difference between a way back from what the
 * user just did and an offer to delete something else, and the accessible name
 * is where a user meets that difference.
 */
const undoControlFor = (jobName: string) =>
  screen.queryByRole('button', { name: new RegExp(`undo recording ${jobName} as done`, 'i') })

const markDone = (jobName: string) =>
  screen.getByRole('button', { name: new RegExp(`mark done.*${jobName}`, 'i') })

/**
 * Every tick-off in storage, as job name → the dates recorded against it.
 *
 * The single-item helper above cannot see a completion belonging to the *other*
 * job, and the tests below have two.
 */
const storedHistoryByJob = () =>
  Object.fromEntries(
    load().document.items.map((item) => [item.name, item.completions.map((c) => c.completedOn)]),
  )

/** When a particular tick-off was recorded, read back from storage. */
function recordedAtOf(jobName: string, completedOn: string): string {
  const item = load().document.items.find((candidate) => candidate.name === jobName)
  const completion = item?.completions.find((c) => c.completedOn === completedOn)
  expect(completion, `no ${jobName} completion stored for ${completedOn}`).toBeDefined()
  return completion!.recordedAt
}

/**
 * How much of the ten seconds is left for a given tick-off, right now.
 *
 * Both tests in the last block below turn on the window still being open after
 * a form has been filled in, and the mocked clock here runs with
 * `shouldAdvanceTime`, so however long this machine takes to type into the form
 * is spent out of the ten seconds. That is fine — a form fill is a fraction of
 * a second — but it must not be *assumed*: if it ever stopped being true, one
 * of those tests would start passing for the wrong reason and the other would
 * fail for one. Asserted in both, so either way the message says which.
 */
const windowRemainingFor = (jobName: string, completedOn: string) =>
  Date.parse(recordedAtOf(jobName, completedOn)) + UNDO_WINDOW_MS - Date.now()

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

/**
 * The other half of FR-007b, and the half nothing in the suite covered.
 *
 * Everything above is about the add *not raising* an offer. This block is about
 * an add **taking an offer away** — the case where a tick-off from a moment ago
 * is still standing when the user adds a job carrying a last-done date.
 *
 * **What is unprotected.** `useSchedule` offers undo only when three things
 * hold: the entry is the newest in the whole schedule, it is the one this
 * session recorded, and it is inside the ten-second window. Replace the first
 * with a search for the session-recorded id anywhere in the document — keeping
 * session scope and the window exactly as they are — and all 215 tests pass.
 * Two comments in the source describe that first condition as load-bearing, and
 * one of them rests this very case on it: "adding a job with a last-done date
 * makes that completion the newest, so an offer standing from a tick-off a
 * moment ago is withheld by the check below without help".
 *
 * **Why a stale offer here is worse than a dead button.** Undo removes the
 * newest entry, and after the add the newest entry belongs to the job just
 * added. `undoLast` re-derives it and refuses, correctly, rather than deleting a
 * date the user typed thirty seconds ago. But the refusal it raises says
 * "Something else was saved in another window, so nothing was taken back" —
 * which is false. Nothing was saved in another window. It was this user, in this
 * session, in this window, seconds ago. So the regression is not a button that
 * does nothing; it is the app explaining the user's own data to them wrongly,
 * and pointing at a second window they may not even have open.
 *
 * Driven through the real Add job form for the same reason as the block above:
 * the case is about what the add flow does, and a seeded document never runs it.
 * The job that gets ticked off is seeded, because it is the schedule the user
 * already had rather than part of what is under test.
 */
describe('adding a job with a last-done date', () => {
  it('takes away an undo offer standing from a tick-off moments earlier', async () => {
    seed([
      anItem({
        id: 'itm_a',
        name: 'Boiler service',
        interval: YEARLY,
        completions: [aCompletion('2026-06-01')],
      }),
    ])
    const user = launch()
    await screen.findByText('Boiler service')

    await user.click(markDone('Boiler service'))

    // The positive control, and it is inside this test on purpose: without it
    // the absence assertion below would be satisfied by an app that had lost
    // undo entirely, or by one where `markDone` had quietly stopped recording.
    expect(
      undoControlFor('Boiler service'),
      'no offer after the tick-off, so there is nothing for the add to take away',
    ).not.toBeNull()
    expect(storedHistoryByJob()).toEqual({ 'Boiler service': ['2026-06-01', '2026-08-08'] })

    // A gap, so which entry ends up newest is decided by the mocked clock rather
    // than by how fast the machine running this happens to be.
    await timePasses(1_000)

    await addAJob(user, { name: 'Gutters', count: '1', unit: 'year', lastDone: '2026-06-14' })

    // Two preconditions, asserted rather than hoped for. Without the first the
    // add did not overtake the tick-off and the newest-entry rule is never
    // consulted; without the second the ten seconds have run out and the offer
    // would be gone whatever the rule says. Either would leave the assertion
    // below passing while checking nothing.
    expect(
      recordedAtOf('Gutters', '2026-06-14') > recordedAtOf('Boiler service', '2026-08-08'),
      'the added job’s completion is not the newest, so this is not the case under test',
    ).toBe(true)
    expect(
      windowRemainingFor('Boiler service', '2026-08-08'),
      'the undo window ran out while the form was being filled in, so the window ' +
        'would withhold the offer on its own and this test proves nothing',
    ).toBeGreaterThan(0)

    // The offer is gone, and in particular there is nothing left naming Boiler
    // service — the job whose tick-off undo can no longer reach.
    expect(undoControlFor('Boiler service')).toBeNull()
    expect(undoControl()).toBeNull()

    // And it went by being withheld, not by anything being thrown away: the
    // tick-off is still recorded and so is the date typed into the form. The
    // screen shows due dates rather than histories, so this is only visible in
    // storage.
    expect(storedHistoryByJob()).toEqual({
      'Boiler service': ['2026-06-01', '2026-08-08'],
      Gutters: ['2026-06-14'],
    })
  })

  it('leaves the offer alone when the added job carries no last-done date', async () => {
    // The companion, and the reason the test above cannot be read as "any add
    // cancels undo". An add with no date records nothing, so nothing has
    // overtaken the user's tick-off and there is no reason a way back from it
    // should disappear because they added something unrelated. `useSchedule`
    // argues exactly this in `addItem`.
    //
    // It is also what separates the real rule from the cheap fix. Clearing the
    // session marker inside `addItem` would satisfy the test above and silently
    // break this one, taking undo away from a user who added a job and then
    // wanted their mis-tap back.
    seed([
      anItem({
        id: 'itm_a',
        name: 'Boiler service',
        interval: YEARLY,
        completions: [aCompletion('2026-06-01')],
      }),
    ])
    const user = launch()
    await screen.findByText('Boiler service')

    await user.click(markDone('Boiler service'))
    await timePasses(1_000)

    await addAJob(user, { name: 'Gutters', count: '1', unit: 'year' })

    expect(
      windowRemainingFor('Boiler service', '2026-08-08'),
      'the undo window ran out while the form was being filled in, so the offer is ' +
        'missing for a reason this test is not about',
    ).toBeGreaterThan(0)

    // Still offered, still naming the right job.
    expect(undoControlFor('Boiler service')).not.toBeNull()

    // And still honourable, which the presence of the button does not establish
    // on its own — a press has to reach the tick-off it names.
    await user.click(undoControl()!)

    expect(storedHistoryByJob()).toEqual({
      'Boiler service': ['2026-06-01'],
      Gutters: [],
    })
    expect(undoControl()).toBeNull()
  })
})
