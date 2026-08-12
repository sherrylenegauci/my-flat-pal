import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'
import { load, save } from '../../src/storage/repository'
import { STORAGE_KEY } from '../../src/storage/schema'
import type { StoredDocument } from '../../src/storage/schema'
import { MONTHLY, YEARLY, aCompletion, anItem, seed } from './seed'

/**
 * Where the storage warning belongs: the schedule list, and nowhere else.
 *
 * The notice is a first-run message about whether this device has promised to
 * keep the user's records. It is the entire mitigation for a risk the app cannot
 * otherwise address — there is no export and no backup — so it has to be said,
 * once, where the user lands. The shell rendered it above `<main>` on every
 * view, which at 375px is roughly the top third of the detail view, the add
 * form, the edit form and the delete confirmation as well as the list. Saying it
 * again on top of the form someone is trying to fill in is not saying it more
 * clearly.
 *
 * Dismissal is unchanged and is covered at component level in
 * `persistence-notice.test.tsx`. What is covered here is the app-level version
 * of it, inside `<StrictMode>` — see the note on `launch()`.
 *
 * **Only this notice moves.** The read-only, corrupt-data, undo and
 * refused-undo notices live in the same region of the shell and are unchanged;
 * their own files still cover them, and nothing here asserts anything about the
 * region itself. A container is not something a user sees.
 */
type StorageManagerStub = { persist?: () => Promise<boolean>; persisted?: () => Promise<boolean> }

function stubStorage(stub: StorageManagerStub) {
  Object.defineProperty(navigator, 'storage', {
    value: stub,
    configurable: true,
    writable: true,
  })
}

beforeEach(() => {
  localStorage.clear()
  // The notice only exists when persistence is refused, so an app-level test has
  // to say so before rendering — the same stub `persistence-notice.test.tsx`
  // uses. Without it jsdom answers nothing, the notice never renders, and every
  // absence assertion below would pass without checking anything.
  stubStorage({ persisted: async () => false, persist: async () => false })
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0)) // 8 August 2026
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/**
 * StrictMode, because dismissing the notice writes to localStorage and
 * `main.tsx` renders the app inside it. React double-invokes state updaters
 * there to prove they are pure; a test that renders the app any other way is
 * testing a different app from the one that ships.
 */
function launch() {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const app = render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  return { user, app }
}

/**
 * Let the persistence question be asked and answered.
 *
 * The notice appears only after a promise chain resolves, so "it is not on the
 * screen" is a claim about timing as much as about placement — assert it too
 * early and it passes on every view including the one the notice belongs on.
 * Flushing microtasks inside `act` is deterministic: no timers are involved, so
 * it cannot come out differently on a slow machine.
 *
 * The first test below is what makes this trustworthy. It waits exactly this
 * long and then requires the notice to be *there*, so if this flush were ever
 * too short, that test fails rather than the absence assertions silently
 * becoming vacuous.
 */
const settle = () =>
  act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })

const ON_THE_WRONG_VIEW = (view: string) =>
  `the storage warning is still on screen on ${view}; it belongs on the schedule list only`

/** The notice, identified by what it says rather than by where it is drawn. */
const notice = () => screen.queryByText(/promised to keep your history safe/i)

const aJob = () =>
  anItem({ name: 'Boiler service', interval: YEARLY, completions: [aCompletion('2026-06-01')] })

/** A second job, so a list with one job removed from it is still a list. */
const anotherJob = () =>
  anItem({ name: 'Smoke alarms', interval: MONTHLY, completions: [aCompletion('2026-07-08')] })

async function openTheJob(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Boiler service' }))
  await screen.findByRole('heading', { name: 'Boiler service', level: 2 })
}

/**
 * A write made by a second same-origin context — the installed app and an
 * ordinary browser tab, which are routinely both open because opening the site
 * in a browser is how you install it.
 *
 * Goes through the same repository the app uses, against the document as it is
 * on disk right now. Returns what was written, which is what the browser hands
 * to the other document in the event below.
 */
