import { test, expect } from '@playwright/test'
import { APP_STATES, hasControlsToSweep } from './support/app'
import { INTERACTIVE_SELECTOR, readControlBoxes, readOverflow } from './support/probe'

/**
 * T087 — layout at 375px. Takes over the manual T071.
 *
 * This is the tier's clearest case. jsdom performs no layout: every
 * `getBoundingClientRect()` there returns zeros, so a 44px assertion written
 * against it would pass for a control of any size, including one that does not
 * exist. Here the numbers come from a real engine that has actually laid the
 * page out, in both of the engines the app ships to.
 *
 * Two Principle II MUSTs are checked:
 *   - "no horizontal page scrolling at 375px"
 *   - "touch targets MUST be at least 44x44 CSS pixels"
 *
 * Not checked here, and still manual: "with visible spacing between adjacent
 * targets". Spacing has no threshold in the constitution to assert against, and
 * inventing one would be measuring a number nobody agreed to.
 */
const MIN_TOUCH_TARGET_PX = 44

for (const state of APP_STATES) {
  test(`no horizontal scrolling at 375px: ${state.name}`, async ({ page }) => {
    await state.go(page)

    const overflow = await page.evaluate(readOverflow)

    // Reported together so a failure names the culprit rather than only the
    // symptom — "the page is 40px too wide" is not an actionable bug report.
    expect(
      {
        offenders: overflow.offenders,
        scrollWidth: overflow.documentScrollWidth,
        clientWidth: overflow.documentClientWidth,
      },
      `"${state.name}" scrolls sideways at ${overflow.innerWidth}px`,
    ).toEqual({
      offenders: [],
      scrollWidth: overflow.documentClientWidth,
      clientWidth: overflow.documentClientWidth,
    })
  })

  test(`every touch target is at least 44x44: ${state.name}`, async ({ page }) => {
    await state.go(page)

    const boxes = await page.evaluate(readControlBoxes, INTERACTIVE_SELECTOR)

    // A state with no controls would make everything below vacuous, so the
    // count is asserted rather than assumed. The one state that legitimately
    // has none declares it, and is asserted to have none — see
    // `hasControlsToSweep`.
    if (!hasControlsToSweep(state, boxes.map((box) => box.element))) return

    const undersized = boxes
      .filter(
        (box) => box.width < MIN_TOUCH_TARGET_PX - 0.5 || box.height < MIN_TOUCH_TARGET_PX - 0.5,
      )
      .map((box) => `${box.element} is ${box.width.toFixed(1)}x${box.height.toFixed(1)}`)

    expect(undersized, `undersized touch targets in "${state.name}"`).toEqual([])
  })
}
