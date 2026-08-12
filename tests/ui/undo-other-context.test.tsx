import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'
import { load, save } from '../../src/storage/repository'
import type { StoredDocument } from '../../src/storage/schema'
import { MONTHLY, YEARLY, aCompletion, anItem, seed } from './seed'

/**
 * T105 — pressing a standing undo offer after another window has saved
 * something (FR-007, FR-007a, FR-010a).
 *
 * **The shape.** The user ticks Boiler service off and the offer appears. A
 * second same-origin context — the installed app and an ordinary browser tab
 * are both routinely open, which is how you install the site in the first
 * place — then records Smoke alarms. This app never hears about it, and the
 * Undo button stays on screen still naming Boiler service. Then it is pressed.
 *
 * **What is load-bearing and was untested.** `undoLast` re-derives the newest
 * completion from freshly read storage inside the change function and refuses
 * unless its id is the one the offer named. Delete that comparison and the
 * suite still passed 209 of 209, while a probe showed the button labelled "Undo
 * recording Boiler service as done" deleting *Smoke alarms'* entry — a job the
 * user had not touched, written by a context this one cannot see. There is no
 * export and no backup, so that is data loss, and the first test below is
 * shaped to fail against exactly that deletion.
 *
 * **What is missing and is described here for the first time.** That refusal is
 * currently a silent no-op. The offer vanishes exactly as it does after a
 * successful undo, nothing changes, and the user is told nothing — so they walk
 * away believing their tick-off was taken back when it was not, and find out on
 * the next reload if at all. FR-010a legislates against precisely this ("a
 * control that appears usable but silently does nothing MUST NOT be shown"),
 * and `useSchedule` already argues in its own comments that "a control that
 * visibly does nothing when pressed reads as a fault" — then applies the
 * reasoning only to the expired-window case. The second and third tests are
 * test-first for T105b and are expected to fail until it is implemented.
 *
 * **Why a direct `save()` from the test is a fair model of a second tab.** The
 * `storage` event does not fire in the context that did the writing, and jsdom
 * has only one document, so nothing dispatches it here. That is not a
 * limitation being worked around — it is the case under test. The running app
 * genuinely does not know, which is the only way the offer can still be
 * standing when its target is no longer the newest entry. A test that fired a
 * storage event would make the app reload and withdraw the offer, and there
 * would be nothing left to press.
 *
 * Everything renders inside `<StrictMode>` and asserts the **stored** document
 * as well as the screen, for the reason recorded in `complete.test.tsx`: a bug
 * that duplicated every job the user added shipped past 136 passing tests
 * because no test did either.
 *
 * **Guarding against vacuity.** Two of the four tests assert that nothing was
 * deleted, which an app with no undo at all would satisfy. The first test in
 * the file is a live positive control on the same setup minus the second
 * context: the press removes exactly the tick-off it named. Every absence
 * assertion below is also paired with the whole stored history of both jobs, so
 * an implementation that "refused" by throwing the entry away fails rather than
 * passes.
 *
 * What this file cannot establish. A second *process* — the installed PWA and
 * Safari really running side by side, with a real `storage` event and real
 * interleaving — is not something jsdom can produce; this is one document
 * making two writes in a known order. Whether the notice is legible, is
 * announced by VoiceOver when it appears, or survives the app being
 * backgrounded mid-press are real-device questions and belong to the manual
 * checklist in `plan.md`.
 */
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0)) // Saturday 8 August 2026, local
})
afterEach(() => vi.useRealTimers())

function launch() {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const app = render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  return { user, app }
}

