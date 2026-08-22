import { test, expect } from '@playwright/test'
import { openScheduleList } from '../support/app'
import { readRows } from '../support/probe'
import { AREAS } from '../../src/ui/navigation'

/**
 * T015 — FR-004: with colour removed, you can still tell which area you are in.
 *
 * Same shape as `e2e/rendering/colour-independence.spec.ts`, which asks the
 * same question of a job's status: flatten every colour the author controls to
 * one pair, prove the flattening actually took, and only then read what is
 * left. The tier below cannot do any of this — jsdom resolves no cascaded
 * colour, so a contrast or "is it bold" assertion there passes whatever the
 * stylesheet says. `tests/ui/tab-current.test.tsx` covers the accessibility
 * tree and reads the stylesheet as text; this is the only check that looks at a
 * rendered tab bar.
 *
 * ## Read this before believing a green run: it is skipped, and it will stay
 * skipped until 003
 *
 * FR-008 hides the structure while only one area exists, and this tier drives
 * the real app, which has exactly one area — `AREAS` is `[MAINTENANCE]`.
 * **So there is no tab bar on screen in a browser, and there will not be until
 * rooms is built.** This spec cannot pass or fail today; it is guarded below,
 * and the guard is derived from `AREAS.length` so that the day rooms is added
 * the spec starts running by itself.
 *
 * It is written out in full rather than deferred because writing it later means
 * writing it never, and because a skipped check that says exactly why is honest
 * about the gap. Forcing a second area into the running app to make this go
 * green would not be: it would measure a bar no user can reach and report it as
 * coverage of one they can.
 *
 * **It has therefore never executed.** Nothing below has been observed passing
 * or failing, and the first person to build rooms should expect to adjust it —
 * the probe knows what a tab bar is likely to be made of, not what this one
 * turned out to be. Treat it as a specification with a runner attached.
 *
 * ## What it does not cover, even once it runs
 *
 * Whether the surviving difference is *noticeable*. Flattening to one colour is
 * stricter than any simulated deficiency, so a pass here implies a pass under
 * simulation — but "the current tab is 100 units heavier" is a fact about
 * computed style, not about whether someone standing in a kitchen spots it.
 * That judgement stays on the manual checklist, alongside whether VoiceOver
 * announces the current tab as current (T022).
 */

/**
 * The same stylesheet as `colour-independence.spec.ts`.
 *
 * Deliberately copied rather than shared. Importing it from that spec would
 * make Playwright register its tests twice, and moving it into `e2e/support/`
 * to share it would edit a file the passing sweeps depend on for the sake of a
 * spec that does not run yet. If a third caller appears, move it then — that is
 * the point at which Principle I asks for it.
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

interface TabReading {
  /** What the tab says, which is what a screen reader announces. */
  name: string
  /** Whether the accessibility tree marks this one as the current area. */
  current: boolean
  /** Every colour resolved anywhere in the tab, so "identical" can be asserted. */
  colours: string[]
  /**
   * Everything about the tab that is *not* a colour: weight, size, spacing,
   * borders, and the geometry of any ::before / ::after indicator. Two tabs
   * with the same signature are indistinguishable once colour is gone.
   */
  shape: string
}

/**
 * Read the tab bar out of the rendered page.
 *
 * Runs inside the browser, so it takes no arguments from the test and returns
 * only serialisable values.
 */
function readTabs(): TabReading[] {
  const bars = Array.from(document.querySelectorAll('nav')).filter((nav) =>
    /areas/i.test(nav.getAttribute('aria-label') ?? ''),
  )
  const bar = bars[0]
  if (!bar) return []

  const SHAPE_PROPERTIES = [
    'font-weight',
    'font-size',
    'font-style',
    'font-family',
    'letter-spacing',
    'text-transform',
    'text-decoration-line',
    'text-underline-offset',
    'border-top-width',
    'border-right-width',
    'border-bottom-width',
    'border-left-width',
    'border-top-style',
    'border-right-style',
    'border-bottom-style',
    'border-left-style',
    'outline-width',
    'outline-style',
    'padding-top',
    'padding-bottom',
    'width',
    'height',
  ]

  function describe(element: Element, pseudo: string | null): string {
    const style = getComputedStyle(element, pseudo)
    const parts = SHAPE_PROPERTIES.map((name) => `${name}:${style.getPropertyValue(name)}`)
    if (pseudo !== null) parts.push(`content:${style.getPropertyValue('content')}`)
    return `${pseudo ?? 'self'}{${parts.join(';')}}`
  }

  return Array.from(bar.querySelectorAll('button')).map((button) => {
    const colours = new Set<string>()
    for (const element of [button, ...Array.from(button.querySelectorAll('*'))]) {
      for (const pseudo of [null, '::before', '::after']) {
        const style = getComputedStyle(element, pseudo)
        colours.add(style.color)
        colours.add(style.backgroundColor)
        colours.add(style.backgroundImage)
        colours.add(style.borderTopColor)
        colours.add(style.borderRightColor)
        colours.add(style.borderBottomColor)
        colours.add(style.borderLeftColor)
        colours.add(style.outlineColor)
        colours.add(style.boxShadow)
      }
    }

    const current = (button.getAttribute('aria-current') ?? 'false') !== 'false'

    return {
      name: (button.innerText ?? '').replace(/\s+/g, ' ').trim(),
      current,
      colours: Array.from(colours).sort(),
      shape: [
        describe(button, null),
        describe(button, '::before'),
        describe(button, '::after'),
        ...Array.from(button.querySelectorAll('*')).flatMap((child) => [
          describe(child, null),
          describe(child, '::before'),
          describe(child, '::after'),
        ]),
      ].join('|'),
    }
  })
}

