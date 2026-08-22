import { test, expect } from '@playwright/test'
import { APP_STATES, hasControlsToSweep } from '../support/app'
import {
  INTERACTIVE_SELECTOR,
  focusNthControl,
  readControlBoxes,
  readFocusIndicator,
} from '../support/probe'
import type { FocusBackgroundLayer, FocusReading, Rect } from '../support/probe'
import {
  composite,
  contrastRatio,
  describeColour,
  flattenBackground,
  parseCssColour,
} from '../support/colour'
import type { Rgba } from '../support/colour'

/**
 * T088 — the focus indicator, measured. Takes over the manual T073.
 *
 * Principle II requires "a visible focus indicator at all times", and until now
 * **no tier could check it**. axe does not test focus visibility in any
 * environment. jsdom cannot: it paints nothing and resolves no cascaded colour.
 * `focus.css` therefore carried its guarantee as a hand-written comment, and an
 * earlier revision of that comment recorded a ring at "3.6:1 ✅" that actually
 * measured 2.69:1 — below the 3:1 floor. A fabricated number sat in the file as
 * evidence, and nothing in the repository could contradict it.
 *
 * This file contradicts it. Every number below is read out of a real engine.
 *
 * ## What is asserted, and why in this shape
 *
 * For each control, focused the way a keyboard user focuses it:
 *
 *   1. The engine agrees this is keyboard focus (`:focus-visible` matches). If
 *      it does not, `focus.css`'s `:focus:not(:focus-visible) { outline: none }`
 *      is actively removing the ring, which is worth knowing.
 *   2. An indicator is actually drawn — an outline with non-zero width and a
 *      non-transparent colour, or a ring-shaped `box-shadow`.
 *   3. The indicator reaches 3:1 against the surface it is drawn on.
 *
 * Point 3 needs care, because the app's ring is deliberately two-tone: a white
 * ring hugging the element and a near-black one outside it. Requiring *both* to
 * clear 3:1 against their neighbour would fail correct CSS — the white inner
 * ring is invisible against a white button, and it is meant to be; the outer
 * ring is what delimits it there. Requiring *neither* would check nothing. So
 * the rule is: the layer touching the page must clear 3:1 against the page, or
 * the layer touching the element must clear 3:1 against the element. At least
 * one boundary of the indicator has to be perceivable.
 *
 * Which surface a layer touches follows from `outline-offset`: positive puts
 * the outline outside the element, over whatever the ancestors paint; negative
 * puts it inside, over the element's own background. That is exactly the
 * distinction that makes 2.69:1 either irrelevant or fatal, so it is computed
 * rather than assumed.
 *
 * ## What this does NOT cover
 *
 * WCAG 2.4.11 also constrains the indicator's *area* and its thickness relative
 * to the component, and 2.4.12 concerns it being obscured by other content.
 * Neither is checked here; this is a necessary condition, not full conformance.
 * A ring that meets every number here can still be hidden behind a sticky
 * header — that stays on the manual checklist.
 *
 * Nor does it cover a ring drawn *over* a background image. Where an image can
 * be shown not to reach the ring the measurement proceeds; where it can be shown
 * to reach it, or cannot be pinned down at all, this throws rather than
 * averaging. See `resolveBackground` below for exactly where that line falls.
 */
const MIN_INDICATOR_CONTRAST = 3

/** One drawn ring, and which surface it is painted against. */
interface IndicatorLayer {
  what: string
  colour: Rgba
  touches: 'the page behind the control' | "the control's own background"
  /**
   * Where the ring sits, as signed distances from the border box edge, outward
   * positive. `{ from: 2, to: 5 }` is a band starting 2px outside the element
   * and ending 5px outside it; negative numbers are inside it.
   */
  band: { from: number; to: number }
}

/**
 * ## Why a background image no longer refuses the whole measurement
 *
 * An element that paints an image genuinely can make the colour behind text
 * unknowable — a photograph or a gradient has no single value, and guessing an
 * average would be the sort of check that cannot check. That is why this threw.
 *
 * But "this element paints an image" is not the question. The question is
 * whether the image can be *under the thing being measured*. `app.css` draws the
 * dropdown arrow as a 12x8 graphic pinned 12.75px from the select's right edge,
 * with padding reserving that strip; the focus ring hugs the border. The two
 * cannot touch, and refusing to measure there was refusing on a fact that had
 * not been established.
 *
 * So the guard now establishes it. The probe resolves each image's painted
 * rectangle from its intrinsic size, `background-size`, `background-origin` and
 * `background-position`, and reports `unbounded` for anything it cannot pin
 * down: a gradient, any `repeat`, `cover` or `contain`, a transform or filter,
 * an image with no intrinsic size. `unbounded` throws exactly as before. A
 * bounded image throws if — and only if — its rectangle overlaps the region
 * being measured.
 *
 * Two deliberate biases, both toward throwing. The probe's rectangle ignores
 * `background-clip` and `border-radius`, which can only ever shrink what is
 * painted. And the region below is the ring's own band widened by its own
 * thickness on both sides, so the surface the ring is judged *against*, not only
 * the pixels it covers, is included.
 *
 * What this now lets through that it did not before: an image on an ancestor
 * whose rectangle misses the ring, even where the element's own background is
 * translucent enough for it to show through elsewhere. That is correct for this
 * measurement — the ring is only compared with the surface it touches — but it
 * is a real widening, and it is the reason the region is computed per surface
 * rather than once for the element.
 */
