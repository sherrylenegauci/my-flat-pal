import { describe, it, expect, beforeEach } from 'vitest'
import { StrictMode } from 'react'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MAINTENANCE } from '../../src/ui/navigation'
import { Harness, ROOMS, backControl, shown } from './nav-harness'

/**
 * T005 — the platform back gesture moves *up*, never sideways (FR-007).
 *
 * This is the subtle one, and plan.md § D2 and § Risks both name it as the
 * handful of lines most likely to be wrong. The reason it matters at all is
 * 001's T011: the Android system back gesture is live in an installed
 * standalone app, so it is not a browser affordance the app can ignore. The
 * shell gives the app two stacks and the platform still gives it one history,
 * and the failure that combination produces is not a crash — it is a user who
 * swipes back in rooms and is shown a maintenance job.
 *
 * The sequence in the first test is that failure exactly, and a single stack
 * with entries from both areas in it passes every other test in this feature
 * and fails that one.
 *
 * **How the gesture is driven, and why not the way it looks like it should
 * be.** `navigation.test.tsx` drives it as `window.history.back()` plus a
 * dispatched `PopStateEvent`. That works there because every one of its
 * gestures is the last thing the test does. It does not generalise, and the
 * reason is measurable: jsdom implements real session history, so `back()`
 * queues a traversal and fires its *own* `popstate` some time later — after the
 * `act` has resolved, and not reliably within one macrotask. With both, the app
 * moves one screen immediately and a second screen whenever that queued task
 * lands. Measured in this repository: after a gesture from four screens deep,
 * an unrelated click on a paragraph moved the app from `new` back to `detail`
 * with no navigation in between. A file like this one, which gestures three
 * times in a row, would be decided by how busy the machine was.
 *
 * So a gesture here dispatches the event the app actually observes, and does
 * not also ask jsdom to traverse. What that costs is stated rather than hidden:
 * this cannot catch an implementation that reads `window.history` at pop time
 * instead of handling the event, because the history position no longer moves.
 * The gesture on a real device is manual-checklist work regardless — that is
 * how T011 established it in the first place.
 *
 * **What this file does not do**: repeat what `navigation.test.tsx` already
 * covers for a single area. One gesture, one screen, and stopping rather than
 * unwinding past the root are pinned there. What is new here is that all of it
 * still holds when there are two areas and the user has been in both.
 */
beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '/')
})

/**
 * What the platform hands the app when someone swipes back.
 *
 * `state` is the *destination* entry's payload, which is what tells an
 * implementation where the gesture is going. `null` is not "no information":
 * it is what a browser reports for the very first entry, the one the app was
 * opened on, and an implementation is entitled to treat it as such. Where a
 * test needs the gesture to land on an entry the app itself created, it passes
 * a payload standing in for one — the shape is invented, because no
 * implementation exists yet to define it, and no assertion anywhere in this
 * file looks at it. Only the screen is asserted, so an implementation that
 * ignores the payload entirely passes these tests too.
 */
async function backGesture(state: unknown = null) {
  await act(async () => {
    window.dispatchEvent(new PopStateEvent('popstate', { state }))
  })
}

/** Stands in for the history entry opening a maintenance job would have made. */
const AN_ENTRY_IN_MAINTENANCE = { area: 'maintenance', depth: 2 }

describe('the back gesture after switching areas', () => {
  it('does not show the screen left open in the area you came from', async () => {
    const user = userEvent.setup()
    render(<Harness areas={[MAINTENANCE, ROOMS]} />)

    await user.click(screen.getByRole('button', { name: 'Open a job' }))
    expect(shown()).toEqual({ area: 'maintenance', view: 'detail' })

    await user.click(screen.getByRole('button', { name: 'Rooms' }))
    expect(shown()).toEqual({ area: 'rooms', view: 'new' })

    // The gesture lands on an entry that belongs to maintenance. Up from rooms'
    // first screen is nowhere, so the app stays where it is — what it must not
    // do is answer with the job.
    await backGesture(AN_ENTRY_IN_MAINTENANCE)

    expect(screen.queryByText('view: detail')).toBeNull()
    expect(shown()).toEqual({ area: 'rooms', view: 'new' })
  })

  it('leaves the app on the current area\'s first screen when there is nothing above it', async () => {
    const user = userEvent.setup()
    render(<Harness areas={[MAINTENANCE, ROOMS]} />)

    await user.click(screen.getByRole('button', { name: 'Rooms' }))

    // `null` is the first entry the app was opened on. On a phone this is the
    // gesture that leaves the app; what it must not be is the gesture that
    // quietly drops the user into another area, and what the app must not do is
    // end up in a broken state trying to pop a stack with nothing in it.
    await backGesture()

    expect(shown()).toEqual({ area: 'rooms', view: 'new' })
    expect(backControl()).toBeNull()
  })
})