test.describe('the current area, with colour removed', () => {
  test.skip(
    () => AREAS.length < 2,
    'FR-008 hides the tab bar while only one area exists, and the app has one. There is ' +
      'no bar in a real browser to strip the colour out of, so this would measure nothing. ' +
      'It starts running by itself when 003 adds rooms to AREAS.',
  )

  test('the current area is identifiable without colour', async ({ page }) => {
    await openScheduleList(page)

    // 0. There is a bar, with every area in it. A missing bar would make every
    //    comparison below trivially true.
    const before = await page.evaluate(readTabs)
    expect(
      before.map((t) => t.name),
      'no tab bar was found on the schedule list, so this test would measure nothing',
    ).toHaveLength(AREAS.length)

    // 1. There is colour on this page to remove. The seeded list is colour-coded
    //    by status, so if those rows are already painted identically the
    //    stylesheet below cannot be shown to have done anything.
    const rowsBefore = await page.evaluate(readRows)
    expect(
      new Set(rowsBefore.map((row) => row.colours.join('|'))).size,
      'the seeded rows are already painted identically, so the colour strip could not be verified',
    ).toBeGreaterThan(1)

    await page.addStyleTag({ content: REMOVE_ALL_COLOUR })

    // 2. The strip actually took. Without this step everything after it would
    //    pass whether or not any colour had been removed.
    const rowsAfter = await page.evaluate(readRows)
    expect(
      [...new Set(rowsAfter.map((row) => row.colours.join('|')))],
      'colour was not fully suppressed, so what follows would not be a colour-free reading',
    ).toHaveLength(1)

    await expectCurrentToStandOut(await page.evaluate(readTabs))

    // 3. And again after switching, because a marking that is only correct on
    //    the area the app opens at is a marking that never moved.
    const bar = page.getByRole('navigation', { name: /areas/i })
    const other = AREAS.find((area) => area.label !== before.find((t) => t.current)?.name)
    if (!other) throw new Error('every area carries the same label, so there is nothing to switch to')

    await bar.getByRole('button', { name: other.label }).click()
    await expectCurrentToStandOut(await page.evaluate(readTabs))
  })
})

/**
 * With colour gone, exactly one tab is marked current and that tab looks
 * different from every other one in some way that is not a colour.
 *
 * The two halves are separate on purpose. The first is about the accessibility
 * tree and would be satisfied by a bar nobody can read; the second is about
 * what is drawn and would be satisfied by a bar that highlights the wrong tab.
 * FR-004 and FR-005 need both.
 */
async function expectCurrentToStandOut(tabs: TabReading[]): Promise<void> {
  const current = tabs.filter((tab) => tab.current)
  expect(
    current.map((tab) => tab.name),
    'exactly one tab must be marked as the current area',
  ).toHaveLength(1)

  // Colour can no longer be doing the work — every tab resolves to the same set.
  expect(
    [...new Set(tabs.map((tab) => tab.colours.join('|')))],
    `tabs still differ in colour after the strip, so "identifiable without colour" would ` +
      `not have been shown. Tabs: ${tabs.map((t) => t.name).join(', ')}`,
  ).toHaveLength(1)

  const marked = current[0]
  if (!marked) throw new Error('unreachable — the assertion above guarantees one')

  const indistinguishable = tabs
    .filter((tab) => !tab.current && tab.shape === marked.shape)
    .map((tab) => tab.name)

  expect(
    indistinguishable,
    `with colour removed, "${marked.name}" is the current area but is drawn exactly like ` +
      'the tabs that are not. FR-004: the indication must not rely on colour alone — ' +
      'weight, border width, or an indicator edge with a size to it.',
  ).toEqual([])
}
