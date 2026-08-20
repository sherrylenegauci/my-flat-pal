import { readFileSync } from 'node:fs'
import type * as Mark from '../src/ui/mark'

/**
 * Build the mark as SVG, from the one geometry.
 *
 * Shared by three callers: `generate-icons.mjs`, which rasterises it into
 * `public/icons/*.png`; `screenshot-mark.mjs`, which lays the results out for
 * review; and `tests/assets/icon-geometry.test.ts`, which redraws the icons and
 * compares them with the committed files. None of them holds a copy of a
 * coordinate or a colour: the shapes come from `src/ui/mark.ts` and the two
 * colours are read out of `src/ui/tokens.css` by name, because Principle V puts
 * colour in that file and nowhere else.
 *
 * **TypeScript rather than plain ESM, so the test can import it.** Node 24
 * strips the types on import, so the two `.mjs` scripts load this file directly
 * with no build step; TypeScript reads the same file, so the test that checks
 * the generator uses the generator's own code rather than a reimplementation of
 * it. A reimplementation is exactly how a test comes to agree with a bug.
 */

/** The subset of `src/ui/mark.ts` these functions need. */
type MarkModule = Pick<
  typeof Mark,
  'MARK_BOX' | 'MARK_SHAPES' | 'MARK_STROKE' | 'MARK_LINECAP' | 'MARK_LINEJOIN'
>

/**
 * Read one custom property out of `tokens.css`.
 *
 * Throws if it is missing. Same posture as `e2e/support/colour.ts`: a colour
 * this cannot resolve is not a colour to substitute a default for — it would
 * silently generate an icon in a colour the app does not use, which is exactly
 * the bug being fixed.
 */
export function readToken(tokensPath: string, name: string): string {
  const css = readFileSync(tokensPath, 'utf8')
  const match = new RegExp(`^\\s*${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`, 'm').exec(css)
  if (match === null || match[1] === undefined) {
    throw new Error(
      `Could not find ${name} in ${tokensPath}. Refusing to guess a colour — ` +
        'an icon generated from a default would look deliberate and be wrong.',
    )
  }
  return match[1]
}

/**
 * The mark's shapes, as SVG markup, scaled into a canvas of `size`.
 *
 * `fraction` is how much of that canvas the 100x100 mark box occupies. It is not
 * the same for every surface — see `MARK_SCALE` in `src/ui/mark.ts` for why the
 * maskable icon's is so much smaller.
 */
export function figureMarkup(
  mark: MarkModule,
  size: number,
  fraction: number,
  colour: string,
): string {
  const scale = (size * fraction) / mark.MARK_BOX
  const offset = (size - size * fraction) / 2

  const paths = mark.MARK_SHAPES.map((shape) =>
    shape.paint === 'fill'
      ? `<path d="${shape.d}" fill="${colour}" stroke="none"/>`
      : `<path d="${shape.d}" fill="none" stroke="${colour}" stroke-width="${mark.MARK_STROKE}"` +
        ` stroke-linecap="${mark.MARK_LINECAP}" stroke-linejoin="${mark.MARK_LINEJOIN}"/>`,
  ).join('')

  return `<g transform="translate(${offset} ${offset}) scale(${scale})">${paths}</g>`
}

export interface IconOptions {
  size: number
  fraction: number
  ground: string
  figure: string
}

/**
 * A complete icon document: full-bleed ground, mark centred on it.
 *
 * The ground has no corner radius, deliberately. iOS and Android round a
 * home-screen icon themselves, and a second radius inside theirs reads as a
 * drawing mistake rather than as a style.
 */
export function iconSvg(mark: MarkModule, { size, fraction, ground, figure }: IconOptions): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 ${size} ${size}">` +
    `<rect width="${size}" height="${size}" fill="${ground}"/>` +
    figureMarkup(mark, size, fraction, figure) +
    '</svg>'
  )
}
