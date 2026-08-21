import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'
import { load } from '../../src/storage/repository'
import { MONTHLY, YEARLY, aCompletion, anItem, seed } from './seed'

/**
 * T103 — removing one completion from a job's history, from the detail view.
 *
 * **Why this exists.** A tick-off made by mistake is permanent ten seconds
 * after it is made. Undo is scoped to the session that recorded it and to a
 * short window (FR-007), which is correct and is not changing; US3's delete
 * removes the whole job with all of its history, which corrects one wrong row
 * by destroying every right one. So today a mis-tap leaves two things wrong and
 * no way to put either right: the next due date has moved a full interval, so
 * an annual service drops off the list for a year (FR-013), and the history now
 * records work that never happened (FR-008). There is no export and no backup,
 * so that is fabricated data with no correction path. FR-007a's closing
 * sentence — "correcting an older mistake is done from the item's history, not
 * from the undo offer" — is false until this exists.
 *
 * **Why the confirmation gets as much attention here as it does in
 * `delete.test.tsx`.** Removing an entry is irreversible in the same way, and
 * it has a consequence deleting a job does not: the schedule moves. Whether it
 * moves, and where to, depends on which entry was picked, so the dialog has
 * three different sentences and picking the wrong one tells the user something
 * untrue about their own schedule. That is behaviour, and it is asserted as the
 * dialog's accessible *description*, which is what actually reaches a
 * screen-reader user.
 *
 * **What this file cannot check.**
 *   - Whether VoiceOver announces the dialog, confines the rotor to it, or
 *     reads the consequence before the buttons. `role="dialog"` and `inert` are
 *     instructions to a screen reader, not evidence about one; constitution
 *     v1.4.0 makes VoiceOver on a real iPhone the check that discharges the
 *     accessibility gate.
 *   - Contrast and focus visibility: jsdom resolves no cascaded colour.
 *   - Touch-target size and spacing, which matter more here than anywhere else
 *     in the app — this puts a destructive control on every row of a list that
 *     grows without limit, and the rows are close together. jsdom reports a
 *     zero-sized box for every element, so no check written here could tell
 *     44x44 from 4x4. It belongs on the device checklist in `plan.md`.
 *   - Whether a user can tell two same-day entries apart. Two completions on
 *     one date produce two controls with the same accessible name, and this
 *     file works around that with `getAllByRole` rather than pretending it is
 *     solved; see the note on the tied-date tests below.
 */
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0))
})
afterEach(() => vi.useRealTimers())

// The control the user sees: visible "Remove", with the rest of the accessible
// name carried in a visually-hidden span — the pattern `ItemRow` and
// `UndoNotice` already use, so the accessible name still contains the visible
// text (WCAG 2.5.3).
const REMOVE_MIDDLE = 'Remove the completion on 5 June 2025'
const REMOVE_NEWEST = 'Remove the completion on 1 June 2026'

const NO_WAY_BACK = 'This app has no backup and no export, so the entry cannot be got back.'

const movesBackTo = (date: string, status: string) =>
  'The next due date is worked out from the last completion, so removing this moves it back to ' +
  `${date} and the job will show as ${status}. ${NO_WAY_BACK}`

const leavesItAt = (date: string, status: string) =>
  'The next due date is worked out from the last completion, so removing this leaves it at ' +
  `${date} and the job still shows as ${status}. ${NO_WAY_BACK}`

const ONLY_ONE =
  'This is the only completion recorded, so this job loses its next due date and will show as ' +
  `Never done. ${NO_WAY_BACK}`

/** Boiler service, done three times. Next due 1 June 2027 — Scheduled today. */
const threeTimes = () =>
  anItem({
    id: 'itm_boiler',
    name: 'Boiler service',
    interval: YEARLY,
    completions: [
      aCompletion('2024-05-06', { id: 'cmp_oldest' }),
      aCompletion('2025-06-05', { id: 'cmp_middle' }),
      aCompletion('2026-06-01', { id: 'cmp_newest' }),
    ],
  })

