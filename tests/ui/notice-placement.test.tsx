import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'
import { YEARLY, aCompletion, anItem, seed } from './seed'

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

async function openTheJob(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Boiler service' }))
  await screen.findByRole('heading', { name: 'Boiler service', level: 2 })
}

describe('the storage warning', () => {
  it('greets the user on the schedule list', async () => {
    seed([aJob()])
    launch()
    await screen.findByText('Boiler service')

    await settle()

    expect(notice()).not.toBeNull()
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
