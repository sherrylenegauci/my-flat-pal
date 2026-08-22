import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'
import { MAINTENANCE } from '../../src/ui/navigation'
import type { Area } from '../../src/ui/navigation'
import { YEARLY, aCompletion, anItem, seed } from './seed'

/**
 * T014 — US2/AC3, FR-006: switching areas puts the user at the start of the new
 * area, not wherever the old screen left them.
 *
 * 001 learned this twice, from the same failure. When a control removes itself
 * — the undo offer, a deleted job's detail — focus falls to `<body>`, and the
 * browser silently returns a screen-reader user to the top of the document with
 * nothing announced. Switching areas is that failure again with more of the
 * page replaced: everything the user was looking at goes, and if nothing places
 * focus, they are told nothing happened.
 *
 * ## What is asserted
 *
 * That focus lands inside the region that shows the new area — the `main`
 * landmark. That is deliberately a little looser than naming one element: what
 * FR-006 requires is that the user is *at the start of the new area*, and
 * whether that is the region itself or the heading inside it is an
 * implementation choice this test should not decide. It is not loose enough to
 * be vacuous: focus on `<body>`, focus left on the tab that was tapped, and
 * focus stranded on a control belonging to the screen the user just left all
 * fail it, and those are the three ways this goes wrong.
 *
 * Asserted through the `main` role rather than a class name, so a rename of
 * `.app__main` does not touch this file.
 *
 * ## What this file cannot tell you
 *
 * Whether anything is *announced*. Focus moving is the mechanism; VoiceOver
 * reading out something that makes sense when it arrives is the outcome, and no
 * automated tier here can hear it. That is T022, on a real iPhone. jsdom also
 * paints nothing, so whether the focus ring is visible where focus lands is
 * `e2e/rendering/focus-visibility.spec.ts` and the device.
 *
 * `ROOMS` is a stand-in for an area 003 builds. The app has no rooms.
 */
const ROOMS: Area = { id: 'rooms', label: 'Rooms', root: { name: 'schedule' } }

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0))
})
afterEach(() => vi.useRealTimers())

function launch() {
  seed([
    anItem({
      name: 'Boiler service',
      interval: YEARLY,
      completions: [aCompletion('2025-06-01')],
    }),
  ])

  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  render(
    <StrictMode>
      <App areas={[MAINTENANCE, ROOMS]} />
    </StrictMode>,
  )
  return user
}

const tab = (label: string) =>
  within(screen.getByRole('navigation', { name: /areas/i })).getByRole('button', { name: label })

/**
 * Where focus is, described the way the failure would be described.
 *
 * Returning a string rather than asserting inline so a failure says "focus is
 * on BODY" or "focus is on BUTTON Rooms" instead of "expected false to be
 * true".
 */
function whereFocusIs(): string {
  const active = document.activeElement
  if (active === null) return 'nowhere — activeElement is null'
  if (active === document.body) return 'on <body>, which announces nothing'
  const text = (active.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
  return `on <${active.tagName.toLowerCase()}> "${text}"`
}

/** True when focus is at, or inside, the region showing the current area. */
function focusIsInTheMainRegion(): boolean {
  const main = screen.getByRole('main')
  const active = document.activeElement
  return active !== null && (active === main || main.contains(active))
}

describe('switching areas places the user (FR-006)', () => {
  it('moves focus into the new area', async () => {
    const user = launch()
    await screen.findByText('Boiler service')

    await user.click(tab('Rooms'))
    await screen.findByRole('heading', { name: 'Rooms' })

    expect(
      focusIsInTheMainRegion(),
      `focus did not land in the new area — it is ${whereFocusIs()}`,
    ).toBe(true)
  })

  it('moves focus back into maintenance on the way back', async () => {
    const user = launch()
    await screen.findByText('Boiler service')
    await user.click(tab('Rooms'))
    await screen.findByRole('heading', { name: 'Rooms' })

    await user.click(tab('Maintenance'))
    await screen.findByText('Boiler service')

    expect(
      focusIsInTheMainRegion(),
      `focus did not land back in maintenance — it is ${whereFocusIs()}`,
    ).toBe(true)
  })

  it('does not leave focus on a control belonging to the screen just left', async () => {
    // The specific failure worth naming: the user is several screens deep, the
    // whole view is replaced, and focus stays on something that has gone or on
    // the tab that was tapped. Either way nothing about the new area is where
    // the user is.
    const user = launch()
    await user.click(await screen.findByRole('button', { name: 'Boiler service' }))
    await screen.findByRole('heading', { name: 'Boiler service', level: 2 })

    await user.click(tab('Rooms'))
    await screen.findByRole('heading', { name: 'Rooms' })

    expect(document.activeElement).not.toBe(document.body)
    expect(document.activeElement).not.toBe(tab('Rooms'))
    expect(
      focusIsInTheMainRegion(),
      `focus stayed outside the new area — it is ${whereFocusIs()}`,
    ).toBe(true)
  })
})
