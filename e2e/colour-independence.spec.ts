import { test, expect } from '@playwright/test'
import { SEEDED_STATUSES, openScheduleList } from './support/app'
import { readRows } from './support/probe'

/**
 * T089 (second half) — status without colour. Takes over the manual T072.
 *
 * SC-004: which jobs need attention must be readable by someone who cannot
 * distinguish the colours the list also uses. Roughly one man in twelve has
 * some colour vision deficiency, and "overdue" versus "not due yet" is the
 * whole app.
 *
 * ## Why this is done in a browser at all
 *
 * The claim under test is not "the component renders a word" — a jsdom test
 * could assert that, and `tests/ui/schedule-list.test.tsx` does. The claim is
 * "with colour removed, the *rendered page* still says it", and only a real
 * engine can both remove the colour and tell you what is left standing.
 *
 * ## How colour is removed, and how that removal is verified
 *
 * A stylesheet flattens every colour channel the author controls to one pair.
 * That injection could silently fail — a rule that did not apply, a colour
 * arriving from somewhere it does not cover — so the test does not take it on
 * trust. It asserts:
 *
 *   1. Before: the four rows are painted in *different* colour sets, i.e. the
 *      app really does use colour here and there is something to remove.
 *   2. After: all four rows resolve to an *identical* colour set, i.e. nothing
 *      about a row's status can now be told from its colours.
 *   3. And only then, that each job still reads its own distinct status.
 *
 * Without step 2 the suppression would be decoration, and step 3 would pass
 * whether or not colour had been removed at all.
 *
 * ## What is not covered
 *
 * Actual colour-blind perception. Flattening to one colour is a stricter
 * condition than any simulated deficiency, so passing here implies passing
 * under a simulation — but it says nothing about whether the *hues*, when
 * present, are distinguishable to a protanope, which is a judgement no
 * automated check makes. That remains a manual review item.
 */
const REMOVE_ALL_COLOUR = `
  *, *::before, *::after {
    color: #000 !important;
    background-color: #fff !important;
    background-image: none !important;
    border-color: #000 !important;
    outline-color: #000 !important;
    text-decoration-color: #000 !important;
    fill: #000 !important;
    stroke: #000 !important;
    box-shadow: none !important;
    filter: none !important;
  }
`

test('status is readable with colour removed', async ({ page }) => {
  await openScheduleList(page)

  const before = await page.evaluate(readRows)
  expect(before, 'the seeded list did not render').toHaveLength(SEEDED_STATUSES.length)

  // 1. There is colour to remove.
  const distinctPalettes = new Set(before.map((r) => r.colours.join('|')))
  expect(
    distinctPalettes.size,
    'the rows are already painted identically, so this test would prove nothing',
  ).toBeGreaterThan(1)

  // An icon or an image would carry colour this stylesheet cannot reach, which
  // would make the claim "colour has been removed" untrue.
  expect(
    before.flatMap((r) => r.media),
    'a row contains an image, icon or gradient whose colour cannot be suppressed here',
  ).toEqual([])

  await page.addStyleTag({ content: REMOVE_ALL_COLOUR })

  const after = await page.evaluate(readRows)

  // 2. The removal actually worked.
  const palettesAfter = new Set(after.map((r) => r.colours.join('|')))
  expect(
    [...palettesAfter],
    'colour was not fully suppressed, so what follows would not be a colour-free reading',
  ).toHaveLength(1)

  // 3. Every job still states its own status, in words.
  const missing = SEEDED_STATUSES.filter(
    ({ name, status }) => !after.some((row) => row.text.includes(name) && row.text.includes(status)),
  ).map(({ name, status }) => `"${name}" no longer reads as "${status}"`)

  expect(missing, `rendered rows were: ${after.map((r) => `"${r.text}"`).join(', ')}`).toEqual([])

  // And the four statuses are four different words — a single label repeated
  // would satisfy the check above while telling the user nothing.
  expect(new Set(SEEDED_STATUSES.map((s) => s.status)).size).toBe(SEEDED_STATUSES.length)
})