function anotherWindowDeletes(jobName: string): StoredDocument {
  const current = load().document
  return save({ ...current, items: current.items.filter((item) => item.name !== jobName) })
}

/**
 * The `storage` event a browser fires in *other* documents when one of them
 * writes. **This is a model**, and it is the same one
 * `tests/ui/undo-other-context.test.tsx` uses — deliberately, rather than a
 * third way of doing it.
 *
 * jsdom has a single document and fires nothing between its own writes, so the
 * event is constructed here. What it stands in for is narrow: the platform's
 * *delivery* of the news, not the app's reaction to it.
 * `subscribeToExternalChanges` reads nothing from the event but `key` and then
 * reloads from `localStorage`, so everything downstream of the listener is the
 * real code path. That the listener fires for this key and ignores others is
 * covered for real in `tests/storage/subscribe.test.ts`.
 *
 * The risk it carries is that a malformed event does nothing at all, which would
 * leave the test passing for the worst possible reason. The test below therefore
 * proves on screen that the app heard it — the job is gone from the list —
 * before asserting anything about the notice.
 */
async function theBrowserTellsTheAppSomeoneElseWrote(document: StoredDocument) {
  await act(async () => {
    window.dispatchEvent(
      new StorageEvent('storage', { key: STORAGE_KEY, newValue: JSON.stringify(document) }),
    )
  })
}

describe('the storage warning', () => {
  it('greets the user on the schedule list', async () => {
    seed([aJob()])
    launch()
    await screen.findByText('Boiler service')

    await settle()

    expect(notice()).not.toBeNull()
  })

  it('greets them on a genuine first run, with nothing recorded yet', async () => {
    // Nothing seeded, and that absence is the whole of the test.
    //
    // Every other test in this file puts a job in place before launching, which
    // left the notice's condition satisfiable by an extra `views.length > 0`:
    // a guard that hides the first-run message from the first run. The browser
    // tier cannot cover this either — its "empty schedule" state pins
    // persistence to granted, and its "storage durability warning" state seeds
    // four jobs — so the one launch this notice exists for was covered nowhere.
    //
    // It is a message about whether this device will keep records the user has
    // not made yet. Someone about to type their first job in is exactly who
    // needs to know there is no backup, and an empty list is where they are
    // standing when they need it.
    launch()
    await screen.findByRole('heading', { name: 'Nothing recorded yet' })

    await settle()

    expect(
      notice(),
      'no storage warning on a first run — the launch the notice exists for',
    ).not.toBeNull()
  })

  it('does not follow the user into a job', async () => {
    seed([aJob()])
    const { user } = launch()
    await settle()
    expect(notice()).not.toBeNull()

    await openTheJob(user)
    await settle()

    expect(notice(), ON_THE_WRONG_VIEW('a job’s detail view')).toBeNull()
  })

  it('does not follow the user into the add-a-job form', async () => {
    seed([aJob()])
    const { user } = launch()
    await settle()
    expect(notice()).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Add job' }))
    await screen.findByRole('heading', { name: 'Add a job', level: 2 })
    await settle()

    expect(notice(), ON_THE_WRONG_VIEW('the add-a-job form')).toBeNull()
  })

  it('does not follow the user into the edit form', async () => {
    seed([aJob()])
    const { user } = launch()
    await settle()
    expect(notice()).not.toBeNull()

    await openTheJob(user)
    await user.click(screen.getByRole('button', { name: 'Edit job' }))
    await screen.findByRole('heading', { name: 'Edit job', level: 2 })
    await settle()

    expect(notice(), ON_THE_WRONG_VIEW('the edit form')).toBeNull()
  })

  it('is there again when the user comes back to the list', async () => {
    // Leaving the list is not dismissing it. The user has not said they have
    // read it, and this is the only warning they will get.
    seed([aJob()])
    const { user } = launch()
    await settle()

    await openTheJob(user)
    await settle()
    expect(notice(), ON_THE_WRONG_VIEW('a job’s detail view')).toBeNull()

    await user.click(screen.getByRole('button', { name: /back/i }))
    await screen.findByText('Boiler service')
    await settle()

    expect(notice(), 'the storage warning did not come back on the schedule list').not.toBeNull()
  })

  it('stays gone once the user says they have read it', async () => {
    seed([aJob()])
    const { user, app } = launch()
    await settle()
    expect(notice()).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Got it' }))
    await settle()
    expect(notice()).toBeNull()

    // Not just for this screen, and not just for this launch. A relaunch is what
    // the user experiences; it is asserted first because it is the part that
    // means something to them.
    app.unmount()
    launch()
    await screen.findByText('Boiler service')
    await settle()
    expect(notice()).toBeNull()

    // And the record behind it, read back out of storage rather than inferred
    // from the screen. This is the one assertion in the file that knows a
    // storage key, and it is here because of what StrictMode is for: a
    // duplicated-job bug once showed one job on screen while storage held two,
    // and the user only found out on the next reload. What is stored is the part
    // that survives, and this app has no export to check it with.
    expect(localStorage.getItem('my-flat-pal.storage-notice-dismissed')).toBe('yes')
  })

  it('does not come back on another view after being dismissed', async () => {
    seed([aJob()])
    const { user } = launch()
    await settle()

    await user.click(screen.getByRole('button', { name: 'Got it' }))
    await settle()

    await openTheJob(user)
    await settle()
    expect(notice()).toBeNull()

    await user.click(screen.getByRole('button', { name: /back/i }))
    await screen.findByText('Boiler service')
    await settle()

    expect(notice()).toBeNull()
  })
})

