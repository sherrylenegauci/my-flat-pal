import { describe, it, expect, beforeEach } from 'vitest'
import { StrictMode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MAINTENANCE } from '../../src/ui/navigation'
import { Harness, ROOMS, backControl, shown } from './nav-harness'

/**
 * T004 — an area always opens at its first screen (FR-003).
 *
 * The spec settled this deliberately rather than by omission: switching resets,
 * instead of each area remembering where you were. Two reasons are recorded in
 * spec.md § Assumptions — it is simpler, and it means a user cannot be returned
 * to a screen about a job that has since been deleted. So "took me back to
 * where I was" is a *defect* here, not a nicety, and this file is what makes
 * that statement fail if the implementation drifts.
 *
 * Three shapes of the same rule, because the spec states it three ways:
 *   - leave an area and come back (US1/AC3)
 *   - tap the tab of the area you are already in ("Tapping a tab takes you to
 *     the top of that area", spec.md § In one paragraph)
 *   - tap it when you are already at the top, where nothing should happen
 *     (US1/AC4)
 *
 * **What this file cannot say.** US1/AC4's words are "nothing jarring happens —
 * no reload, no flicker, no error". jsdom never paints, so *flicker is not
 * observable here at all*, and neither is a reload that a real browser would
 * show as a blank frame. What is checked is the part that survives into the
 * DOM: the same screen is still on screen afterwards, the back control has not
 * appeared, and the app still navigates. The visual half is the device
 * checklist's, and calling it covered here would be the kind of check that
 * cannot check.
 *
 * Nothing is asserted about storage, because nothing is stored: plan.md records
 * the current area as React state that is deliberately not persisted. There is
 * no saved counterpart to disagree with the screen.
 */
beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '/')
})

async function goTwoScreensDeep(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Open a job' }))
  await user.click(screen.getByRole('button', { name: 'Edit the job' }))
}

describe('coming back to an area you left', () => {
  it('shows that area\'s first screen, not where you left off (US1/AC3)', async () => {
    const user = userEvent.setup()
    render(<Harness areas={[MAINTENANCE, ROOMS]} />)

    await goTwoScreensDeep(user)
    expect(shown()).toEqual({ area: 'maintenance', view: 'edit' })

    await user.click(screen.getByRole('button', { name: 'Rooms' }))
    await user.click(screen.getByRole('button', { name: 'Maintenance' }))

    expect(shown()).toEqual({ area: 'maintenance', view: 'schedule' })
    // And there is nothing above it: the two screens that were open are gone,
    // not merely hidden behind the one on top.
    expect(backControl()).toBeNull()
  })

  it('does the same for the area that was left deep, in either direction', async () => {
    const user = userEvent.setup()
    render(<Harness areas={[MAINTENANCE, ROOMS]} />)

    await user.click(screen.getByRole('button', { name: 'Rooms' }))
    await goTwoScreensDeep(user)
    expect(shown()).toEqual({ area: 'rooms', view: 'edit' })

    await user.click(screen.getByRole('button', { name: 'Maintenance' }))
    await user.click(screen.getByRole('button', { name: 'Rooms' }))

    expect(shown()).toEqual({ area: 'rooms', view: 'new' })
    expect(backControl()).toBeNull()
  })
})

describe('tapping the tab of the area you are already in', () => {
  it('takes you to the top of that area', async () => {
    const user = userEvent.setup()
    render(<Harness areas={[MAINTENANCE, ROOMS]} />)

    await goTwoScreensDeep(user)
    await user.click(screen.getByRole('button', { name: 'Maintenance' }))

    expect(shown()).toEqual({ area: 'maintenance', view: 'schedule' })
    expect(backControl()).toBeNull()
  })

  it('does nothing when you are already at the top of it (US1/AC4)', async () => {
    const user = userEvent.setup()
    render(<Harness areas={[MAINTENANCE, ROOMS]} />)

    // Done in rooms rather than maintenance so the app has to have got there
    // first: "nothing happened" is indistinguishable from "switching does not
    // work" if the test never leaves the area it started in.
    await user.click(screen.getByRole('button', { name: 'Rooms' }))
    expect(shown()).toEqual({ area: 'rooms', view: 'new' })

    await user.click(screen.getByRole('button', { name: 'Rooms' }))

    expect(shown()).toEqual({ area: 'rooms', view: 'new' })
    expect(backControl()).toBeNull()
    // "No error": the app is still working afterwards, rather than merely still
    // displaying the right words.
    await user.click(screen.getByRole('button', { name: 'Open a job' }))
    expect(shown()).toEqual({ area: 'rooms', view: 'detail' })
  })
})

describe('under StrictMode, which is how the app actually renders', () => {
  /**
   * The reset is a state change, and `main.tsx` renders the app inside
   * `<StrictMode>` where React invokes state updaters twice to prove they are
   * pure. Resetting a stack is exactly where someone reaches for a history call
   * inside an updater; in 001 that shape added every job twice and 136 tests
   * missed it, because none of them rendered the app the way the app renders.
   */
  it('resets to the first screen once, not twice', async () => {
    const user = userEvent.setup()
    render(
      <StrictMode>
        <Harness areas={[MAINTENANCE, ROOMS]} />
      </StrictMode>,
    )

    await goTwoScreensDeep(user)
    await user.click(screen.getByRole('button', { name: 'Rooms' }))
    await user.click(screen.getByRole('button', { name: 'Maintenance' }))

    expect(shown()).toEqual({ area: 'maintenance', view: 'schedule' })
    expect(backControl()).toBeNull()
  })
})
