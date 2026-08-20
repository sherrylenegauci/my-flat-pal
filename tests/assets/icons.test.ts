import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { decodePng, describePixel, pixelAt } from '../support/png'
import type { DecodedPng, Pixel } from '../support/png'

/**
 * The home-screen icons, read as pixels and compared against the palette.
 *
 * ## Why this file exists
 *
 * `public/icons/*.png` were a white house outline on `rgb(26, 26, 23)` — a warm
 * near-black from the app's *first* palette, which appears nowhere in
 * `src/ui/tokens.css` today. They stayed that way through two complete design
 * passes, and nothing noticed, because nothing could: no stylesheet touches a
 * PNG, and until this file no test tier had ever opened one. It is the same
 * silent drift that left the manifest's `theme_color` two palettes stale, and it
 * is invisible in the worst possible way — the icon looks deliberate, it is the
 * first thing anyone sees on their home screen, and it is the last thing anyone
 * opens.
 *
 * ## Why both sides of every comparison come from `tokens.css`
 *
 * The requirement is not "the icons are teal". It is "the icons are the colours
 * the app is", so a hard-coded `#0f5f68` here would pass on the day the palette
 * moves and the icons do not — recreating the defect with a green test on top of
 * it. The tokens are therefore parsed out of `src/ui/tokens.css` at test time,
 * and the parse throws rather than defaulting: a token this cannot find is a
 * check that did not run, and a check that did not run must never read as a
 * check that passed. Same posture as `e2e/support/colour.ts`,
 * `tests/support/png.ts`, and `readToken` in `scripts/mark-svg.mjs`, which reads
 * the same two names when it generates these files.
 *
 * ## What this tier cannot say
 *
 * Nothing about whether the mark is *legible* at 48px on a home screen, whether
 * it reads as a flat rather than as a smudge, or how it looks beside the other
 * icons on the springboard. Those are judgements about a rendered image on a
 * real device and they belong on the manual checklist in plan.md. What is here
 * is what pixels can settle: the palette, and the maskable safe zone.
 */

/** The repo root, derived from this file rather than from the working directory. */
const PROJECT_ROOT = decodeURIComponent(new URL('../../', import.meta.url).pathname)
const TOKENS = `${PROJECT_ROOT}src/ui/tokens.css`
const ICON_DIR = `${PROJECT_ROOT}public/icons/`

interface Rgb {
  r: number
  g: number
  b: number
}

/**
 * One custom property out of `tokens.css`, as an RGB triple.
 *
 * Throws on anything it cannot read. The regex anchors on the colon, which is
 * what keeps `--surface` from matching `--surface-sunken`.
 */
function readColourToken(name: string): Rgb {
  const css = readFileSync(TOKENS, 'utf8')
  const match = new RegExp(`^\\s*${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`, 'm').exec(css)
  const hex = match?.[1]

  if (hex === undefined) {
    throw new Error(
      `Could not find ${name} in ${TOKENS}. Refusing to fall back to a default — ` +
        'an icon audited against a guessed colour is not audited.',
    )
  }

  const digits =
    hex.length === 4
      ? [...hex.slice(1)].map((d) => d + d).join('')
      : hex.length === 7
        ? hex.slice(1)
        : null

  if (digits === null) {
    throw new Error(
      `${name} is "${hex}", which carries an alpha channel or an unsupported length. ` +
        'An icon ground has to be opaque — a translucent one shows whatever the ' +
        'launcher puts behind it — so this refuses rather than dropping the alpha.',
    )
  }

  return {
    r: Number.parseInt(digits.slice(0, 2), 16),
    g: Number.parseInt(digits.slice(2, 4), 16),
    b: Number.parseInt(digits.slice(4, 6), 16),
  }
}

/** The tile the mark sits on. */
const GROUND = readColourToken('--accent')
/** The mark itself. */
const FIGURE = readColourToken('--surface')

