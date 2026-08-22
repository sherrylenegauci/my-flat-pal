import { test, expect } from '@playwright/test'
import { openScheduleList } from './support/app'
import { contrastRatio, describeColour, parseCssColour } from './support/colour'
import type { Rgba } from './support/colour'
// Across the tier boundary on purpose. `tests/support/` holds two things this
// needs and neither is jsdom-flavoured: a PNG decoder, and the one parser that
// reads the palette out of `tokens.css`. Copying either here would give the two
// tiers separate answers to the same question, which is the class of drift this
// whole change exists to close.
import { decodePng } from '../tests/support/png'
import { FLAT_FILL_TOLERANCE, describeToken, readColourToken } from '../tests/support/tokens'

/**
 * The app's mark, in an engine that actually paints it.
 *
 * ## Why none of this can live in jsdom
 *
 * `tests/ui/mark.test.tsx` holds the half of this change a screen reader meets:
 * the heading still says "FlatPal", once, and the mark announces nothing.
 * That is everything the tier below can honestly claim. It lays nothing out —
 * every element there reports a zero-sized box — and it resolves no cascaded
 * colour, so "the mark is drawn" and "the mark is visible against its ground"
 * would both pass there whatever the stylesheet said, including when the mark
 * is not on the page at all.
 *
 * Here the numbers come from Chromium and WebKit, which have laid the page out
 * and resolved the cascade. WebKit is the one that counts: the target device is
 * an iPhone, where every browser is WebKit.
 *
 * ## Why this file reaches for class names, when nothing else in `e2e/` does
 *
 * Everywhere else in this directory, elements are found by role and by the words
 * a user reads. That is not available here and cannot be made available: the
 * mark is decorative, so it deliberately has no role, no name and no text — that
 * is the contract `tests/ui/mark.test.tsx` enforces. A computed `fill` has to be
 * read off a specific element, and `.mark`, `.mark__ground` and `.mark__figure`
 * are the only handles that exist.
 *
 * They are the *smallest* handles that work, and nothing below asserts anything
 * about the drawing itself — no path data, no shape count, no transform, no
 * size in pixels beyond "not zero". Those are all free to change; what is pinned
 * is that the mark reaches the screen and that its two colours can be told
 * apart.
 *
 * ## Why this is not a sweep over APP_STATES
 *
 * The mark is in the shell's header, drawn once, painted by one stylesheet that
 * every view loads. Sweeping twelve states across two engines would restate one
 * document-level fact forty-eight times and hand a maintainer forty-eight
 * identical failures. Same reasoning as `e2e/typeface.spec.ts`, and the same
 * caveat: it holds while no view loads CSS of its own, which is true today.
 *
 * ## What this file does not cover
 *
 * - **The app icons.** The same geometry is rasterised into
 *   `public/icons/*.png`, and no browser test can see those files.
 *   `tests/assets/icons.test.ts` reads their pixels.
 * - **Page-level horizontal overflow at 375px.** Already swept, for every state
 *   in `APP_STATES` and in both engines, by `e2e/layout.spec.ts` — its
 *   `readOverflow` probe walks every element under `<body>` and reports any
 *   whose right edge passes the viewport, so the mark is covered there the
 *   moment it exists. Repeating it here would add a duplicate failure, not a
 *   check. What is asserted below instead is the thing that sweep cannot see:
 *   content pushed *within* the header rather than past the viewport.
 * - **The mark's contrast against the header behind it.** WCAG 1.4.11 applies to
 *   the ground-versus-figure pair, which is what makes the mark readable as a
 *   drawing; `--accent` on `--surface` is a separate pair, recorded at 7.35:1 in
 *   `tokens.css` and already walked as a text pair by `e2e/contrast.spec.ts`.
 * - **Whether it reads as anything.** Whether the mark looks like a flat, holds
 *   up at 48px on a home screen, or sits well beside the wordmark are judgements
 *   about a rendered image and stay on the manual checklist in plan.md.
 */

/** WCAG 1.4.11: non-text interface components need 3:1 against what is adjacent. */
const MIN_NON_TEXT_RATIO = 3

interface ShapeReading {
  element: string
  fill: string
  stroke: string
  strokeWidth: string
}

