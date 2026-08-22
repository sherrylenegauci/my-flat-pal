import { test, expect } from '@playwright/test'
import { APP_STATES } from '../support/app'

/**
 * T019 — SC-002, with the bar's space spent.
 *
 * > **SC-002**: on opening the app, whether anything is overdue is still visible
 * > within 5 seconds without scrolling — the promise 001 made, and which this
 * > feature spends screen space against.
 *
 * 001's own task list already recorded "without scrolling" as unguarded, and
 * 005 is the feature most likely to break it: a bar pinned to the bottom takes a
 * permanent strip off a 812px-tall screen. So the guard is added here rather
 * than inherited.
 *
 * ## Why the bar is put on the page by hand, and what that costs
 *
 * FR-008 hides the structure while only one area exists, and one area is what
 * the app ships with until 003 builds rooms — so the running app has no bar for
 * a browser to measure. The alternatives were to hard-code a height (a test of a
 * number, not of the layout), to wait for 003 (leaving the criterion unguarded
 * through exactly the change most likely to break it), or to put the bar's own
 * markup into the real page and let the real stylesheet size it.
 *
 * The third is what happens below. The **geometry is genuine**: the engine
 * resolves `app.css` and lays the bar out in the real document at 375x812, so a
 * change to the bar's height, its padding or its touch target moves these
 * numbers. What it cannot see is `TabBar.tsx` — if the component's markup and
 * this stand-in drift apart, this measures the stylesheet against markup nobody
 * renders. That is checked as far as it can be (the bar must come out at least
 * as tall as a touch target and as wide as the screen, or the probe failed and
 * everything after it would be vacuous), and it stops being a stand-in the day
 * rooms exists.
 *
 * ## What was measured on the day this was written
 *
 * Identical in Chromium and WebKit, at 375x812 with the four seeded jobs:
 *
 *   - the bar is **45px** tall and each tab is **44x188** — the touch-target
 *     floor exactly, with nothing spare
 *   - "3 needing attention" ends at y=107 and the first overdue row at y=289,
 *     against a bar whose top edge is at y=767. SC-002 holds with 478px in hand
 *   - **the fourth job's row ends at y=768, one pixel below the bar's top edge**,
 *     and the page gains 19px of scroll it did not have
 *
 * That last line is the cost the specification warned about, arriving. It is
 * **not** a breach of SC-002, which promises the *overdue* information without
 * scrolling and gets it easily — it is the loss of the fourth job above the
 * fold, which was a property of 001's design rather than a criterion anyone
 * wrote down. It is deliberately not asserted here: the fix is either the bar's
 * height (already at Principle II's 44px floor, so it cannot shrink without
 * breaking a MUST) or the list's density, and which of those to spend is not a
 * decision a test should make by going red. It is in the report instead.
 */

/**
 * The bar's own markup, put into the real page.
 *
 * Kept in step with `src/ui/components/TabBar.tsx` by hand — the class names and
 * the `aria-current` are the only things it needs to be right about, because
 * everything that decides its size is in `app.css`.
 */
function addTheTabBar() {
  const app = document.querySelector('.app')
  if (app === null) throw new Error('the app shell is not on the page')

  const bar = document.createElement('nav')
  bar.className = 'tab-bar'
  bar.setAttribute('aria-label', 'Areas')

  for (const label of ['Maintenance', 'Rooms']) {
    const tab = document.createElement('button')
    tab.type = 'button'
    tab.className = 'tab-bar__tab'
    if (label === 'Maintenance') tab.setAttribute('aria-current', 'page')
    tab.textContent = label
    bar.append(tab)
  }

  app.append(bar)

  const round = (box: DOMRect) => ({
    top: Math.round(box.top),
    bottom: Math.round(box.bottom),
    height: Math.round(box.height),
    width: Math.round(box.width),
  })

  const rows = Array.from(document.querySelectorAll('.schedule__list > li')).map((row) => ({
    ...round(row.getBoundingClientRect()),
    text: (row.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30),
  }))

  const heading = document.querySelector('.schedule__title')
  if (heading === null) throw new Error('the list heading is not on the page')

  return {
    bar: round(bar.getBoundingClientRect()),
    tab: round(bar.querySelectorAll('button')[0]!.getBoundingClientRect()),
    heading: round(heading.getBoundingClientRect()),
    rows,
    viewportHeight: window.innerHeight,
  }
}

/**
 * Two states, because the first launch on a real iPhone is the second one.
 *
 * Both engines refuse `navigator.storage.persist()` headless, and iOS refuses it
 * until the app is installed — so a first-time user meets the list with the
 * durability warning sitting above it, which is the version of this screen with
 * the least room to spare. Checking only the tidy one would guard SC-002 in the
 * condition it is least likely to fail.
 */
const STATES = ['schedule list', 'storage durability warning'] as const

for (const stateName of STATES) {
  test(`whether anything is overdue is visible without scrolling, with the bar on screen: ${stateName}`, async ({
    page,
  }) => {
    const state = APP_STATES.find((s) => s.name === stateName)
    if (!state) throw new Error(`The "${stateName}" state has been renamed or removed`)
    await state.go(page)

    const layout = await page.evaluate(addTheTabBar)

    // The probe first. A bar that failed to be styled would sit at zero height and
    // every assertion below would pass while measuring nothing.
    expect(
      {
        barIsAtLeastATouchTarget: layout.bar.height >= 44,
        barSpansTheScreen: layout.bar.width >= 375,
        tabMeetsTheTouchTargetFloor: layout.tab.height >= 44 && layout.tab.width >= 44,
      },
      'the injected bar was not laid out by app.css, so nothing below is a measurement. ' +
        `Bar ${layout.bar.width}x${layout.bar.height}, tab ${layout.tab.width}x${layout.tab.height}.`,
    ).toEqual({
      barIsAtLeastATouchTarget: true,
      barSpansTheScreen: true,
      tabMeetsTheTouchTargetFloor: true,
    })

    const firstRow = layout.rows[0]
    expect(firstRow, 'the seeded list did not render').toBeDefined()
    if (firstRow === undefined) return

    // The first row is the overdue one: `orderForDisplay` puts what needs
    // attention first, and `SEEDED_STATUSES` records that as "Bleed the
    // radiators — Overdue".
    expect(firstRow.text, 'the first row is not the overdue job').toContain('Overdue')

    const describe =
      `heading ${layout.heading.top}–${layout.heading.bottom}, ` +
      `first row ${firstRow.top}–${firstRow.bottom}, ` +
      `bar top ${layout.bar.top} in a ${layout.viewportHeight}px viewport. ` +
      `Rows: ${layout.rows.map((row) => `${row.bottom}`).join(', ')}.`

    expect(
      {
        headingIsClear: layout.heading.bottom <= layout.bar.top,
        firstRowIsWhole: firstRow.bottom <= layout.bar.top,
        nothingIsOffTheTop: layout.heading.top >= 0,
      },
      `SC-002: what needs attention is no longer readable without scrolling. ${describe}`,
    ).toEqual({ headingIsClear: true, firstRowIsWhole: true, nothingIsOffTheTop: true })
  })
}
