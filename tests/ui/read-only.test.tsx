import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { act, render, screen } from '@testing-library/react'
import { App } from '../../src/ui/App'
import { resetReadOnlyForTests } from '../../src/storage/repository'
import { STORAGE_KEY } from '../../src/storage/schema'
import { YEARLY, aCompletion, anItem, seed } from './seed'

/**
 * T098 — a session holding data from a newer build (FR-010a).
 *
 * The app refuses to save rather than risk damaging a document it cannot fully
 * understand, and FR-010a says the screen must match that: "every control that
 * would change something MUST be hidden or disabled... A control that appears
 * usable but silently does nothing MUST NOT be shown." Today `save` throws
 * `ReadOnlyError`, React does not catch throws from event handlers, and the
 * write controls all still render — so a tap saves nothing and says nothing.
 *
 * **Two things about this environment shape how the tests below are written.**
 *
 * `load()` deliberately returns an empty document for a too-new file: it will
 * not parse a shape it does not understand. So the read-only screen has no rows
 * on it, and asserting "no Mark done button" would be an assertion that cannot
 * fail — there are no jobs for one to belong to. The constitution's Testing
 * Strategy forbids exactly that ("an automated check that cannot actually check
 * the thing MUST NOT be written"), so the shape used here instead is to
 * enumerate **every** control the read-only screen renders and require that none
 * of the live ones is a write control. That fails today on "Add your first job",
 * and it fails in future on any write control that appears, including ones that
 * do not exist yet. Disabled controls are allowed through, because FR-010a
 * accepts hiding *or* disabling and a disabled control does not "appear usable" —
 * pinning one of the two would be this file inventing a requirement.
 *
 * The second thing follows from the first: because the document does not parse,
 * the app renders the empty state, whose heading reads "Nothing recorded yet".
 * That is a claim this build cannot support — the user may well have a full
 * schedule, written by the newer build, that this one refused to read. It is
 * asserted against separately below.
 *
 * **What is still not covered here, and cannot be.** The row-level "Mark done"
 * and the detail view's "Add" never render in a read-only session,
 * because there is nothing to render them for. No test in this tier can
 * exercise them read-only, and no honest one can pretend to. If T099 makes the
 * read-only screen show the user's data — which is the only way to stop the app
 * claiming nothing is recorded — those controls become reachable and will need
 * their own tests then.
 *
 * **The storage warning is covered here rather than in
 * `notice-placement.test.tsx`**, and the reason is which requirement the
 * absence belongs to. That file is about *where* the warning is said, and its
 * answer — the schedule list, nowhere else — is a copy decision. This is not:
 * the read-only screen's contract is that there is nothing on it to press
 * (FR-010a, and `e2e/support/app.ts` declares `noControlsBecause` for the same
 * state and asserts zero controls), and a "Got it" button breaks that contract
 * whatever the sentence above it says. The enumeration that enforces it already
 * lives in this file, so the assertion belongs next to it. It is a separate
 * test rather than an addition to `WRITE_CONTROL`, because that regex
 * deliberately excludes dismissal — "Got it" changes what is displayed, not
 * what is recorded, and widening it would misstate why the button must not be
 * there.
 */
beforeEach(() => {
  localStorage.clear()
  // The flag is module-level and never cleared for the life of a session, so
  // without this every later test in the file inherits read-only state.
  resetReadOnlyForTests()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0))
})
afterEach(() => {
  vi.useRealTimers()
  resetReadOnlyForTests()
  // Two of the tests below answer the persistence question; nothing else in
  // this file does, and a stub left standing would silently change what the
  // others render.
  Reflect.deleteProperty(navigator, 'storage')
})

/**
 * A device that will not promise to keep the user's records.
 *
 * The same stub `persistence-notice.test.tsx` and `notice-placement.test.tsx`
 * use. Without it jsdom answers nothing at all, `requestPersistence` reports
 * `unsupported`, and the notice never renders — so an absence assertion would
 * pass on a screen where the notice could not have appeared for any reason.
 */
function persistenceIsRefused() {
  Object.defineProperty(navigator, 'storage', {
    value: { persisted: async () => false, persist: async () => false },
    configurable: true,
    writable: true,
  })
}