function expand(rect: Rect, by: number): Rect {
  return {
    x: rect.x - by,
    y: rect.y - by,
    width: rect.width + 2 * by,
    height: rect.height + 2 * by,
  }
}

/**
 * The frame between two signed distances from a border box — the shape a ring
 * actually occupies, as up to four rectangles.
 *
 * Using the frame rather than the whole outer rectangle is the entire point: the
 * outer rectangle of the select's ring contains the arrow, and the frame does
 * not.
 */
function frameRects(border: Rect, from: number, to: number): Rect[] {
  if (to <= from) return []
  const outer = expand(border, to)
  const inner = expand(border, from)
  if (inner.width <= 0 || inner.height <= 0) return [outer]

  const rects: Rect[] = [
    { x: outer.x, y: outer.y, width: outer.width, height: inner.y - outer.y },
    {
      x: outer.x,
      y: inner.y + inner.height,
      width: outer.width,
      height: outer.y + outer.height - (inner.y + inner.height),
    },
    { x: outer.x, y: inner.y, width: inner.x - outer.x, height: inner.height },
    {
      x: inner.x + inner.width,
      y: inner.y,
      width: outer.x + outer.width - (inner.x + inner.width),
      height: inner.height,
    },
  ]
  return rects.filter((r) => r.width > 0 && r.height > 0)
}

/**
 * Do these overlap? With half a pixel of slack, in the direction of caution.
 *
 * Sub-pixel layout and device pixel ratios mean a graphic that stops a fraction
 * of a pixel short of the ring can still bleed into it, so "very nearly
 * touching" counts as overlapping and throws.
 */
function overlaps(a: Rect, b: Rect): boolean {
  const slack = 0.5
  return (
    a.x - slack < b.x + b.width &&
    b.x < a.x + a.width + slack &&
    a.y - slack < b.y + b.height &&
    b.y < a.y + a.height + slack
  )
}

function resolveBackground(
  layers: FocusBackgroundLayer[],
  region: Rect[],
  context: string,
): Rgba {
  const blended = layers.find((l) => l.opacity < 1)
  if (blended) {
    throw new Error(
      `Cannot resolve the background behind ${context}: ${blended.element} has opacity ` +
        `${blended.opacity}, which blends its whole subtree. Failing loudly rather than ` +
        'measuring a colour that is not what is on screen.',
    )
  }

  for (const layer of layers) {
    if (layer.paint.kind === 'unbounded') {
      throw new Error(
        `Cannot resolve the background behind ${context}: ${layer.element} paints ` +
          `"${layer.image}" and where it lands cannot be established — ${layer.paint.why}. ` +
          'Refusing to measure a colour that may not be the one on screen.',
      )
    }

    if (layer.paint.kind === 'bounded') {
      const hit = layer.paint.rects.find((r) => region.some((m) => overlaps(r, m)))
      if (hit) {
        throw new Error(
          `Cannot resolve the background behind ${context}: ${layer.element} paints ` +
            `"${layer.image}" at ${describeRect(hit)}, which overlaps the region being ` +
            `measured (${region.map(describeRect).join(', ')}), so the colour there is ` +
            'not a single value.',
        )
      }
    }
  }

  return flattenBackground(
    layers.map((l) => parseCssColour(l.colour, `${l.element} background`)),
    context,
  )
}

function describeRect(r: Rect): string {
  const n = (v: number) => Math.round(v * 100) / 100
  return `${n(r.width)}x${n(r.height)} at (${n(r.x)}, ${n(r.y)})`
}

/**
 * Pull ring-shaped shadows out of a computed `box-shadow`.
 *
 * A ring is `0 0 0 <spread>` — no offset, no blur, positive spread. Shadows
 * with an offset or a blur are decoration, not an indicator, and counting them
 * would let a drop shadow stand in for a focus ring.
 */
