import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { decodePng, describePixel, pixelAt } from '../support/png'
import type { DecodedPng } from '../support/png'
import * as mark from '../../src/ui/mark'
import { iconSvg, readToken } from '../../scripts/mark-svg'

/**
 * The icons are the mark, and not merely the mark's colours.
 *
 * ## Why this exists, on top of `icons.test.ts`
 *
 * `tests/assets/icons.test.ts` reads the shipped pixels and compares them with
 * `src/ui/tokens.css`. That is the check whose absence let the icons sit two
 * palettes behind the app for months, and it is worth having. It is also
 * entirely about **colour**: four corner pixels, a ground share, a figure share,
 * and a radius for the maskable file. Nothing in it looks at *shape*.
 *
 * Independent verification proved how wide that leaves the door. Replacing
 * `icon-192.png` with a 30x30 white square jammed in one corner, and
 * `icon-512.png` with a generic house outline — the very drawing this change
 * exists to remove — on the correct ground in the correct white, left the whole
 * suite green at 328 of 328. The stated purpose of that file is "the icons
 * stopped being stale", and it was enforcing only half of it.
 *
 * ## What this asserts, and why it is the strongest thing available
 *
 * That each committed PNG is what `scripts/generate-icons.mjs` produces from
 * `src/ui/mark.ts` today. One assertion pins the geometry, the scale, the
 * transform, the stroke width, the caps and the two tokens at once, and it
 * cannot drift from the drawing because it *is* the drawing — there is no second
 * copy of any number here to go stale.
 *
 * It is also the check that makes the drift impossible rather than merely
 * detectable: a palette change, a geometry change, or a hand-edited PNG all fail
 * here until someone re-runs the generator.
 *
 * ## Pixels, not bytes
 *
 * The generator is byte-for-byte reproducible today — verified — so comparing
 * file bytes would be simpler and would also be a trap. PNG encoding is
 * Chromium's, and a Playwright upgrade that changed the encoder by one byte
 * would turn this red with nothing wrong. Comparing decoded pixels within a
 * small tolerance survives that and still catches a different drawing, which is
 * the thing being defended.
 *
 * ## The cost, stated
 *
 * This launches a browser, so `npx vitest run` now needs Playwright's Chromium
 * installed. That is already true of the browser tier, and the whole run is
 * about two seconds, but it is a real extension of what the unit suite requires
 * and it belongs in the open rather than in a surprise CI failure.
 */

const PROJECT_ROOT = decodeURIComponent(new URL('../../', import.meta.url).pathname)
const TOKENS = `${PROJECT_ROOT}src/ui/tokens.css`
const ICON_DIR = `${PROJECT_ROOT}public/icons/`

/**
 * Per-channel slack on a pixel comparison.
 *
 * Zero would be correct today and brittle tomorrow, for the reason above. Eight
 * absorbs a rasteriser nudging an antialiased edge; it is nowhere near enough to
 * absorb a different shape, since a pixel that is ground in one image and figure
 * in the other differs by 160 to 240 on some channel.
 */
const TOLERANCE = 8

const FILES = [
  { name: 'icon-192.png', size: 192, fraction: mark.MARK_SCALE.icon },
  { name: 'icon-512.png', size: 512, fraction: mark.MARK_SCALE.icon },
  { name: 'icon-512-maskable.png', size: 512, fraction: mark.MARK_SCALE.maskable },
] as const

/** Rasterise one icon the way `scripts/generate-icons.mjs` does. */
async function render(file: (typeof FILES)[number]): Promise<DecodedPng> {
  const ground = readToken(TOKENS, '--accent')
  const figure = readToken(TOKENS, '--surface')
  const svg = iconSvg(mark, { size: file.size, fraction: file.fraction, ground, figure })

  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({
      viewport: { width: file.size, height: file.size },
      deviceScaleFactor: 1,
    })
    await page.setContent(
      `<!doctype html><html><body style="margin:0;padding:0;line-height:0">${svg}</body></html>`,
    )
    return decodePng(await page.screenshot({ type: 'png' }), `a fresh render of ${file.name}`)
  } finally {
    await browser.close()
  }
}

describe('the committed icons are the mark, redrawn', () => {
  for (const file of FILES) {
    it(
      `${file.name} matches what scripts/generate-icons.mjs produces`,
      async () => {
        const committed = decodePng(readFileSync(`${ICON_DIR}${file.name}`), file.name)
        const fresh = await render(file)

        expect(
          { width: committed.width, height: committed.height },
          `${file.name} is not the size the generator produces`,
        ).toEqual({ width: fresh.width, height: fresh.height })

        const differences: string[] = []
        for (let i = 0; i < committed.pixels.length; i += 1) {
          const a = committed.pixels[i]
          const b = fresh.pixels[i]
          if (a === undefined || b === undefined) continue
          const off =
            Math.abs(a.r - b.r) > TOLERANCE ||
            Math.abs(a.g - b.g) > TOLERANCE ||
            Math.abs(a.b - b.b) > TOLERANCE ||
            Math.abs(a.a - b.a) > TOLERANCE
          if (!off) continue
          if (differences.length < 5) {
            const x = i % committed.width
            const y = Math.floor(i / committed.width)
            differences.push(
              `(${x}, ${y}): committed ${describePixel(a)}, redrawn ${describePixel(b)}`,
            )
          }
        }

        // A count as well as examples, so a failure says whether this is a
        // different drawing or a handful of edge pixels.
        const differing = committed.pixels.filter((a, i) => {
          const b = fresh.pixels[i]
          return (
            b !== undefined &&
            (Math.abs(a.r - b.r) > TOLERANCE ||
              Math.abs(a.g - b.g) > TOLERANCE ||
              Math.abs(a.b - b.b) > TOLERANCE)
          )
        }).length

        expect(
          differences,
          `${file.name} is not the drawing in src/ui/mark.ts. ` +
            `${differing} of ${committed.pixels.length} pixels differ by more than ` +
            `${TOLERANCE} per channel. Re-run \`node scripts/generate-icons.mjs\`. ` +
            'First few shown.',
        ).toEqual([])

        // Guard against the comparison being vacuous. If the generator ever
        // produced a blank canvas, every assertion above would hold while the
        // icon said nothing — so check the redrawn image has a mark on it.
        const corner = pixelAt(fresh, 0, 0)
        const centre = pixelAt(fresh, Math.floor(fresh.width / 2), Math.floor(fresh.height / 2))
        expect(
          describePixel(corner) === describePixel(centre) &&
            fresh.pixels.every((p) => describePixel(p) === describePixel(corner)),
          `the freshly rendered ${file.name} is a single flat colour, so comparing ` +
            'the committed file against it proves nothing',
        ).toBe(false)
      },
      // A browser launch on a cold cache. A ceiling that stops a hang, not a
      // performance budget.
      60_000,
    )
  }
})
