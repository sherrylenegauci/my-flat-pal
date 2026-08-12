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

/**
 * The date field and the button that records it, side by side (375px).
 *
 * One of the four changes asked for, and the tier below cannot say anything
 * about it: jsdom performs no layout, so every element there reports a
 * zero-sized box at 0,0 and any arrangement assertion would pass whatever the
 * stylesheet did. DOM order is not position either — the button follows the
 * field in the markup whether it is rendered beside it, under it, or off the
 * screen.
 *
 * **Why it is worth a test rather than a look.** An inline row at 375px wraps
 * silently: nothing errors, nothing overflows, the layout sweep above stays
 * green, and the field simply ends up on one line with the button underneath.
 * A date input is one of the widest controls the platform draws and its
 * intrinsic width differs between the two engines, so the margin here is narrow
 * on the device the app is actually used on. T093's interval row was the same
 * shape of bug.
 *
 * **The relationship, not the numbers.** Both boxes are read from a real engine
 * that has laid the page out, and what is asserted is that they share a row and
 * that the button comes after the field. The pixel values are a palette or
 * spacing change away from moving and pinning them would make this a test of
 * the current stylesheet rather than of the arrangement.
 */
test('the Add button sits beside the date field, not under it', async ({ page }) => {
  const state = APP_STATES.find((s) => s.name === 'job detail, with history')
  if (!state) throw new Error('The "job detail, with history" state has been renamed or removed')
  await state.go(page)

  // Found the way each is found by the person using them: the field by the
  // words that label it, the button by what it is called. `exact` because "Add"
  // is a prefix of other names this app uses.
  const field = await page.getByLabel('Add a date you did it').boundingBox()
  const button = await page.getByRole('button', { name: 'Add', exact: true }).boundingBox()

  expect(field, 'the date field is not laid out at all').not.toBeNull()
  expect(button, 'the Add button is not laid out at all').not.toBeNull()
  if (!field || !button) return

  // Vertical ranges overlap → they are on the same line. A wrap moves the
  // button clear of the field's band entirely, so the overlap goes to nothing.
  const sameRow = button.y < field.y + field.height && field.y < button.y + button.height
  // And it is after the field rather than before it, with no overlap: "beside"
  // means the two do not sit on top of each other.
  const afterTheField = button.x >= field.x + field.width

  expect(
    { sameRow, afterTheField },
    'the Add button is not beside the date field at 375px. ' +
      `field x ${field.x.toFixed(1)}–${(field.x + field.width).toFixed(1)}, ` +
      `y ${field.y.toFixed(1)}–${(field.y + field.height).toFixed(1)}; ` +
      `button x ${button.x.toFixed(1)}–${(button.x + button.width).toFixed(1)}, ` +
      `y ${button.y.toFixed(1)}–${(button.y + button.height).toFixed(1)}`,
  ).toEqual({ sameRow: true, afterTheField: true })
})
