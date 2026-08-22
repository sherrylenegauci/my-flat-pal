import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { render, screen } from '@testing-library/react'
import { App } from '../../src/ui/App'
import { AREAS } from '../../src/ui/navigation'
import { YEARLY, aCompletion, anItem, seed } from './seed'

/**
 * T008 — FR-008, a MUST NOT: the structure is not shown while only one area
 * exists.
 *
 * A bar with one tab spends a permanent strip of a small screen on a choice
 * that does not exist, and this app has about 46 pixels of headroom on its main
 * promise (SC-002). So while `AREAS` has a single entry the app must render no
 * bar at all — not an empty one, not a bar of one.
 *
 * ## This file is deliberately about the real app, not a fixture
 *
 * Every other file in this feature passes a two-area list into `App` to have
 * something to switch between. This one renders `<App />` with no props, so it
 * asks about the app as it actually ships today.
 *
 * **It therefore also fails the day someone adds rooms to `AREAS`**, and that
 * is on purpose. `AREAS` gaining a second entry is the single line that turns
 * the bar on, and 003 is expected to add it *together with* a rooms screen.
 * Adding it on its own puts a tab on the screen that leads nowhere, so this
 * file trips first — at the guard below, with a message saying what to do. It
 * is a tripwire, not an oversight.
 *
 * ## Why this test is written the way it is
 *
 * This project has twice shipped a negative requirement whose test could not
 * fail, so both halves of "no bar" are asserted separately:
 *
 *   - the navigation landmark is absent, which catches a bar that renders with
 *     no tabs in it;
 *   - **and** no control anywhere on the page carries an area's name, which
 *     catches a bar that renders one tab without a landmark around it.
 *
 * Either alone would be satisfied by the other mistake. The sabotage that must
 * turn this red is rendering the bar unconditionally (T021).
 *
 * ## What this file cannot tell you
 *
 * It cannot see space. "The bar is not taking screen space" is a claim about
 * layout, and jsdom lays nothing out; what is asserted here is that nothing is
 * in the document to take space with. Whether the list still fits four jobs
 * above the fold is T019, in a browser.
 */
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
  render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

describe('with only one area (FR-008)', () => {
  it('is the situation this file describes', () => {
    // The tripwire. Everything below says "one area, therefore no bar", and
    // that is only the requirement while this holds. If a second area has been
    // added, FR-008 no longer forbids the bar and this file needs rewriting
    // rather than relaxing.
    expect(
      AREAS.map((area) => area.label),
      'A second area has been added to AREAS. FR-008 now says the bar SHOULD appear, so ' +
        'this file is asserting the wrong thing — move its assertions to a fixture with ' +
        'one area, and make sure the new area has a screen behind its tab.',
    ).toHaveLength(1)
  })

  it('renders the app, so what follows is not a check on an empty page', async () => {
    // Without this, a render that threw or produced nothing would satisfy every
    // absence below and read as a pass.
    launch()

    expect(await screen.findByRole('heading', { name: 'FlatPal', level: 1 })).toBeTruthy()
    expect(await screen.findByText('Boiler service')).toBeTruthy()
  })

  it('renders no navigation structure at all', async () => {
    launch()
    await screen.findByText('Boiler service')

    expect(screen.queryAllByRole('navigation')).toEqual([])
  })

  it('renders no control named after an area', async () => {
    // The half that catches "a bar of one" — a single tab rendered without a
    // landmark wrapped round it would slip past the query above.
    launch()
    await screen.findByText('Boiler service')

    for (const area of AREAS) {
      expect(
        screen.queryByRole('button', { name: area.label }),
        `a control named "${area.label}" is on the page, and with one area there is nothing ` +
          'to switch between',
      ).toBeNull()
    }
  })
})