function describeRgb({ r, g, b }: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`
}

/**
 * Whether a pixel is a colour, within a per-channel tolerance.
 *
 * Alpha is part of the comparison rather than ignored: a fully transparent
 * pixel has whatever RGB the encoder felt like writing, and an icon that is
 * secretly a hole would otherwise sail through every assertion below.
 */
function matches(pixel: Pixel, colour: Rgb, tolerance: number): boolean {
  return (
    pixel.a === 255 &&
    Math.abs(pixel.r - colour.r) <= tolerance &&
    Math.abs(pixel.g - colour.g) <= tolerance &&
    Math.abs(pixel.b - colour.b) <= tolerance
  )
}

/**
 * Exact, and it means exact.
 *
 * Used for the ground and for the maskable safe-zone ring. Both are flat,
 * full-bleed fill with no edge anywhere near them, so there is no antialiasing
 * to forgive and nothing to round: a rasteriser writing the ground colour writes
 * it byte for byte. Allowing slack there would only ever let a near-miss colour
 * through.
 */
const EXACT = 0

/**
 * One unit per channel, for counting the *figure*.
 *
 * Not for antialiasing — an antialiased edge pixel is a blend of ground and
 * figure and sits tens of units from either, so it is excluded from the count at
 * any sane tolerance, which is correct: the question is how much solid figure
 * was painted, not how soft its edges are. This is for a rasteriser rounding a
 * flat fill by a unit, which some do when they composite through a premultiplied
 * buffer.
 *
 * It cannot rescue a wrong palette. The icons this file was written against
 * paint their figure in `#f4f4f2`, which is 11 to 13 units from `--surface`.
 */
const FLAT_FILL_ROUNDING = 1

interface Icon {
  file: string
  size: number
  /**
   * Android crops a maskable icon to a shape of the launcher's choosing, and
   * only the inner 80% of the canvas is guaranteed to survive it.
   */
  maskable?: true
}

const ICONS: readonly Icon[] = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-512-maskable.png', size: 512, maskable: true },
]

function load(icon: Icon): DecodedPng {
  return decodePng(readFileSync(`${ICON_DIR}${icon.file}`), icon.file)
}

/**
 * The floor for how much of an icon the mark must actually cover.
 *
 * **A floor rather than an exact count, deliberately.** The exact number of
 * figure pixels is a function of the geometry, the stroke width and how the
 * rasteriser antialiases — all three of which the design is free to change, and
 * none of which anyone should have to update a test for. Pinning the count would
 * make this a test of the current drawing rather than of the app's palette, and
 * pinning implementation is what Principle III calls a defect.
 *
 * What the floor answers is a different and much cruder question: **is the mark
 * there at all?** A blank tile, a mark scaled to a dot, or a figure accidentally
 * drawn in the ground colour all produce a perfectly uniform icon that satisfies
 * "the ground is `--accent`" on its own. 1% is far below anything a legible mark
 * produces — the three icons this was written against sit at 13.6%, 13.4% and
 * 6.8% — and far above anything an accident produces.
 */
const MIN_FIGURE_SHARE = 0.01