const doneOnce = () =>
  anItem({
    id: 'itm_boiler',
    name: 'Boiler service',
    interval: YEARLY,
    completions: [aCompletion('2026-06-01', { id: 'cmp_only' })],
  })

const neverDone = () =>
  anItem({ id: 'itm_boiler', name: 'Boiler service', interval: YEARLY })

const launch = (strict = false) => ({
  user: userEvent.setup({ advanceTimers: vi.advanceTimersByTime }),
  ...render(strict ? <StrictMode><App /></StrictMode> : <App />),
})

async function open(user: ReturnType<typeof userEvent.setup>, job = 'Boiler service') {
  await user.click(await screen.findByRole('button', { name: job }))
}

async function askToRemove(user: ReturnType<typeof userEvent.setup>, control: string) {
  await user.click(await screen.findByRole('button', { name: control }))
  return screen.getByRole('dialog')
}

/** What is actually saved, which is the part with no other copy anywhere. */
const storedIds = (itemId = 'itm_boiler') =>
  load().document.items.find((item) => item.id === itemId)?.completions.map((c) => c.id) ?? []

/**
 * Every history entry's own control, as a user finds them.
 *
 * The history is read back through these rather than through the rows' text,
 * because each row now contains a button whose accessible name repeats the
 * date, and comparing raw `textContent` would be comparing markup rather than
 * what a user is offered.
 */
const removeControls = () => screen.queryAllByRole('button', { name: /^Remove the completion on/ })

