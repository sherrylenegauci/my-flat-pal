import { describe, it, expect, beforeEach } from 'vitest'
import { StrictMode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MAINTENANCE } from '../../src/ui/navigation'
import { Harness, ROOMS, backControl, shown } from './nav-harness'

/**
 * T003 — the app has areas, and each one keeps its own place.
 *
 * The shell (005, FR-001/FR-002) puts maintenance and rooms side by side rather
 * than one inside the other. That needs three things from `useNavigation`, and
 * this file covers all three: it reports which area you are in, `switchTo`
 * changes it, and **the two areas do not share a stack** — how deep you are in
 * one says nothing about how deep you are in the other (plan.md § D2).
 *
 * The last point is the one worth the file. A single stack with area-tagged
 * entries would pass a shallow test and then make "back" ambiguous the moment
 * someone goes maintenance → job → rooms → back, which is what FR-007 forbids
 * and what `navigation-history.test.tsx` pins down.
 *
 * **What this file cannot say.** Nothing here is evidence that a *user* can
 * switch areas. It drives the hook through a stand-in harness, so it proves the
 * state behaves; whether there is a visible tab bar, whether its targets are
 * 44x44, and whether the current one is announced as current are T007, T013 and
 * the device checklist. A green run here with no tab bar on screen is entirely
 * possible.
 */
beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '/')
})

describe('which area you are in', () => {
  it('is the first area the app is given, not a fixed one', () => {
    // Two orderings, because one ordering cannot tell "the first area in the
    // list" apart from "maintenance, always" — and the second is what the app
    // stops being able to say once rooms exists.
    const first = render(<Harness areas={[MAINTENANCE, ROOMS]} />)
    expect(shown()).toEqual({ area: 'maintenance', view: 'schedule' })
    first.unmount()

    render(<Harness areas={[ROOMS, MAINTENANCE]} />)
    expect(shown()).toEqual({ area: 'rooms', view: 'new' })
  })

  it('changes when you switch to another area, and back again', async () => {
    const user = userEvent.setup()
    render(<Harness areas={[MAINTENANCE, ROOMS]} />)

    await user.click(screen.getByRole('button', { name: 'Rooms' }))
    expect(shown()).toEqual({ area: 'rooms', view: 'new' })

    await user.click(screen.getByRole('button', { name: 'Maintenance' }))
    expect(shown()).toEqual({ area: 'maintenance', view: 'schedule' })
  })
})

describe('each area keeps its own stack', () => {
  it('does not carry the depth of one area across to the other', async () => {
    const user = userEvent.setup()
    render(<Harness areas={[MAINTENANCE, ROOMS]} />)

    await user.click(screen.getByRole('button', { name: 'Open a job' }))
    await user.click(screen.getByRole('button', { name: 'Edit the job' }))
    expect(shown()).toEqual({ area: 'maintenance', view: 'edit' })
    expect(backControl()).not.toBeNull()

    // Two screens deep in maintenance says nothing about rooms: rooms has never
    // been opened, so its first screen is where it starts, with nothing above.
    await user.click(screen.getByRole('button', { name: 'Rooms' }))
    expect(shown()).toEqual({ area: 'rooms', view: 'new' })
    expect(backControl()).toBeNull()
  })

  it('offers the back control below an area\'s first screen and not at it (FR-007)', async () => {
    const user = userEvent.setup()
    render(<Harness areas={[MAINTENANCE, ROOMS]} />)

    // Checked in the second area on purpose. That it holds in maintenance is
    // already covered by `navigation.test.tsx`; what is new here is that it is
    // a property of *whichever* area you are in, not of one stack that happens
    // to be the app's.
    await user.click(screen.getByRole('button', { name: 'Rooms' }))
    expect(backControl()).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Open a job' }))
    expect(shown()).toEqual({ area: 'rooms', view: 'detail' })
    expect(backControl()).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Back' }))
    // `back()` goes through the browser, and jsdom delivers the resulting
    // popstate on its own schedule — so this waits for the screen rather than
    // assuming the update has already landed. A slow machine must not be able
    // to fail it.
    await screen.findByText('view: new')
    expect(shown()).toEqual({ area: 'rooms', view: 'new' })
    expect(backControl()).toBeNull()
  })
})

describe('under StrictMode, which is how the app actually renders', () => {
  /**
   * `main.tsx` renders inside `<StrictMode>`, so a test that does not is
   * testing a different app. This is not a formality here: React double-invokes
   * state updaters under StrictMode to prove they are pure, and switching areas
   * is a state change that also has to touch history. A `switchTo` that resets
   * a stack from inside an updater — the shape that duplicated every job a user
   * added in 001, past 136 green tests — would show up here and nowhere else.
   */
  it('switches areas exactly once when the updater is invoked twice', async () => {
    const user = userEvent.setup()
    render(
      <StrictMode>
        <Harness areas={[MAINTENANCE, ROOMS]} />
      </StrictMode>,
    )

    await user.click(screen.getByRole('button', { name: 'Open a job' }))
    await user.click(screen.getByRole('button', { name: 'Rooms' }))

    expect(shown()).toEqual({ area: 'rooms', view: 'new' })
    expect(backControl()).toBeNull()

    // And rooms is genuinely one screen deep afterwards, not two: a switch
    // that ran its state change twice would have stacked rooms' first screen on
    // top of itself, which only shows up as a back control that will not go
    // away.
    await user.click(screen.getByRole('button', { name: 'Open a job' }))
    expect(shown()).toEqual({ area: 'rooms', view: 'detail' })
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await screen.findByText('view: new')
    expect(backControl()).toBeNull()
  })
})