interface MarkReading {
  markFound: boolean
  ground: ShapeReading[] | null
  figure: ShapeReading[] | null
}

/**
 * Every painted shape in the mark, with the paint properties the engine
 * resolved.
 *
 * Both `fill` and `stroke` are read, and the caller decides which one is doing
 * the painting. That is not hedging: `src/ui/mark.ts` describes its shapes as
 * `paint: 'stroke' | 'fill'`, and its current two shapes are both strokes, so a
 * test that read only `fill` would report `none` for the figure and force the
 * implementation into a fill it was never meant to use.
 *
 * A `<g>` is not a painted shape, so `.mark__figure` contributes its child paths
 * rather than itself. That also means it does not matter whether the colour is
 * declared on the group and inherited or set on each path — the value is read
 * off whatever the engine is actually painting.
 */
function readMark(): MarkReading {
  // Declared inside, not above: this function is serialised and re-evaluated in
  // the page, so anything it closes over in this module simply is not there.
  const SHAPES = 'path, rect, circle, ellipse, polygon, polyline, line'

  const describe = (el: Element): string =>
    `${el.tagName.toLowerCase()}${el.classList.length > 0 ? `.${[...el.classList].join('.')}` : ''}`

  const paintsOf = (selector: string): ShapeReading[] | null => {
    const root = document.querySelector(selector)
    if (root === null) return null

    return [root, ...Array.from(root.querySelectorAll(SHAPES))]
      .filter((el) => el.matches(SHAPES))
      .map((el) => {
        const style = getComputedStyle(el)
        return {
          element: describe(el),
          fill: style.fill,
          stroke: style.stroke,
          strokeWidth: style.strokeWidth,
        }
      })
  }

  return {
    markFound: document.querySelector('.mark') !== null,
    ground: paintsOf('.mark__ground'),
    figure: paintsOf('.mark__figure'),
  }
}

/**
 * The colours a shape is actually painted in.
 *
 * A shape can be filled, stroked, or both, and `none` means that channel paints
 * nothing at all. Anything that is neither `none` nor a colour this can parse
 * throws rather than being skipped — a paint that could not be resolved is a
 * contrast check that did not run, and `e2e/support/colour.ts` exists on exactly
 * that principle.
 */
function paintedColours(shape: ShapeReading, context: string): Rgba[] {
  const colours: Rgba[] = []

  if (shape.fill !== 'none') {
    colours.push(parseCssColour(shape.fill, `${context} ${shape.element} fill`))
  }
  if (shape.stroke !== 'none' && Number.parseFloat(shape.strokeWidth) > 0) {
    colours.push(parseCssColour(shape.stroke, `${context} ${shape.element} stroke`))
  }

  return colours
}

function distinct(colours: Rgba[]): Rgba[] {
  const seen = new Map<string, Rgba>()
  for (const colour of colours) seen.set(describeColour(colour), colour)
  return [...seen.values()]
}

/**
 * The mark, as pixels the engine actually painted.
 *
 * ## Why reading `fill` was not enough, and how that was found
 *
 * Every other assertion in this file reads *paint properties* through
 * `getComputedStyle`. Independent verification broke that: adding
 * `opacity: 0` to `.mark__outline` left all six tests in this file green in both
 * engines, because a hidden element still reports `stroke: rgb(255, 255, 255)`.
 * The header rendered a bare teal tile with no drawing on it and nothing
 * noticed. `visibility: hidden` and a zero-alpha stroke hide the same way.
 *
 * The file already guarded the two shapes of that bug it had thought of —
 * `fill: none; stroke: none`, and a zero stroke width — which is what made the
 * omission an oversight rather than a decision. A screenshot has no such gaps:
 * whatever is in the image is what a person sees.
 *
 * ## It also closes a second hole, and this one is Principle V
 *
 * Nothing checked that the header mark uses the *tokens*. Replacing
 * `.mark__figure`'s `var(--surface)` with a literal `#ffff00` passed
 * `mark.spec.ts`, `contrast.spec.ts` and the axe sweep together, because
 * yellow on teal clears the contrast floor and no other check looks at which
 * colour it is. `tests/assets/icons.test.ts` compares the icons against
 * `tokens.css`; this makes the header answer the same question.
 */