function ringShadows(boxShadow: string): { colour: Rgba; spreadPx: number }[] {
  if (boxShadow === 'none' || boxShadow.trim() === '') return []

  // Split on commas that are not inside a colour function.
  const parts = boxShadow.split(/,(?![^(]*\))/)
  const rings: { colour: Rgba; spreadPx: number }[] = []

  for (const part of parts) {
    const colourMatch = /(rgba?\([^)]*\)|color\([^)]*\))/.exec(part)
    if (!colourMatch?.[1]) continue

    const lengths = part
      .replace(colourMatch[1], '')
      .trim()
      .split(/\s+/)
      .filter((t) => t.endsWith('px'))
      .map((t) => parseFloat(t))

    const [offsetX = 0, offsetY = 0, blur = 0, spread = 0] = lengths
    if (offsetX === 0 && offsetY === 0 && blur === 0 && spread > 0) {
      rings.push({ colour: parseCssColour(colourMatch[1], 'box-shadow ring'), spreadPx: spread })
    }
  }

  return rings
}

function indicatorLayers(reading: FocusReading): IndicatorLayer[] {
  const layers: IndicatorLayer[] = []

  const outline = parseCssColour(reading.outlineColour, `${reading.element} outline-color`)
  if (reading.outlineStyle !== 'none' && reading.outlineWidthPx > 0 && outline.a > 0) {
    layers.push({
      what: `outline (${reading.outlineWidthPx}px ${reading.outlineStyle}, offset ${reading.outlineOffsetPx}px)`,
      colour: outline,
      touches:
        reading.outlineOffsetPx >= 0
          ? 'the page behind the control'
          : "the control's own background",
      // `outline-offset` positions the outline's *inner* edge; it is drawn
      // outwards from there. A negative offset therefore lands the band inside
      // the element, which is what makes it touch the element's own background.
      band: {
        from: reading.outlineOffsetPx,
        to: reading.outlineOffsetPx + reading.outlineWidthPx,
      },
    })
  }

  for (const ring of ringShadows(reading.boxShadow)) {
    layers.push({
      what: 'box-shadow ring',
      colour: ring.colour,
      // A ring shadow is drawn from the border box outwards, so its inner edge
      // is always against the element itself.
      touches: "the control's own background",
      band: { from: 0, to: ring.spreadPx },
    })
  }

  return layers
}

/**
 * The region a set of indicator layers is measured over: their bands, widened by
 * each band's own thickness on both sides so the adjacent surface counts too.
 */
function measuredRegion(layers: IndicatorLayer[], borderBox: Rect): Rect[] {
  const thickness = (b: { from: number; to: number }) => b.to - b.from
  const from = Math.min(...layers.map((l) => l.band.from - thickness(l.band)))
  const to = Math.max(...layers.map((l) => l.band.to + thickness(l.band)))
  return frameRects(borderBox, from, to)
}