describe('removing one completion from a job’s history', () => {
  it('offers a way to remove each entry, and has removed nothing by the time it asks', async () => {
    seed([threeTimes()])
    const { user } = launch()
    await open(user)

    // One control per entry, not one control for the list.
    expect(removeControls()).toHaveLength(3)

    await askToRemove(user, REMOVE_MIDDLE)

    expect(screen.getByRole('dialog', { name: 'Remove the completion on 5 June 2025?' })).toBeTruthy()
    // Storage, at the moment the question is on screen. The dialog is the only
    // safeguard there is, so a removal that has already happened behind it
    // would make the question theatre.
    expect(storedIds()).toEqual(['cmp_oldest', 'cmp_middle', 'cmp_newest'])
  })

  it('says where the due date moves back to, and what the job will then show as', async () => {
    // Sentence A. This is the case the whole task exists for: the wrong entry
    // is the newest, so it is the one holding the schedule up, and removing it
    // drops the job back into Overdue. Saying "this cannot be undone" and
    // stopping there would leave out the only consequence the user cares about.
    seed([threeTimes()])
    const { user } = launch()
    await open(user)

    await askToRemove(user, REMOVE_NEWEST)

    expect(
      screen.getByRole('dialog', {
        name: 'Remove the completion on 1 June 2026?',
        description: movesBackTo('5 June 2026', 'Overdue'),
      }),
    ).toBeTruthy()
  })

  it('uses the badge’s own words when the job lands exactly on today', async () => {
    // The status word in the sentence is the word the badge will show, so it
    // has to be "Due today" and not "due" or "Due". A sentence that names a
    // state the screen never displays is a different kind of wrong from a
    // sentence that is merely terse.
    seed([
      anItem({
        id: 'itm_boiler',
        name: 'Boiler service',
        interval: YEARLY,
        completions: [
          aCompletion('2025-08-08', { id: 'cmp_year_ago' }),
          aCompletion('2026-06-01', { id: 'cmp_newest' }),
        ],
      }),
    ])
    const { user } = launch()
    await open(user)

    await askToRemove(user, REMOVE_NEWEST)

    expect(
      screen.getByRole('dialog', { description: movesBackTo('8 August 2026', 'Due today') }),
    ).toBeTruthy()
  })

  it('says plainly when the job is left with no due date at all', async () => {
    // Sentence B. Talking about where the due date "moves back to" would be
    // false here — there is nowhere for it to go — and a confirmation that says
    // something untrue teaches the user that these dialogs are boilerplate.
    seed([doneOnce()])
    const { user } = launch()
    await open(user)

    await askToRemove(user, REMOVE_NEWEST)

    expect(
      screen.getByRole('dialog', {
        name: 'Remove the completion on 1 June 2026?',
        description: ONLY_ONE,
      }),
    ).toBeTruthy()
  })

  it('says when the due date does not move, rather than implying it does', async () => {
    // Sentence C. Removing an older entry corrects the record and changes
    // nothing about the schedule. FR-006a already establishes that an unmoved
    // schedule has to be stated rather than left silent, because a tap that
    // appears to do nothing reads as a fault; the same holds for a warning that
    // threatens a move that will not happen.
    seed([threeTimes()])
    const { user } = launch()
    await open(user)

    await askToRemove(user, REMOVE_MIDDLE)

    expect(
      screen.getByRole('dialog', { description: leavesItAt('1 June 2027', 'Scheduled') }),
    ).toBeTruthy()
  })

  it('says the due date does not move when another entry shares the same date', async () => {
    // Two entries on one day — which is one of the ways this mistake gets made
    // in the first place, the job ticked off twice. The removed entry is the
    // top of the history list *and* is dated the same day as the newest, so an
    // implementation that picked its sentence by position in the list, or by
    // asking "is this entry's date the job's last-completed date", says the due
    // date is about to move. It is not: the twin is still there holding it.
    // The branch has to come from comparing the due date before and after.
    //
    // Both controls carry the same accessible name, because both entries are
    // dated 5 June 2025. `getAllByRole` is how this file works with that, not
    // an endorsement of it: a screen-reader user meeting two identically named
    // destructive controls cannot tell which row they are on. Flagged for the
    // device tier rather than papered over here.
    seed([
      anItem({
        id: 'itm_boiler',
        name: 'Boiler service',
        interval: YEARLY,
        completions: [
          aCompletion('2024-05-06', { id: 'cmp_oldest' }),
          aCompletion('2025-06-05', { id: 'cmp_tied_early', recordedAt: '2025-06-05T12:00:00.000Z' }),
          aCompletion('2025-06-05', { id: 'cmp_tied_late', recordedAt: '2026-01-10T09:00:00.000Z' }),
        ],
      }),
    ])
    const { user } = launch()
    await open(user)

    const controls = await screen.findAllByRole('button', { name: REMOVE_MIDDLE })
    await user.click(controls[0]!)

    expect(
      screen.getByRole('dialog', { description: leavesItAt('5 June 2026', 'Overdue') }),
    ).toBeTruthy()
  })

  it('says the due date does not move when the older-recorded twin is the one removed', async () => {
    // The other half of the tie, reached by the second control. Same answer,
    // and it has to be the same answer for the same reason.
    seed([
      anItem({
        id: 'itm_boiler',
        name: 'Boiler service',
        interval: YEARLY,
        completions: [
          aCompletion('2024-05-06', { id: 'cmp_oldest' }),
          aCompletion('2025-06-05', { id: 'cmp_tied_early', recordedAt: '2025-06-05T12:00:00.000Z' }),
          aCompletion('2025-06-05', { id: 'cmp_tied_late', recordedAt: '2026-01-10T09:00:00.000Z' }),
        ],
      }),
    ])
    const { user } = launch()
    await open(user)

    const controls = await screen.findAllByRole('button', { name: REMOVE_MIDDLE })
    await user.click(controls[1]!)

    expect(
      screen.getByRole('dialog', { description: leavesItAt('5 June 2026', 'Overdue') }),
    ).toBeTruthy()
  })

  /**
   * Two entries dated the same day, and which one actually goes.
   *
   * **The two tests above press both twins and cannot tell them apart**, which
   * verification found by sabotage after this file first went green. They only
   * read the dialog's consequence sentence, and that sentence is *identical*
   * for both twins by design — the schedule does not move whichever one is
   * removed. So the two tests that look like they cover ties were the two that
   * could not: rewiring the control to always select the first entry sharing
   * its row's date left all 294 tests passing, while pressing the lower control
   * removed the wrong row.
   *
   * That is the case this whole feature exists for. Ticking a job off twice in
   * one day is one of the commonest ways the mistake gets made, and "I removed
   * one and the wrong one went" is indistinguishable on screen from "it
   * worked", because the remaining row shows the same date.
   *
   * So these two confirm the removal and read storage back, by id. Between them
   * they pin that each control removes its own row rather than whichever twin
   * the implementation happens to find first.
   *
   * History renders newest-first with `recordedAt` breaking the tie, so the
   * lately-recorded twin is the upper control and the early one is below it.
   */
  const twins = () =>
    anItem({
      id: 'itm_boiler',
      name: 'Boiler service',
      interval: YEARLY,
      completions: [
        aCompletion('2024-05-06', { id: 'cmp_oldest' }),
        aCompletion('2025-06-05', { id: 'cmp_tied_early', recordedAt: '2025-06-05T12:00:00.000Z' }),
        aCompletion('2025-06-05', { id: 'cmp_tied_late', recordedAt: '2026-01-10T09:00:00.000Z' }),
      ],
    })

  it('removes the upper of two entries dated the same day, when that is the one pressed', async () => {
    seed([twins()])
    const { user } = launch()
    await open(user)

    const controls = await screen.findAllByRole('button', { name: REMOVE_MIDDLE })
    await user.click(controls[0]!)
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove permanently' }),
    )

    await waitFor(() => expect(screen.getAllByRole('button', { name: REMOVE_MIDDLE })).toHaveLength(1))
    // The lately-recorded twin was on top, so it is the one that goes.
    expect(storedIds()).toEqual(['cmp_oldest', 'cmp_tied_early'])
  })

  it('removes the lower of two entries dated the same day, when that is the one pressed', async () => {
    seed([twins()])
    const { user } = launch()
    await open(user)

    const controls = await screen.findAllByRole('button', { name: REMOVE_MIDDLE })
    await user.click(controls[1]!)
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove permanently' }),
    )

    await waitFor(() => expect(screen.getAllByRole('button', { name: REMOVE_MIDDLE })).toHaveLength(1))
    // The other twin, and only it. An implementation that selected the first
    // entry matching the row's date would take `cmp_tied_late` here instead.
    expect(storedIds()).toEqual(['cmp_oldest', 'cmp_tied_late'])
  })

  it('removes the entry when it is confirmed, and moves the schedule with it', async () => {
    // The screen and the stored document, both. In the duplicate-job bug the
    // screen was right and storage was wrong, and the user found out on the
    // next reload — with no export, what is stored is the part that matters.
    seed([threeTimes()])
    const { user } = launch()
    await open(user)
    expect(screen.getByText('Scheduled')).toBeTruthy()

    const dialog = await askToRemove(user, REMOVE_NEWEST)
    await user.click(within(dialog).getByRole('button', { name: 'Remove permanently' }))

    expect(await screen.findByText('Next due 5 June 2026')).toBeTruthy()
    expect(screen.queryByRole('button', { name: REMOVE_NEWEST })).toBeNull()
    expect(removeControls()).toHaveLength(2)
    expect(storedIds()).toEqual(['cmp_oldest', 'cmp_middle'])
    // The due date moved backwards past today, which is the correction being
    // made: an annual service that had dropped off the list for a year is on it
    // again.
    expect(screen.getByText('Overdue')).toBeTruthy()
    expect(screen.queryByText('Scheduled')).toBeNull()
  })

  it('removes the entry that was named, not the newest one', async () => {
    // Removing the middle of three, asserted by id and in order. An
    // implementation that dropped `completions[0]`, or that reused
    // `undoCompletion`'s newest-by-`recordedAt` rule, leaves a different pair.
    seed([threeTimes()])
    const { user } = launch()
    await open(user)

    const dialog = await askToRemove(user, REMOVE_MIDDLE)
    await user.click(within(dialog).getByRole('button', { name: 'Remove permanently' }))

    // The row the user pointed at is the row that went; the other two stand.
    await waitFor(() => expect(screen.queryByRole('button', { name: REMOVE_MIDDLE })).toBeNull())
    expect(screen.getByRole('button', { name: REMOVE_NEWEST })).toBeTruthy()
    expect(storedIds()).toEqual(['cmp_oldest', 'cmp_newest'])
  })

  it('does not go by when the entry was recorded', async () => {
    // A backdated entry has a late `recordedAt` and an early `completedOn`, so
    // it sits at the bottom of the history and at the front of undo's queue.
    // The user points at the 2025 row; the 2020 row must survive. This is the
    // one case where "reuse undo" and "remove what was asked for" disagree, and
    // plan.md § Data model calls backdating normal.
    seed([
      anItem({
        id: 'itm_boiler',
        name: 'Boiler service',
        interval: YEARLY,
        completions: [
          aCompletion('2025-06-05', { id: 'cmp_seen', recordedAt: '2025-06-05T12:00:00.000Z' }),
          aCompletion('2020-01-01', { id: 'cmp_backdated', recordedAt: '2026-08-01T10:00:00.000Z' }),
        ],
      }),
    ])
    const { user } = launch()
    await open(user)

    const dialog = await askToRemove(user, REMOVE_MIDDLE)
    await user.click(within(dialog).getByRole('button', { name: 'Remove permanently' }))

    // The design pass merged "last done" into the interval sentence, so it now
    // reads "Every year · last done 1 January 2020" and is no longer its own
    // element. Matching the substring keeps this test about what it is about —
    // that removing the newest completion moves the schedule back to the one
    // before it — rather than about how that sentence is punctuated.
    expect(
      (await screen.findByText(/last done 1 January 2020/i)).textContent,
    ).toMatch(/last done 1 January 2020/i)
    expect(storedIds()).toEqual(['cmp_backdated'])
  })

  it('removes it from the job that was opened, and leaves every other job alone', async () => {
    // **Deliberately the middle of three jobs.** Sabotage has twice found an
    // implementation that ignored the id it was handed — `deleteItem` returning
    // `items.slice(1)` passed all 257 tests, and the edit side had the same
    // hole. Working on the first seeded job cannot tell those apart from a
    // correct one, so this works on the second and reads back all three.
    seed([
      threeTimes(),
      anItem({
        id: 'itm_alarms',
        name: 'Smoke alarms',
        interval: MONTHLY,
        completions: [
          aCompletion('2026-07-01', { id: 'cmp_alarms_jul' }),
          aCompletion('2026-08-01', { id: 'cmp_alarms_aug' }),
        ],
      }),
      anItem({
        id: 'itm_filter',
        name: 'Water filter',
        interval: MONTHLY,
        completions: [aCompletion('2026-05-20', { id: 'cmp_filter' })],
      }),
    ])
    const { user } = launch()
    await open(user, 'Smoke alarms')

    const dialog = await askToRemove(user, 'Remove the completion on 1 July 2026')
    await user.click(within(dialog).getByRole('button', { name: 'Remove permanently' }))

    await waitFor(() => expect(removeControls()).toHaveLength(1))
    expect(storedIds('itm_alarms')).toEqual(['cmp_alarms_aug'])
    expect(storedIds('itm_boiler')).toEqual(['cmp_oldest', 'cmp_middle', 'cmp_newest'])
    expect(storedIds('itm_filter')).toEqual(['cmp_filter'])
  })

  it('leaves the entry exactly where it was when the removal is cancelled', async () => {
    seed([threeTimes()])
    const { user } = launch()
    await open(user)

    const dialog = await askToRemove(user, REMOVE_MIDDLE)
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(removeControls()).toHaveLength(3)
    expect(storedIds()).toEqual(['cmp_oldest', 'cmp_middle', 'cmp_newest'])
  })

  it('leaves the entry alone when the confirmation is dismissed with Escape', async () => {
    seed([threeTimes()])
    const { user } = launch()
    await open(user)

    await askToRemove(user, REMOVE_MIDDLE)
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(storedIds()).toEqual(['cmp_oldest', 'cmp_middle', 'cmp_newest'])
  })

  it('puts focus back on the entry’s own Remove control when the removal is cancelled', async () => {
    // Pinned here, in the app, and not only in `confirm-dialog.test.tsx`. That
    // file drives the dialog through its own harness, which wires it up
    // correctly by construction and so cannot catch the app wiring it up any
    // other way — exactly the hole T107 found on the edit side. Focus falling
    // to <body> silently returns a keyboard or VoiceOver user to the top of the
    // document with nothing to say the dialog closed or that the entry
    // survived, and here there is a further cost: they have to find their place
    // in a history list again to try once more.
    seed([threeTimes()])
    const { user } = launch()
    await open(user)

    const dialog = await askToRemove(user, REMOVE_MIDDLE)
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(document.activeElement).toBe(screen.getByRole('button', { name: REMOVE_MIDDLE }))
  })

  it('puts focus back on the entry’s own Remove control after Escape', async () => {
    // The same rule by the other way out. Escape is what a keyboard user
    // reaches for first, and it closes the dialog by a different path than
    // Cancel does.
    seed([threeTimes()])
    const { user } = launch()
    await open(user)

    await askToRemove(user, REMOVE_MIDDLE)
    await user.keyboard('{Escape}')

    expect(document.activeElement).toBe(screen.getByRole('button', { name: REMOVE_MIDDLE }))
  })

  it('leaves focus somewhere usable once the entry is gone', async () => {
    // The control that opened the dialog went away with the row it lived in, so
    // there is nothing to give focus back to and the dialog's own restore rule
    // cannot fire. Where focus *should* land is a design question; what this
    // view can honestly assert is that it did not fall off the end onto <body>,
    // which is silent and puts the user back at the top of the document.
    seed([threeTimes()])
    const { user } = launch()
    await open(user)

    const dialog = await askToRemove(user, REMOVE_MIDDLE)
    await user.click(within(dialog).getByRole('button', { name: 'Remove permanently' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: REMOVE_MIDDLE })).toBeNull())

    expect(document.activeElement).not.toBe(document.body)
  })

  it('offers nothing to remove on a job with nothing recorded', async () => {
    // No history, so no controls — and the existing empty line still stands
    // rather than being displaced by a list of one useless button.
    seed([neverDone()])
    const { user } = launch()
    await open(user)

    expect(await screen.findByText('No completions recorded yet.')).toBeTruthy()
    expect(screen.queryAllByRole('button', { name: /^Remove/ })).toEqual([])
  })
})