/** Let the mocked clock run forward and let React react to it. */
async function timePasses(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

/** Comfortably inside the ten-second window, so the window is never what refuses. */
const SOON_AFTER_MS = 1_000

const undoControl = () => screen.queryByRole('button', { name: /undo/i })

/**
 * The undo control, but only if it is offering to take back *that* job's
 * tick-off. Which job the offer names is the difference between a way back from
 * what the user just did and an offer to delete somebody else's entry, and the
 * accessible name is where a user meets that difference.
 */
const undoControlFor = (jobName: string) =>
  screen.queryByRole('button', { name: new RegExp(`undo recording ${jobName} as done`, 'i') })

const markDone = (jobName: string) =>
  screen.getByRole('button', { name: new RegExp(`mark done.*${jobName}`, 'i') })

/** Every tick-off in storage, as job name → the dates recorded against it. */
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
 * A write made by somebody other than the app under test.
 *
 * Goes through the same repository the app uses, against the document as it is
 * on disk right now, which is what a second tab does. It bumps `revision` and
 * dispatches nothing, so the running app carries on with the state it had.
 *
 * Returns the document as written — what that context would be holding
 * afterwards, and therefore what it would base its *next* write on. The last
 * test needs that.
 */
function anotherContextRecords(
  jobName: string,
  completedOn: string,
  basedOn?: StoredDocument,
): StoredDocument {
  const current = basedOn ?? load().document
  const completion = {
    id: `cmp_other_${jobName}_${completedOn}`,
    completedOn,
    recordedAt: new Date().toISOString(),
  }
  return save({
    ...current,
    items: current.items.map((item) =>
      item.name === jobName
        ? { ...item, completions: [...item.completions, completion] }
        : item,
    ),
  })
}

/** Boiler service and Smoke alarms, each with one tick-off already recorded. */
const twoJobs = () => [
  anItem({
    id: 'itm_a',
    name: 'Boiler service',
    interval: YEARLY,
    completions: [aCompletion('2026-06-01')],
  }),
  anItem({
    id: 'itm_b',
    name: 'Smoke alarms',
    interval: MONTHLY,
    completions: [aCompletion('2026-07-08')],
  }),
]

/** The history the two jobs have once Boiler service has been ticked off today. */
const AFTER_THE_TICK_OFF = {
  'Boiler service': ['2026-06-01', '2026-08-08'],
  'Smoke alarms': ['2026-07-08'],
}

/**
 * Get the app into the state all three of the later tests press from: an undo
 * offer standing for Boiler service, whose completion is no longer the newest
 * in storage because another context has since recorded Smoke alarms.
 *
 * Shared because writing it out four times would make the tests differ in the
 * setup as often as in what they assert, and it is the setup that has to be
 * identical for the three of them to be about the same press.
 *
 * The button is captured *before* the press and handed back, because a correct
 * implementation takes the control off the screen when it refuses — the
 * assertions are about what the press does, not about finding the button again
 * afterwards.
 */
async function aStandingOfferOvertakenByAnotherContext() {
  seed(twoJobs())
  const { user } = launch()
  await screen.findByText('Boiler service')

  await user.click(markDone('Boiler service'))
  const undo = undoControlFor('Boiler service')
  expect(undo, 'no undo offer for the job just ticked off — nothing to press').not.toBeNull()
  expect(storedHistoryByJob()).toEqual(AFTER_THE_TICK_OFF)

  // A gap, so which entry is newest is decided by the mocked clock rather than
  // by how fast the machine running this happens to be. Well inside the window,
  // so it is never the ten seconds that refuses the press below.
  await timePasses(SOON_AFTER_MS)
  const otherContextsDocument = anotherContextRecords('Smoke alarms', '2026-08-08')

  // The precondition the whole file rests on, asserted rather than assumed. If
  // the other context's entry were not the newest, the app would still be
  // offering the entry it named, the guard would never be consulted, and these
  // tests would pass while checking nothing.
  expect(
    recordedAtOf('Smoke alarms', '2026-08-08') > recordedAtOf('Boiler service', '2026-08-08'),
    'the other context did not end up with the newest entry, so the press is not blocked at all',
  ).toBe(true)

  // And the offer is still there, naming Boiler service. Same reason: without
  // this, an app that withdrew the offer on its own would make the press below
  // a click on a stale reference and the tests vacuous.
  expect(undoControlFor('Boiler service')).not.toBeNull()

  return { user, undo: undo!, otherContextsDocument }
}

describe('undo takes back the tick-off it named, and only that one', () => {
  it('removes exactly the entry the offer named when nothing else has been saved', async () => {
    // The live positive control for this file. Every other test here ends in
    // "nothing was deleted", which an app that had lost undo entirely would
    // satisfy. This one fails against such an app, and against one that deletes
    // the wrong entry.
    seed(twoJobs())
    const { user } = launch()
    await screen.findByText('Boiler service')

    await user.click(markDone('Boiler service'))
    expect(storedHistoryByJob()).toEqual(AFTER_THE_TICK_OFF)

    await user.click(undoControlFor('Boiler service')!)

    expect(storedHistoryByJob()).toEqual({
      'Boiler service': ['2026-06-01'],
      'Smoke alarms': ['2026-07-08'],
    })
    expect(undoControl()).toBeNull()
  })

  it('deletes nothing from either job when another window has saved since', async () => {
    // T105a. The regression guard for the deletion the probe found: a button
    // labelled "Undo recording Boiler service as done" removing Smoke alarms'
    // entry instead, because `undoLast` removes whatever is newest at the moment
    // of writing and the newest thing is now somebody else's.
    //
    // Asserted against storage for both jobs at once. The screen cannot show
    // this: the rows carry due dates rather than histories, and a deleted
    // completion for Smoke alarms only becomes visible as a due date the user
    // has no reason to have memorised. The single-job history helpers elsewhere
    // in the suite cannot see it either, which is part of why it went untested.
    const { user, undo } = await aStandingOfferOvertakenByAnotherContext()

    await user.click(undo)

    expect(storedHistoryByJob()).toEqual({
      // The user's own tick-off is still there. It was not taken back, and the
      // next test is about the app saying so.
      'Boiler service': ['2026-06-01', '2026-08-08'],
      // And the other context's entry, which this app was never entitled to
      // touch, is untouched.
      'Smoke alarms': ['2026-07-08', '2026-08-08'],
    })
  })
})

describe('a press that cannot be honoured says so', () => {
  it('tells the user the tick-off is still recorded and nothing was taken back', async () => {
    // T105b, and this is test-first: the message does not exist yet.
    //
    // **Why silence is a defect rather than a rough edge.** The user pressed
    // Undo. The offer disappeared, exactly as it does after a successful undo.
    // Nothing else on screen changed, because nothing on screen shows a history.
    // Every signal they have says the tick-off was taken back, and it was not.
    // They find out on the next reload, or never. FR-010a exists for this class
    // of thing, and FR-006a already requires the app to speak up when a tap
    // leaves the schedule where it was.
    //
    // Matched by role and by content a user would actually read: the name of
    // the job the offer was for, plus stable fragments of the sentence. Not the
    // string character for character, and not a class name or a DOM shape —
    // pinning those would make the test a defect under Principle III and would
    // block rewording the notice, which is likely.
    const { user, undo } = await aStandingOfferOvertakenByAnotherContext()

    await user.click(undo)

    // The dead offer goes, as it does today. Stated first so it is clear this
    // test is not asking for the button to stay: it is asking for something to
    // take its place.
    expect(undoControl()).toBeNull()

    const alerts = screen.queryAllByRole('alert').map((el) => el.textContent ?? '')
    const notice = alerts.find((text) => text.includes('Boiler service'))
    expect(
      notice,
      'the press was refused in silence: no role="alert" naming the job the offer was for. ' +
        `Alerts on screen: ${JSON.stringify(alerts)}`,
    ).toBeDefined()

    // What it has to say, in the two parts the user needs: their tick-off
    // survived, and the reason it survived is not that the app failed.
    expect(notice).toMatch(/still recorded/i)
    expect(notice).toMatch(/nothing was taken back/i)
  })

  it('leaves the other window able to save its next change', async () => {
    // T105b, second half, and also test-first.
    //
    // **Why this is behaviour and not bookkeeping.** The refused press still
    // calls through to a save — the change function returns the items it was
    // given, unchanged, and the document is written back anyway. `revision`
    // goes up for a write with no content in it. The consequence lands on the
    // *other* context: it is holding the document it last wrote, its next save
    // is compared against a revision that has moved for no reason, and it is
    // sent into stale-write recovery over nothing. That recovery exists for a
    // genuine race, where re-applying on top of somebody's real change is the
    // right answer; spending it on a phantom is how a real conflict later gets
    // treated as routine.
    //
    // Written as the consequence rather than as `expect(revision).toBe(n)`.
    // `revision` is part of the persistence contract that `tests/storage/`
    // already treats as caller-facing, so asserting it would not have been
    // illegitimate — but "the other window's next save still works" is the thing
    // anyone would care about, and it survives a change to how the compare-and-
    // swap is implemented.
    const { user, otherContextsDocument } = await aStandingOfferOvertakenByAnotherContext()

    await user.click(undoControlFor('Boiler service')!)

    // The other context now saves the next thing its user did, on top of the
    // document it last saw — which is still current, because the refused press
    // should have written nothing.
    expect(() =>
      anotherContextRecords('Smoke alarms', '2026-08-07', otherContextsDocument),
    ).not.toThrow()

    // And it landed, rather than the call merely not throwing.
    expect(storedHistoryByJob()).toEqual({
      'Boiler service': ['2026-06-01', '2026-08-08'],
      'Smoke alarms': ['2026-07-08', '2026-08-08', '2026-08-07'],
    })
  })
})