for (const state of APP_STATES) {
  test(`every control shows a measurable focus indicator: ${state.name}`, async ({
    page,
    browserName,
  }) => {
    await state.go(page)

    const controls = await page.evaluate(readControlBoxes, INTERACTIVE_SELECTOR)
    // Nothing to focus means nothing to measure, so the count is asserted
    // rather than assumed; the state that legitimately has no controls says so
    // and is asserted to have none instead. See `hasControlsToSweep`.
    if (!hasControlsToSweep(state, controls.map((control) => control.element))) return

    // Establish keyboard modality. Both engines grant `:focus-visible` to a
    // programmatic focus that follows a key press; without this first press
    // they would treat every focus below as pointer-driven and correctly
    // suppress the ring, and the sweep would measure the wrong thing.
    await page.keyboard.press('Tab')

    const failures: string[] = []
    const unmeasurable: string[] = []

    for (let index = 0; index < controls.length; index++) {
      const focused = await page.evaluate(focusNthControl, {
        selector: INTERACTIVE_SELECTOR,
        index,
      })
      expect(focused, `could not focus control ${index} in "${state.name}"`).toBe(true)

      const reading = await page.evaluate(readFocusIndicator)
      expect(reading, `no active element after focusing control ${index}`).not.toBeNull()
      if (!reading) continue

      /**
       * The one documented exemption, and it is a real finding rather than a
       * convenience: WebKit never matches `:focus-visible` on `input[type=date]`,
       * whether it is reached by Tab or focused programmatically. The app's own
       * ring is therefore suppressed on that control in Safari — on the iPhone,
       * which is the target device. WebKit draws its own highlight on the
       * active date segment inside a shadow root this cannot reach, so whether
       * the result is adequate is a judgement for a person looking at a phone.
       *
       * The exemption asserts that it is still needed. If WebKit starts
       * matching `:focus-visible` here, this line fails and the exemption gets
       * deleted, rather than quietly outliving the reason for it.
       */
      if (browserName === 'webkit' && reading.tag === 'input' && reading.type === 'date') {
        expect(
          reading.focusVisible,
          'WebKit now matches :focus-visible on a date input — delete this exemption ' +
            'and let the check run',
        ).toBe(false)
        unmeasurable.push(reading.element)
        continue
      }

      if (!reading.focusVisible) {
        failures.push(
          `${reading.element}: the engine does not match :focus-visible, so ` +
            'focus.css strips the indicator on this control',
        )
        continue
      }

      const layers = indicatorLayers(reading)
      if (layers.length === 0) {
        failures.push(
          `${reading.element}: no focus indicator drawn ` +
            `(outline: ${reading.outlineStyle} ${reading.outlineWidthPx}px, ` +
            `box-shadow: ${reading.boxShadow})`,
        )
        continue
      }

      // Resolved per surface, and only for surfaces something is actually drawn
      // on: each is measured over the region its own layers occupy, so an image
      // elsewhere on the element or its ancestors does not stop the measurement.
      const chainFor = {
        'the page behind the control': {
          layers: reading.outsideBackground,
          context: `${reading.element} (outside)`,
        },
        "the control's own background": {
          layers: reading.ownBackground,
          context: `${reading.element} (own)`,
        },
      } as const

      const surfaces = new Map<IndicatorLayer['touches'], Rgba>()
      for (const touches of new Set(layers.map((l) => l.touches))) {
        const chain = chainFor[touches]
        const region = measuredRegion(
          layers.filter((l) => l.touches === touches),
          reading.box,
        )
        surfaces.set(touches, resolveBackground(chain.layers, region, chain.context))
      }

      const measured = layers.map((layer) => {
        const surface = surfaces.get(layer.touches)
        if (!surface) throw new Error(`no surface resolved for ${layer.touches}`)
        // A translucent ring shows the surface through it; composite before
        // measuring, or the number describes a colour nobody sees.
        const painted = layer.colour.a < 1 ? composite(layer.colour, surface) : layer.colour
        return {
          layer,
          surface,
          ratio: contrastRatio(painted, surface),
          painted,
        }
      })

      const best = measured.reduce((a, b) => (a.ratio >= b.ratio ? a : b))

      if (best.ratio < MIN_INDICATOR_CONTRAST) {
        failures.push(
          `${reading.element}: focus indicator reaches only ${best.ratio.toFixed(2)}:1, ` +
            `needs ${MIN_INDICATOR_CONTRAST}:1. ` +
            measured
              .map(
                (m) =>
                  `${m.layer.what} ${describeColour(m.painted)} against ${m.layer.touches} ` +
                  `${describeColour(m.surface)} = ${m.ratio.toFixed(2)}:1`,
              )
              .join('; '),
        )
      }
    }

    for (const element of unmeasurable) {
      test.info().annotations.push({
        type: 'not covered',
        description: `${element} — WebKit suppresses :focus-visible on date inputs; its own indicator lives in a shadow root. Manual check on a real iPhone (T073).`,
      })
    }

    expect(failures, `focus indicator failures in "${state.name}"`).toEqual([])
  })
}

/**
 * Tab order, Chromium only — and the reason is not a shortcut.
 *
 * Playwright's WebKit inherits macOS Safari's default of not moving focus to
 * buttons with Tab, so a tab-driven sweep there reaches the text inputs and
 * stops. Running it anyway would report a pass for a traversal that never
 * happened, which is precisely the kind of check the constitution forbids. The
 * indicator sweep above covers every control on both engines by focusing them
 * directly; this adds the ordering guarantee where the engine will give it.
 *
 * Keyboard completability on a real iPhone with a hardware keyboard stays on
 * the manual checklist.
 */
test.describe('tab order', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'WebKit does not Tab to buttons by default; a tab sweep there would pass without traversing',
  )

  for (const state of APP_STATES) {
    test(`Tab reaches every control: ${state.name}`, async ({ page }) => {
      await state.go(page)

      const controls = await page.evaluate(readControlBoxes, INTERACTIVE_SELECTOR)
      const expected = new Set(controls.map((c) => c.element))
      // A state with nothing to reach would report a traversal that never
      // happened; the one state that has nothing declares it. See
      // `hasControlsToSweep`.
      if (!hasControlsToSweep(state, [...expected])) return

      const seen = new Set<string>()
      // Enough presses to wrap the document twice, plus slack for composite
      // controls (a date input consumes one Tab per segment). Bounded, so a
      // control that can never be reached fails rather than hangs.
      const presses = controls.length * 3 + 10

      for (let i = 0; i < presses && seen.size < expected.size; i++) {
        await page.keyboard.press('Tab')
        const reading = await page.evaluate(readFocusIndicator)
        if (reading) seen.add(reading.element)
      }

      const unreachable = [...expected].filter((c) => !seen.has(c))
      expect(unreachable, `controls Tab never reached in "${state.name}"`).toEqual([])
    })
  }
})