for (const icon of ICONS) {
  describe(icon.file, () => {
    it(`is a ${icon.size}x${icon.size} PNG that decodes`, () => {
      const png = load(icon)

      // The manifest tells the platform these sizes (vite.config.ts). A file
      // that is not the size it is advertised as is either scaled by the OS or
      // ignored by it, and neither shows up anywhere else.
      expect(
        { width: png.width, height: png.height },
        `${icon.file} is not the size the manifest declares`,
      ).toEqual({ width: icon.size, height: icon.size })
    })

    it('is drawn on --accent', () => {
      const png = load(icon)

      // The four corners: full-bleed ground, as far from the mark as the canvas
      // allows, so no antialiased edge can reach them.
      const corners = [
        { x: 0, y: 0 },
        { x: png.width - 1, y: 0 },
        { x: 0, y: png.height - 1 },
        { x: png.width - 1, y: png.height - 1 },
      ].map(({ x, y }) => ({ at: `(${x}, ${y})`, pixel: pixelAt(png, x, y) }))

      const wrong = corners
        .filter(({ pixel }) => !matches(pixel, GROUND, EXACT))
        .map(({ at, pixel }) => `${at} is ${describePixel(pixel)}`)

      expect(
        wrong,
        `${icon.file} is not drawn on --accent (${describeRgb(GROUND)}, read from ` +
          'src/ui/tokens.css). The icons drifted two palettes behind the app once ' +
          'already; regenerate them from src/ui/mark.ts rather than editing the PNG.',
      ).toEqual([])

      // And the ground is the *ground* — the thing most of the icon is — rather
      // than a border round a tile of some other colour. Without this, an icon
      // that was accent only at its very edges would pass the check above.
      const groundPixels = png.pixels.filter((pixel) => matches(pixel, GROUND, EXACT)).length
      expect(
        groundPixels / png.pixels.length,
        `${icon.file}: only ${groundPixels} of ${png.pixels.length} pixels are ` +
          `--accent, so --accent is not what this icon is mostly made of`,
      ).toBeGreaterThan(0.5)
    })

    it('has a mark on it, painted in --surface', () => {
      const png = load(icon)

      const figurePixels = png.pixels.filter((pixel) =>
        matches(pixel, FIGURE, FLAT_FILL_ROUNDING),
      ).length
      const share = figurePixels / png.pixels.length

      expect(
        share,
        `${icon.file}: ${figurePixels} of ${png.pixels.length} pixels ` +
          `(${(share * 100).toFixed(2)}%) are --surface (${describeRgb(FIGURE)}, read from ` +
          `src/ui/tokens.css), which is below the ${MIN_FIGURE_SHARE * 100}% floor. ` +
          'Either the mark is not being drawn, or it is not being drawn in the ' +
          'colour the app uses.',
      ).toBeGreaterThanOrEqual(MIN_FIGURE_SHARE)
    })

    if (icon.maskable) {
      it('keeps everything that matters inside the maskable safe zone', () => {
        const png = load(icon)

        /**
         * Android crops a maskable icon to an arbitrary shape — a circle, a
         * squircle, a teardrop, whatever the launcher's theme says — and
         * guarantees only the inner 80% of the canvas. So the real constraint
         * is not "the mark is small enough" but "nothing outside that circle
         * carries meaning", and the way to check it is to look: every pixel
         * further from the centre than 0.4 x the canvas must be bare ground.
         *
         * Exact, not tolerant. A pixel out here is either untouched ground or
         * it is part of a shape that is about to be cut in half, and an
         * antialiased edge sitting exactly on the boundary is already the
         * failure this is looking for.
         */
        const safeRadius = 0.4 * icon.size
        const centre = icon.size / 2

        const outside: string[] = []
        let inspected = 0

        for (let y = 0; y < png.height; y += 1) {
          for (let x = 0; x < png.width; x += 1) {
            // Pixel centres, so the geometry means the same thing it means to
            // the rasteriser that drew the file.
            const dx = x + 0.5 - centre
            const dy = y + 0.5 - centre
            if (Math.hypot(dx, dy) <= safeRadius) continue

            inspected += 1
            const pixel = pixelAt(png, x, y)
            if (matches(pixel, GROUND, EXACT)) continue
            if (outside.length < 8) outside.push(`(${x}, ${y}) is ${describePixel(pixel)}`)
          }
        }

        expect(
          outside,
          `${icon.file}: of the ${inspected} pixels further than ${safeRadius}px from the ` +
            `centre, some are not bare --accent (${describeRgb(GROUND)}). Android is free ` +
            'to crop those away, so whatever is out there is part of the mark that some ' +
            'launchers will simply cut off. First few shown.',
        ).toEqual([])
      })
    }
  })
}