/**
 * Removing an entry is not undoing one, and must not be confused with it.
 *
 * Undo is the way back from *recording* something, in the session that recorded
 * it and for about ten seconds (FR-007). This is a correction to older history,
 * guarded by a confirmation instead. Offering a way back from the way back
 * would either do nothing or walk backwards through history, which FR-007a
 * forbids outright.
 */
describe('removing a completion and the undo offer', () => {
  it('raises no undo offer of its own', async () => {
    seed([threeTimes()])
    const { user } = launch()
    await open(user)

    const dialog = await askToRemove(user, REMOVE_MIDDLE)
    await user.click(within(dialog).getByRole('button', { name: 'Remove permanently' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: REMOVE_MIDDLE })).toBeNull())

    expect(screen.queryByRole('button', { name: /^Undo/ })).toBeNull()
  })

  it('does not bring back an offer for a tick-off recorded earlier in the session', async () => {
    // Two jobs ticked off in quick succession: the offer names the second, and
    // the first is no longer reachable by undo (FR-007a — repeated use must not
    // walk backwards through history). Removing the second job's entry makes
    // the first the newest thing in the schedule again, and an offer must not
    // reappear naming it. The user would be looking at a way back from a tap
    // they made several actions ago, which they have long stopped thinking
    // about, and pressing it would delete a second entry.
    seed([
      threeTimes(),
      anItem({
        id: 'itm_alarms',
        name: 'Smoke alarms',
        interval: MONTHLY,
        completions: [aCompletion('2026-07-08', { id: 'cmp_alarms_jul' })],
      }),
    ])
    const { user } = launch()
    await screen.findByText('Smoke alarms')

    await user.click(screen.getByRole('button', { name: /Mark done.*Boiler service/ }))
    await user.click(screen.getByRole('button', { name: /Mark done.*Smoke alarms/ }))
    // The precondition, asserted rather than assumed: if the ten-second window
    // had run out before we got here the removal below would prove nothing, and
    // this line makes that show up as a failure instead of a false pass.
    expect(screen.getByRole('button', { name: 'Undo recording Smoke alarms as done' })).toBeTruthy()

    await open(user, 'Smoke alarms')
    const dialog = await askToRemove(user, 'Remove the completion on 8 August 2026')
    await user.click(within(dialog).getByRole('button', { name: 'Remove permanently' }))
    await screen.findByText('Next due 8 August 2026')

    expect(screen.queryByRole('button', { name: /^Undo/ })).toBeNull()
  })
})