describe('the back gesture inside an area', () => {
  it('walks up one screen at a time in the area that was switched into', async () => {
    const user = userEvent.setup()
    render(<Harness areas={[MAINTENANCE, ROOMS]} />)

    await user.click(screen.getByRole('button', { name: 'Rooms' }))
    await user.click(screen.getByRole('button', { name: 'Open a job' }))
    await user.click(screen.getByRole('button', { name: 'Edit the job' }))
    expect(shown()).toEqual({ area: 'rooms', view: 'edit' })

    await backGesture({ area: 'rooms', depth: 2 })
    expect(shown()).toEqual({ area: 'rooms', view: 'detail' })

    await backGesture({ area: 'rooms', depth: 1 })
    expect(shown()).toEqual({ area: 'rooms', view: 'new' })
    expect(backControl()).toBeNull()

    // One more than there are screens. Still rooms, still its first screen.
    await backGesture()
    expect(shown()).toEqual({ area: 'rooms', view: 'new' })
  })

  it('does not reopen an area\'s old screens after that area has been reset', async () => {
    const user = userEvent.setup()
    render(<Harness areas={[MAINTENANCE, ROOMS]} />)

    // Two screens deep in maintenance, then away and back — which FR-003 resets
    // to the first screen. The history entries those two screens made still
    // exist; the gesture must not use them to walk back into a screen the app
    // has already discarded.
    await user.click(screen.getByRole('button', { name: 'Open a job' }))
    await user.click(screen.getByRole('button', { name: 'Edit the job' }))
    await user.click(screen.getByRole('button', { name: 'Rooms' }))
    await user.click(screen.getByRole('button', { name: 'Maintenance' }))
    expect(shown()).toEqual({ area: 'maintenance', view: 'schedule' })

    await backGesture(AN_ENTRY_IN_MAINTENANCE)

    expect(shown()).toEqual({ area: 'maintenance', view: 'schedule' })
    expect(backControl()).toBeNull()
  })
})

describe('under StrictMode, which is how the app actually renders', () => {
  /**
   * The `popstate` listener lives in an effect, and StrictMode mounts effects
   * twice. A listener registered without matching cleanup is therefore
   * registered twice, and every gesture pops two screens instead of one —
   * silently correct-looking in any test that renders without StrictMode, and
   * wrong in the app, which renders with it (`main.tsx`).
   *
   * That is the same class of miss as 001's duplicate-job bug: the fault was in
   * how state was mutated, and every one of the 136 tests then passing rendered
   * a different app from the one that shipped.
   */
  it('moves exactly one screen per gesture, with effects mounted twice', async () => {
    const user = userEvent.setup()
    render(
      <StrictMode>
        <Harness areas={[MAINTENANCE, ROOMS]} />
      </StrictMode>,
    )

    await user.click(screen.getByRole('button', { name: 'Rooms' }))
    await user.click(screen.getByRole('button', { name: 'Open a job' }))
    await user.click(screen.getByRole('button', { name: 'Edit the job' }))

    await backGesture({ area: 'rooms', depth: 2 })

    // One step. Two listeners would have skipped `detail` entirely and landed
    // on rooms' first screen.
    expect(shown()).toEqual({ area: 'rooms', view: 'detail' })
    expect(backControl()).not.toBeNull()
  })
})
