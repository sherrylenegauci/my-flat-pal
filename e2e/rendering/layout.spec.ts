import { test, expect } from '@playwright/test'
import { APP_STATES, hasControlsToSweep } from '../support/app'
import { INTERACTIVE_SELECTOR, readControlBoxes, readOverflow } from '../support/probe'

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

/**
 * The two halves of the same question, asked of the two date fields the app
 * draws. One must stop stretching; the other must go on stretching.
 *
 * A single `width: 100%` in `src/ui/app.css` (the shared
 * `input[type='text'], input[type='number'], input[type='date'], select` rule)
 * currently sizes both. Narrowing it is a scoping change, and a scoping change
 * has two ways to be wrong rather than one: too broad and the record row goes
 * ragged, too narrow and the form field never shrinks. So both fields are
 * measured, in the same run, in both engines.
 *
 * **Why a relationship and never a number.** The intrinsic width of
 * `input[type=date]` is drawn by the engine and differs between them — measured
 * with the fix sketched in, 118.1px in WebKit against 163.8px in Chromium. A
 * pinned width would be a test of one engine's form-control metrics, and it
 * would fail on the other for no reason a user could see.
 *
 * **Frame of reference: the label above each field.** Both labels are block
 * elements filling their form field, so each one measures the full width the
 * field *could* take (340px at this viewport). Found by the words a person
 * reads, which is how the rest of this directory finds things, and it costs
 * nothing over reading a class name.
 */
test('the “last done” field is sized to its content, not to the form', async ({ page }) => {
  const state = APP_STATES.find((s) => s.name === 'add a job form')
  if (!state) throw new Error('The "add a job form" state has been renamed or removed')
  await state.go(page)

  const nameLabel = await page.getByText('Name', { exact: true }).boundingBox()
  const nameField = await page.getByLabel('Name', { exact: true }).boundingBox()
  // By the start of the label rather than the whole of it: the parenthesis
  // ("leave blank if you don’t know") is copy, and it contains a typographic
  // apostrophe that is easy to retype as the wrong character.
  const lastDoneField = await page.getByLabel(/^Last done/).boundingBox()

  expect(
    { nameLabel: nameLabel !== null, nameField: nameField !== null, lastDone: lastDoneField !== null },
    'a field or its label is not laid out at all, so there is nothing to compare',
  ).toEqual({ nameLabel: true, nameField: true, lastDone: true })
  if (!nameLabel || !nameField || !lastDoneField) return

  // Two claims, and the second is what stops the first being satisfiable the
  // wrong way. "Narrower than the Name field" would also be true if the Name
  // field shrank, which is a bug rather than a fix — so the Name field is
  // separately held to the full width its own label spans.
  const materiallyNarrower = lastDoneField.width < nameField.width * 0.75
  const nameStillFillsTheForm = nameField.width >= nameLabel.width - 1

  expect(
    { materiallyNarrower, nameStillFillsTheForm },
    'the "Last done" field is still stretched across the form. ' +
      `Name field ${nameField.width.toFixed(1)}px wide against a label spanning ` +
      `${nameLabel.width.toFixed(1)}px; "Last done" ${lastDoneField.width.toFixed(1)}px. ` +
      'The threshold is three quarters of the Name field, which is a long way from ' +
      'either engine’s intrinsic date-input width and is not a target to design to.',
  ).toEqual({ materiallyNarrower: true, nameStillFillsTheForm: true })
})

/**
 * The other half of "the Add button sits beside the date field", and the reason
 * this pair exists rather than one test.
 *
 * That test asks whether the two controls share a line, which they would go on
 * doing if the field collapsed to its intrinsic width and left 70px of nothing
 * after the button. What is asserted here is that the field *absorbs* the space
 * — `.detail__record-row input[type='date'] { flex: 1 1 auto }` in
 * `src/ui/app.css` — which is the thing a rule scoped too broadly at the "Last
 * done" field would take away.
 *
 * Measured today at this viewport in WebKit: a 264.6px field and a 66.6px
 * button in a 340px row. With the shared rule removed and nothing put in its
 * place the field would be ~118px and the row would end 130px short of its
 * right edge.
 */
test('the date field fills the row it shares with the Add button', async ({ page }) => {
  const state = APP_STATES.find((s) => s.name === 'job detail, with history')
  if (!state) throw new Error('The "job detail, with history" state has been renamed or removed')
  await state.go(page)

  const label = await page.getByText('Add a date you did it').boundingBox()
  const field = await page.getByLabel('Add a date you did it').boundingBox()
  const button = await page.getByRole('button', { name: 'Add', exact: true }).boundingBox()

  expect(
    { label: label !== null, field: field !== null, button: button !== null },
    'the label, the field or the button is not laid out at all',
  ).toEqual({ label: true, field: true, button: true })
  if (!label || !field || !button) return

  // A pixel of tolerance throughout, as elsewhere in this file: sub-pixel
  // layout rounding is not a layout bug.
  const startsAtTheLeftEdge = field.x <= label.x + 1
  const pairReachesTheRightEdge = button.x + button.width >= label.x + label.width - 1
  // And the space is taken by the field rather than by a gap. Without this, a
  // row that justified its two controls to the edges would satisfy both of the
  // above with the field at its intrinsic width and a hole in the middle. Half
  // is a floor well under the ~78% measured today and well over the ~35% an
  // unstretched field would give.
  const theFieldTakesTheSpace = field.width >= label.width * 0.5

  expect(
    { startsAtTheLeftEdge, pairReachesTheRightEdge, theFieldTakesTheSpace },
    'the date field no longer fills the record row — a rule sizing the form’s date ' +
      'field to its content has reached this one too. ' +
      `Row (from its label) x ${label.x.toFixed(1)}–${(label.x + label.width).toFixed(1)}; ` +
      `field x ${field.x.toFixed(1)}–${(field.x + field.width).toFixed(1)} ` +
      `(${field.width.toFixed(1)}px, ${((field.width / label.width) * 100).toFixed(0)}% of the row); ` +
      `button x ${button.x.toFixed(1)}–${(button.x + button.width).toFixed(1)}.`,
  ).toEqual({
    startsAtTheLeftEdge: true,
    pairReachesTheRightEdge: true,
    theFieldTakesTheSpace: true,
  })
})
