import { test, expect } from '@playwright/test'
import { APP_STATES } from './support/app'
import { readTextSamples } from './support/probe'
import type { BackgroundLayer } from './support/probe'
import {
  composite,
  contrastRatio,
  describeColour,
  flattenBackground,
  parseCssColour,
  requiredTextRatio,
} from './support/colour'
import type { Rgba } from './support/colour'

/**
 * T089 (first half) — text contrast per view. Takes over the manual T074.
 *
 * `tokens.css` records a ratio beside every colour pair. Those records are
 * worth something, but they are not what the constitution's gate asks for: a
 * token-pair audit says two colours contrast, not that any *rendered* text is
 * painted in that pair on that background. Between the token and the pixel sit
 * inheritance, `currentColor`, a translucent ancestor, and a rule with higher
 * specificity. This walks the text that is actually on screen.
 *
 * The same walk in jsdom would be a lie. Every `getComputedStyle` there returns
 * the initial value for anything not set inline, so every ratio would come out
 * of the same two default colours regardless of the palette — a check that
 * passes whatever you do to the CSS. That is why `tests/ui/axe-helper.ts`
 * switches `color-contrast` off rather than leaving it on for the look of it.
 *
 * ## Thresholds
 *
 * WCAG 2.1 AA, as Principle II states them: 4.5:1 for body text, 3:1 for large
 * text (24px, or 18.66px when bold).
 *
 * ## What is not covered
 *
 * - Text inside native form controls that the platform draws — an `<option>`
 *   list, a date input's segments. Their painted colour comes from the OS, not
 *   from the stylesheet, so a computed value would not describe what is on the
 *   screen. Skipped in the probe, listed here, still manual.
 * - Text over an image or a gradient. The resolver below still refuses on *any*
 *   background image, without asking where the image lands — unlike the focus
 *   sweep, which now computes that. The difference is deliberate rather than an
 *   oversight: no sample here sits over an image today. `app.css` draws a
 *   dropdown arrow on `select`, but the probe already skips native form-control
 *   internals (their painted colour comes from the platform, not the
 *   stylesheet), so no text sample carries that layer. The day one does, this
 *   will throw rather than guess, and the geometry from
 *   e2e/focus-visibility.spec.ts is what to reach for — `readTextSamples` would
 *   need to report the text's own rectangle first.
 * - Non-text contrast for borders and icons (WCAG 1.4.11). The focus ring is
 *   covered in e2e/focus-visibility.spec.ts; the status border colours are not,
 *   and they are decorative reinforcement of a word rather than the only
 *   signal — see e2e/colour-independence.spec.ts.
 */

function resolveBackground(layers: BackgroundLayer[], context: string): Rgba {
  const blended = layers.find((l) => l.opacity < 1)
  if (blended) {
    throw new Error(
      `Cannot resolve the background behind ${context}: ${blended.element} has opacity ` +
        `${blended.opacity}. Failing loudly rather than measuring a colour nobody sees.`,
    )
  }

  const imaged = layers.find((l) => l.image !== 'none')
  if (imaged) {
    throw new Error(
      `Cannot resolve the background behind ${context}: ${imaged.element} paints ` +
        `"${imaged.image}", so there is no single colour behind the text.`,
    )
  }

  return flattenBackground(
    layers.map((l) => parseCssColour(l.colour, `${l.element} background`)),
    context,
  )
}

for (const state of APP_STATES) {
  test(`text meets AA contrast: ${state.name}`, async ({ page }) => {
    await state.go(page)

    const samples = await page.evaluate(readTextSamples)

    // A view that rendered no text would make every assertion below vacuous.
    expect(samples.length, `no rendered text found in "${state.name}"`).toBeGreaterThan(0)

    const failures: string[] = []

    for (const sample of samples) {
      const background = resolveBackground(sample.background, `"${sample.text}"`)
      const colour = parseCssColour(sample.colour, `${sample.element} color`)
      // Translucent text lets the background through; measure what is painted.
      const painted = colour.a < 1 ? composite(colour, background) : colour

      const ratio = contrastRatio(painted, background)
      const required = requiredTextRatio(sample.fontSizePx, sample.fontWeight)

      if (ratio < required) {
        failures.push(
          `${sample.element} "${sample.text}": ${ratio.toFixed(2)}:1, needs ${required}:1 ` +
            `(${describeColour(painted)} on ${describeColour(background)}, ` +
            `${sample.fontSizePx}px ${sample.fontWeight})`,
        )
      }
    }

    expect(failures, `contrast failures in "${state.name}"`).toEqual([])
  })
}