/**
 * Let the persistence question be asked and answered.
 *
 * The notice appears only after a promise chain resolves, so "it is not on the
 * screen" is a claim about timing as much as about the guard. Flushing
 * microtasks inside `act` is deterministic — no timers are involved — so it
 * cannot come out differently on a slow machine. The control test below waits
 * exactly this long and requires the notice to be *there*, which is what stops
 * a flush that was too short turning the absence into a free pass.
 */
const settle = () =>
  act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })

/**
 * A schedule written by a build that knows a schema this one does not.
 *
 * Seeded through storage rather than through the UI, since the UI cannot create
 * this state — there is no way to make today's app write a version it does not
 * itself have.
 */
const NEWER_DOCUMENT = JSON.stringify({
  schemaVersion: 99,
  revision: 7,
  items: [
    {
      id: 'itm_boiler',
      name: 'Boiler service',
      interval: { count: 1, unit: 'year' },
      createdAt: '2024-01-01',
      completions: [{ id: 'cmp_1', completedOn: '2025-05-11', recordedAt: '2025-05-11T12:00:00.000Z' }],
      // Whatever the newer build added. Unknown to this one, and the reason it
      // refuses to parse rather than dropping what it does not recognise.
      remindMeVia: 'sms',
    },
  ],
})

function launch() {
  return render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

/**
 * Anything on screen that would change the user's data if it were used.
 *
 * Navigation ("Back") and the storage-notice dismissal are not in this set: they
 * change what is displayed, not what is recorded.
 */
const WRITE_CONTROL = /\b(add|mark done|undo|record|save|delete|remove|edit)\b/i

/**
 * FR-010a accepts either hiding or disabling, so a control that is present but
 * genuinely disabled is compliant — it does not "appear usable". Only live ones
 * are counted.
 */
const isLive = (el: Element) =>
  !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true'

const name = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()

const liveWriteControls = () =>
  screen
    .queryAllByRole('button')
    .filter(isLive)
    .map(name)
    .filter((label) => WRITE_CONTROL.test(label))

const liveFields = () =>
  [
    ...screen.queryAllByRole('textbox'),
    ...screen.queryAllByRole('spinbutton'),
    ...screen.queryAllByRole('combobox'),
    ...screen.queryAllByRole('checkbox'),
  ].filter((el) => isLive(el) && !el.hasAttribute('readonly'))

describe('a session holding data from a newer build', () => {
  it('says plainly that nothing can be changed', async () => {
    localStorage.setItem(STORAGE_KEY, NEWER_DOCUMENT)
    launch()

    const notice = await screen.findByRole('alert')
    expect(notice.textContent).toMatch(/nothing can be changed/i)
  })

  it('offers no working control that would change anything', async () => {
    localStorage.setItem(STORAGE_KEY, NEWER_DOCUMENT)
    launch()
    await screen.findByRole('alert')

    // Every button on the screen is examined, not a chosen few, so a write
    // control that appears in some future revision of this screen fails here
    // whether or not anyone remembered to add an assertion for it.
    expect(liveWriteControls()).toEqual([])
    // And nothing to type into either: a form field that silently discards what
    // is entered is the same defect wearing different clothes.
    expect(liveFields()).toEqual([])
  })

  it('does not claim that nothing is recorded', async () => {
    // The user may have a full schedule, written by the newer build, which this
    // build declined to read. Telling them it is empty is a claim the app cannot
    // support, and it is frightening in an app with no backup and no export.
    localStorage.setItem(STORAGE_KEY, NEWER_DOCUMENT)
    launch()
    await screen.findByRole('alert')

    expect(screen.queryByText(/nothing recorded yet/i)).toBeNull()
    expect(screen.queryByText(/no completions recorded yet/i)).toBeNull()
  })

  it('does not read exactly like an app with nothing in it', async () => {
    // The assertion above names the words on screen today, which makes its
    // failure message useful but also makes it satisfiable by renaming the empty
    // state for *everyone* — including the genuine first run, where "nothing
    // recorded yet" is true and worth saying. This says the thing that actually
    // matters instead: a session that refused to read the user's schedule must
    // not be indistinguishable from a session that has no schedule.
    const firstRun = launch()
    const whenGenuinelyEmpty = (await screen.findByRole('main')).textContent ?? ''
    firstRun.unmount()

    localStorage.setItem(STORAGE_KEY, NEWER_DOCUMENT)
    launch()
    await screen.findByRole('alert')

    const whenReadOnly = (await screen.findByRole('main')).textContent ?? ''
    expect(whenReadOnly).not.toBe(whenGenuinelyEmpty)
  })

  it('leaves the newer document exactly as it found it', async () => {
    // The promise underneath FR-010a: refuse to save rather than risk damaging
    // it. Guarded in the repository and already covered at that level in
    // `tests/storage/recovery.test.ts`; asserted here as the end-to-end version,
    // because this is the one failure the user could never recover from.
    localStorage.setItem(STORAGE_KEY, NEWER_DOCUMENT)
    launch()
    await screen.findByRole('alert')

    expect(localStorage.getItem(STORAGE_KEY)).toBe(NEWER_DOCUMENT)
  })

  it('does not offer the storage warning, or anything to dismiss it with', async () => {
    // A device that refused persistence *and* a document written by a newer
    // build. Both are ordinary on their own, and nothing covered them together:
    // this file never stubbed `navigator.storage`, so the notice was silent
    // here whatever the guard on it said.
    //
    // The consequence is not cosmetic. The warning carries a "Got it" button,
    // and this is the one screen in the app whose stated contract is that there
    // is nothing to press — a control that appears usable but silently does
    // nothing MUST NOT be shown (FR-010a). It is also the wrong message: the
    // user is being told their records might not survive, on a screen that has
    // just declined to read the records it is talking about.
    persistenceIsRefused()
    localStorage.setItem(STORAGE_KEY, NEWER_DOCUMENT)
    launch()
    await screen.findByRole('alert')
    await settle()

    expect(
      screen.queryByText(/promised to keep your history safe/i),
      'the storage warning is on the read-only screen',
    ).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Got it' }),
      'the read-only screen has something to press on it',
    ).toBeNull()
    // The state's whole contract, in one line, and the same one
    // `e2e/support/app.ts` asserts through `noControlsBecause`. Written out as
    // the labels rather than a count, so a failure names what appeared.
    //
    // **This line collides with 005 the day rooms exists, and that is a
    // decision rather than a bug to fix on sight.** Feature 005's FR-001 says
    // the app's areas are reachable from every screen, and its tab bar is a row
    // of buttons — so with two areas they appear here, and this assertion goes
    // red. It was found by running T021's sabotage, which renders the bar with
    // one area and turns exactly this test and T008 red.
    //
    // The two requirements are not really in conflict: FR-010a forbids a
    // control that *appears to change something and does not*, and a tab
    // changes nothing about the document — it navigates, and navigating is
    // still legitimate on a screen that cannot be written to. But "zero
    // buttons" was the cheapest way to state the contract when navigation was
    // the header alone, and whoever builds rooms has to re-state it as "nothing
    // that would write", here and in `noControlsBecause`.
    expect(screen.queryAllByRole('button').map(name)).toEqual([])
  })

  it('shows that same warning to that same device in an ordinary session', async () => {
    // The control for the test above, and it is what stops that one passing for
    // the wrong reason. Every assertion up there is an absence, and a stub that
    // never took effect — or a flush that ended before the persistence promise
    // resolved — would satisfy all of them on a screen where the notice could
    // not have appeared at all. Same stub, same wait, ordinary document: the
    // notice is there and so is its button.
    persistenceIsRefused()
    seed([anItem({ name: 'Boiler service', interval: YEARLY, completions: [aCompletion('2026-06-01')] })])
    launch()
    await screen.findByText('Boiler service')
    await settle()

    expect(screen.queryByText(/promised to keep your history safe/i)).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Got it' })).not.toBeNull()
  })

  it('finds those same controls in an ordinary session', async () => {
    // The control case. Without it, the two absence assertions above could pass
    // against an app that rendered nothing at all, or against queries that were
    // simply looking for the wrong thing.
    seed([anItem({ name: 'Boiler service', interval: YEARLY, completions: [aCompletion('2026-06-01')] })])
    launch()
    await screen.findByText('Boiler service')

    expect(liveWriteControls()).toContain('Add job')
    expect(liveWriteControls().join(' ')).toMatch(/mark done/i)
  })
})