test('the mark is painted, in the app’s two colours', async ({ page }) => {
  await openScheduleList(page)

  const ground = readColourToken('--accent')
  const figure = readColourToken('--surface')

  const shot = await page.locator('.mark').screenshot({ type: 'png' })
  const image = decodePng(shot, 'a screenshot of .mark')

  /**
   * Only pixels inside the tile are counted, and the reason is a trap this test
   * fell into on its first run.
   *
   * `--surface` is both the mark's own colour *and* the colour of the header it
   * sits on. The tile has a corner radius, so an element screenshot's bounding
   * box includes four corners of bare header — about 10% of it, all of them
   * `--surface`. With the figure deliberately hidden the test still measured a
   * 10.08% "figure" share and passed, which is the same shape of false pass it
   * was written to remove.
   *
   * A centred circle inscribed in the tile excludes those corners. It contains
   * the whole mark with room to spare: the mark box is 66% of the tile, so its
   * furthest corner sits at 0.467 of the side from the centre against a radius
   * of 0.48.
   */
  const radius = Math.min(image.width, image.height) * 0.48
  const centreX = image.width / 2
  const centreY = image.height / 2

  const inside = image.pixels.filter((_, index) => {
    const dx = (index % image.width) + 0.5 - centreX
    const dy = Math.floor(index / image.width) + 0.5 - centreY
    return Math.hypot(dx, dy) <= radius
  })

  const total = inside.length
  const share = (colour: { r: number; g: number; b: number }) =>
    inside.filter(
      (p) =>
        p.a === 255 &&
        Math.abs(p.r - colour.r) <= FLAT_FILL_TOLERANCE &&
        Math.abs(p.g - colour.g) <= FLAT_FILL_TOLERANCE &&
        Math.abs(p.b - colour.b) <= FLAT_FILL_TOLERANCE,
    ).length / total

  const groundShare = share(ground)
  const figureShare = share(figure)

  // Floors rather than exact counts, for the reason `tests/assets/icons.test.ts`
  // gives at length: the precise coverage is a function of the drawing, which is
  // free to change, and pinning it would make this a test of the current shapes.
  // What is being asked is the crude question — is the mark there, in the right
  // two colours.
  expect(
    { ground: groundShare >= 0.4, figure: figureShare >= 0.03 },
    `the mark is not painted in the app's colours. Of the ${total} pixels inside the tile, ` +
      `${(groundShare * 100).toFixed(1)}% are --accent (${describeToken(ground)}) and ` +
      `${(figureShare * 100).toFixed(1)}% are --surface (${describeToken(figure)}), both ` +
      'read from src/ui/tokens.css. A figure share near zero means the mark is ' +
      'hidden or drawn in the ground colour; a ground share near zero means the ' +
      'tile is not the accent.',
  ).toEqual({ ground: true, figure: true })
})

test('the mark is on the screen, with a size', async ({ page }) => {
  await openScheduleList(page)

  const mark = page.locator('.mark')

  await expect(mark, 'the header draws no mark at all').toHaveCount(1)

  const box = await mark.boundingBox()

  expect(box, 'the mark is in the DOM but is not laid out — nothing is painted').not.toBeNull()
  if (box === null) return

  // Not a size, just a size. What the mark should measure is a design decision
  // that will move; that it measures anything at all is the claim. A zero box is
  // what an `<svg>` with no `width`, no `viewBox`, or `display: none` produces,
  // and every one of those is invisible to the tier below.
  expect(
    { width: box.width > 0, height: box.height > 0 },
    `the mark occupies no space: ${box.width}x${box.height}`,
  ).toEqual({ width: true, height: true })
})

