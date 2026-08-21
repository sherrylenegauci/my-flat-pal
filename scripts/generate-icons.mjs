/**
 * Rasterise the mark into the three home-screen icons.
 *
 *   node scripts/generate-icons.mjs
 *
 * ## Why a script and not a design tool
 *
 * The icons this replaces were a generic white house on a warm near-black that
 * appears nowhere in `src/ui/tokens.css`. They were drawn in the app's *first*
 * palette and survived two complete design passes untouched, because no
 * stylesheet reaches a PNG and no test tier had ever opened one. Generating them
 * from the same geometry the header draws, in colours read out of `tokens.css`
 * at generation time, is half the fix. The other half is
 * `tests/assets/icons.test.ts`, which reads the resulting pixels back and
 * compares them against those same tokens — so changing the palette without
 * re-running this turns the suite red instead of shipping.
 *
 * ## Why Playwright rather than an image library
 *
 * Principle I. Playwright is already a devDependency for the real-browser tier,
 * and a browser is the one thing in this repository that already knows how to
 * turn an SVG into a PNG. A rasteriser would be a new dependency for one call
 * site, which is what that principle exists to make expensive.
 *
 * The output is not committed by this script running in CI — it writes into
 * `public/icons/` and those files are committed like any other asset, because
 * the build copies `public/` verbatim and a missing icon is an install failure
 * rather than a test failure.
 */

import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const mark = await import(join(root, 'src/ui/mark.ts'))
const { readToken, iconSvg } = await import(join(here, 'mark-svg.ts'))

const tokens = join(root, 'src/ui/tokens.css')
const ground = readToken(tokens, '--accent')
const figure = readToken(tokens, '--surface')

/**
 * `fraction` differs per file and the maskable one is the reason.
 *
 * Android crops a maskable icon to an arbitrary shape and guarantees only the
 * inner 80%. A centred square of side s has its corners at s x root(2) / 2 from
 * the centre, so it survives that crop only while s stays under 56.6% of the
 * canvas. 52% leaves about 16px of clearance at 512, and
 * `tests/assets/icons.test.ts` checks the pixels rather than trusting this
 * comment.
 */
const FILES = [
  { name: 'icon-192.png', size: 192, fraction: mark.MARK_SCALE.icon },
  { name: 'icon-512.png', size: 512, fraction: mark.MARK_SCALE.icon },
  { name: 'icon-512-maskable.png', size: 512, fraction: mark.MARK_SCALE.maskable },
]

const browser = await chromium.launch()
try {
  for (const file of FILES) {
    const svg = iconSvg(mark, { size: file.size, fraction: file.fraction, ground, figure })
    // A fresh page per icon: the viewport is the canvas, so it has to change
    // with the size, and a page whose viewport is wrong crops silently.
    const page = await browser.newPage({
      viewport: { width: file.size, height: file.size },
      deviceScaleFactor: 1,
    })
    await page.setContent(
      `<!doctype html><html><body style="margin:0;padding:0;line-height:0">${svg}</body></html>`,
    )
    const png = await page.screenshot({ type: 'png' })
    writeFileSync(join(root, 'public/icons', file.name), png)
    await page.close()
    console.log(`wrote public/icons/${file.name}  ${file.size}x${file.size}  ` +
      `ground ${ground}  figure ${figure}  mark at ${Math.round(file.fraction * 100)}%`)
  }
} finally {
  await browser.close()
}