/**
 * The list can be on screen without the route saying so.
 *
 * `<main>` falls through to the schedule list whenever a detail or edit route
 * points at a job that is no longer there — deliberately, and the reason is
 * written above `const detailId` in `App.tsx`: a detail view for a deleted job
 * is not a state worth rendering, and the list is where the user was going
 * next anyway. Deleting a job in another window while this one has it open is
 * exactly how that happens.
 *
 * So "which view is showing" and "what the route says" are two different
 * questions, and the notice is currently answering the second one. The user is
 * standing on the schedule list with no warning on it, which is the same
 * outcome as the notice not existing.
 *
 * Kept out of the block above because it is not about following the user
 * around: the user goes nowhere here. Something else moves underneath them.
 */
describe('the storage warning, when the list appears without being navigated to', () => {
  it('is on screen after another window deletes the job this one had open', async () => {
    seed([aJob(), anotherJob()])
    const { user } = launch()
    await screen.findByText('Boiler service')
    await settle()
    expect(notice()).not.toBeNull()

    await openTheJob(user)
    await settle()
    expect(notice(), ON_THE_WRONG_VIEW('a job’s detail view')).toBeNull()

    // The other context removes the job this one is looking at, and the browser
    // tells this one about it. No navigation happens: nothing is pressed, and
    // the route still says `detail`.
    await theBrowserTellsTheAppSomeoneElseWrote(anotherWindowDeletes('Boiler service'))
    await settle()

    // The app heard the event, and what it now shows is the schedule list.
    // Asserted before anything about the notice, because a storage event that
    // did nothing would leave the detail view up and make everything below a
    // statement about the wrong screen.
    expect(screen.queryByRole('heading', { name: 'Boiler service', level: 2 })).toBeNull()
    expect(screen.getByRole('button', { name: 'Add job' })).toBeTruthy()
    expect(screen.getByText('Smoke alarms')).toBeTruthy()

    // And the route has not changed with it — the back control is only drawn
    // when there is somewhere to go back to, and from the list there is not.
    // This is what makes the list on screen and the route disagree, which is the
    // whole situation under test.
    expect(
      screen.queryByRole('button', { name: /back/i }),
      'the route went back to the schedule on its own, so this is no longer the case ' +
        'where the rendered view and the route disagree',
    ).not.toBeNull()

    expect(
      notice(),
      'the user is looking at the schedule list with no storage warning on it: the ' +
        'notice is keyed on the route rather than on the view that is actually rendered',
    ).not.toBeNull()
  })
})