/**
 * The same removal, rendered the way `main.tsx` renders the app.
 *
 * React double-invokes state updaters under StrictMode to prove they are pure.
 * The last mutation that went untested there duplicated every job the user
 * added — past 136 green tests, because none of them rendered the app as
 * production does and none of them read storage back. The screen showed one
 * job, storage held two, and the user found out on the next reload.
 */
describe('removing a completion under StrictMode', () => {
  it('removes one entry and only one', async () => {
    seed([threeTimes()])
    const { user } = launch(true)
    await open(user)

    const dialog = await askToRemove(user, REMOVE_MIDDLE)
    await user.click(within(dialog).getByRole('button', { name: 'Remove permanently' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: REMOVE_MIDDLE })).toBeNull())

    // By id and in order: a change applied twice — because a second invocation
    // fell into the stale-write recovery — takes a second entry with it if it
    // works by position, and this is the assertion that notices.
    expect(storedIds()).toEqual(['cmp_oldest', 'cmp_newest'])
  })

  it('touches only the job that was opened', async () => {
    seed([
      threeTimes(),
      anItem({
        id: 'itm_alarms',
        name: 'Smoke alarms',
        interval: MONTHLY,
        completions: [
          aCompletion('2026-07-01', { id: 'cmp_alarms_jul' }),
          aCompletion('2026-08-01', { id: 'cmp_alarms_aug' }),
        ],
      }),
      anItem({
        id: 'itm_filter',
        name: 'Water filter',
        interval: MONTHLY,
        completions: [aCompletion('2026-05-20', { id: 'cmp_filter' })],
      }),
    ])
    const { user } = launch(true)
    await open(user, 'Smoke alarms')

    const dialog = await askToRemove(user, 'Remove the completion on 1 July 2026')
    await user.click(within(dialog).getByRole('button', { name: 'Remove permanently' }))
    await waitFor(() => expect(removeControls()).toHaveLength(1))

    expect(storedIds('itm_alarms')).toEqual(['cmp_alarms_aug'])
    expect(storedIds('itm_boiler')).toEqual(['cmp_oldest', 'cmp_middle', 'cmp_newest'])
    expect(storedIds('itm_filter')).toEqual(['cmp_filter'])
  })
})