test('the mark’s figure meets 3:1 against its ground', async ({ page }) => {
  await openScheduleList(page)

  const reading = await page.evaluate(readMark)

  expect(reading.markFound, 'no .mark in the header, so there is nothing to measure').toBe(true)
  expect(reading.ground, 'the mark has no .mark__ground, so there is no ground to measure').not.toBeNull()
  expect(reading.figure, 'the mark has no .mark__figure, so there is no figure to measure').not.toBeNull()
  if (reading.ground === null || reading.figure === null) return

  const groundColours = distinct(
    reading.ground.flatMap((shape) => paintedColours(shape, 'the mark’s ground')),
  )
  const figureColours = distinct(
    reading.figure.flatMap((shape) => paintedColours(shape, 'the mark’s figure')),
  )

  // The ground is one tile in one colour. If it were two, "the contrast against
  // the ground" would not be a single number and every ratio below would be a
  // half-truth, so this fails rather than picking one.
  expect(
    groundColours.map(describeColour),
    'the mark’s ground is not painted in exactly one colour, so there is no single ' +
      'background to measure the figure against',
  ).toHaveLength(1)

  // And the figure is painted at all. Without this, a figure whose every shape
  // resolved to `fill: none; stroke: none` — invisible — would produce an empty
  // list of failures and pass.
  expect(
    figureColours.length,
    'nothing in the mark’s figure is painted in any colour, so the mark is a blank tile',
  ).toBeGreaterThan(0)

  const ground = groundColours[0]
  if (ground === undefined) return

  const failures = figureColours
    .map((colour) => ({ colour, ratio: contrastRatio(colour, ground) }))
    .filter(({ ratio }) => ratio < MIN_NON_TEXT_RATIO)
    .map(
      ({ colour, ratio }) =>
        `${ratio.toFixed(2)}:1 — ${describeColour(colour)} on ${describeColour(ground)}`,
    )

  const measured = figureColours
    .map((colour) => `${contrastRatio(colour, ground).toFixed(2)}:1`)
    .join(', ')

  expect(
    failures,
    `the mark's figure needs ${MIN_NON_TEXT_RATIO}:1 against its ground (WCAG 1.4.11, ` +
      `non-text interface components). Ground ${describeColour(ground)}; measured ${measured}.`,
  ).toEqual([])
})

test('the mark does not push the header’s contents sideways at 375px', async ({ page }) => {
  await openScheduleList(page)

  // Guard. Every number below is only interesting at the width Principle II
  // requires the layout to be designed at, and that width comes from the
  // project config rather than from this file.
  expect(page.viewportSize()?.width, 'this test is only meaningful at 375px').toBe(375)

  const measurements = await page.evaluate(() => {
    const header = document.querySelector('header')
    const heading = document.querySelector('h1')
    const mark = document.querySelector('.mark')
    if (header === null || heading === null || mark === null) return null

    const box = (el: Element) => {
      const r = el.getBoundingClientRect()
      return { left: r.left, right: r.right, width: r.width }
    }

    return {
      header: box(header),
      heading: box(heading),
      mark: box(mark),
      // An element can hold its children inside a box that fits the viewport and
      // still be scrolled sideways internally — which clips whatever is past the
      // edge. `readOverflow` in e2e/layout.spec.ts walks bounding boxes against
      // the viewport, so it cannot see this.
      headerScrollWidth: header.scrollWidth,
      headerClientWidth: header.clientWidth,
    }
  })

  expect(measurements, 'the header, the heading or the mark is not on the page').not.toBeNull()
  if (measurements === null) return

  const { header, heading, mark, headerScrollWidth, headerClientWidth } = measurements

  // One pixel of tolerance throughout: sub-pixel layout rounding is not a
  // layout bug, and the same allowance is made in e2e/layout.spec.ts.
  const insideHeader = (child: { left: number; right: number }) =>
    child.left >= header.left - 1 && child.right <= header.right + 1

  expect(
    {
      markInsideHeader: insideHeader(mark),
      headingInsideHeader: insideHeader(heading),
      headerDoesNotScroll: headerScrollWidth <= headerClientWidth + 1,
    },
    'the mark has pushed the header’s contents out of it at 375px. ' +
      `Header ${header.left.toFixed(1)}–${header.right.toFixed(1)} ` +
      `(scrollWidth ${headerScrollWidth}, clientWidth ${headerClientWidth}); ` +
      `mark ${mark.left.toFixed(1)}–${mark.right.toFixed(1)}; ` +
      `heading ${heading.left.toFixed(1)}–${heading.right.toFixed(1)}.`,
  ).toEqual({
    markInsideHeader: true,
    headingInsideHeader: true,
    headerDoesNotScroll: true,
  })
})
