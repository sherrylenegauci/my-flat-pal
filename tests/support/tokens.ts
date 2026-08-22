import { readFileSync } from 'node:fs'

/**
 * Read a colour out of `src/ui/tokens.css`, at test time.
 *
 * ## Why a test reads the stylesheet instead of knowing the colour
 *
 * Principle V puts the palette in one file. The interesting assertion is
 * therefore never "the icon is teal" — it is "the icon is the colour the app
 * is". A hard-coded `#0f5f68` in a test passes on the day the palette moves and
 * the asset does not, which is the original defect with a green test sitting on
 * top of it. Both sides of the comparison have to come from the same source.
 *
 * That defect was real: `public/icons/*.png` spent two complete design passes
 * drawn in the app's first palette, on a near-black that by then existed
 * nowhere in `tokens.css`.
 *
 * ## Shared, because two tiers ask the same question
 *
 * `tests/assets/icons.test.ts` compares the rasterised icons against these
 * values; `e2e/mark.spec.ts` compares the header mark's painted pixels against
 * them. `scripts/mark-svg.mjs` reads the same two names when it generates the
 * icons — it cannot import this file, being plain ESM to this module's
 * TypeScript, and its `readToken` is the one duplicate. That is on purpose: the
 * generator and the test that checks the generator agreeing by construction
 * would make the check circular.
 *
 * ## It throws rather than defaulting
 *
 * Same posture as `e2e/support/colour.ts` and `tests/support/png.ts`. A token
 * this cannot find is a check that did not run, and a check that did not run
 * must never read as a check that passed.
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

/** Derived from this file, so it does not depend on the working directory. */
const PROJECT_ROOT = decodeURIComponent(new URL('../../', import.meta.url).pathname)
const TOKENS = `${PROJECT_ROOT}src/ui/tokens.css`

/**
 * The raw declared value of a custom property in `tokens.css`, with no attempt
 * to interpret it.
 *
 * Split out from `readColourToken` because not every token this file is now
 * asked about is a plain hex: `--scrim` and the shadows carry an alpha, which
 * is the whole reason they restate a colour instead of reading `var(--text)`.
 * One reader, several interpreters — a second file-and-regex would be a second
 * thing to keep in step with the stylesheet.
 */
export function readTokenValue(name: string): string {
  const css = readFileSync(TOKENS, 'utf8')
  // Anchored on the colon, which is what stops `--surface` matching
  // `--surface-sunken`.
  const match = new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm').exec(css)
  const value = match?.[1]?.trim()

  if (value === undefined) {
    throw new Error(
      `Could not find ${name} in ${TOKENS}. Refusing to fall back to a default — ` +
        'an asset audited against a guessed colour is not audited.',
    )
  }

  return value
}

/**
 * `#rgb` or `#rrggbb` to channels.
 *
 * `source` says where the hex came from, so a failure names the file or token
 * that carried it rather than just the digits.
 */
export function parseHex(hex: string, source: string): Rgb {
  const digits =
    hex.length === 4
      ? [...hex.slice(1)].map((d) => d + d).join('')
      : hex.length === 7
        ? hex.slice(1)
        : null

  if (digits === null) {
    throw new Error(
      `${source} is "${hex}", which carries an alpha channel or an unsupported length. ` +
        'The surfaces this is used to audit have to be opaque — a translucent icon ' +
        'ground shows whatever the launcher puts behind it — so this refuses rather ' +
        'than dropping the alpha.',
    )
  }

  return {
    r: Number.parseInt(digits.slice(0, 2), 16),
    g: Number.parseInt(digits.slice(2, 4), 16),
    b: Number.parseInt(digits.slice(4, 6), 16),
  }
}

export function readColourToken(name: string): Rgb {
  const value = readTokenValue(name)
  const hex = /^#[0-9a-fA-F]{3,8}$/.exec(value)?.[0]

  if (hex === undefined) {
    throw new Error(
      `${name} is "${value}", which is not a plain hex colour. Refusing to guess at ` +
        'what colour that resolves to — a check that guessed would not be a check.',
    )
  }

  return parseHex(hex, name)
}

/** A colour with an alpha channel, as `rgb()`/`rgba()` writes one. */
export interface Rgba extends Rgb {
  /** 0 to 1, defaulting to 1 when the notation omits it. */
  a: number
}

/**
 * The first `rgb()`/`rgba()` in a value.
 *
 * "First", rather than "the whole value", because the values this is asked
 * about are not all bare colours: `--shadow-dialog` is an offset, a blur and
 * then a colour. What matters is the colour, wherever in the value it sits.
 *
 * Throws when there is none, for the reason everything else here throws: a
 * token this cannot read is a check that did not run.
 */
export function parseRgba(value: string, source: string): Rgba {
  const match = /\brgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/.exec(
    value,
  )

  if (!match) {
    throw new Error(
      `${source} is "${value}", which contains no rgb()/rgba() colour. Refusing to ` +
        'fall back to a default — a check that did not run must not read as a pass.',
    )
  }

  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: match[4] === undefined ? 1 : Number(match[4]),
  }
}

export function describeToken({ r, g, b }: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`
}

/**
 * How far a pixel may sit from a token and still count as that flat fill.
 *
 * **Not an antialiasing allowance.** An antialiased edge pixel is a blend of two
 * colours and sits tens of units from either, so it falls outside this at any
 * sane value — which is correct, because what is being counted is how much solid
 * colour was painted, not how soft its edges are. This is for a rasteriser
 * rounding a flat fill by a unit or two while compositing through a
 * premultiplied buffer, which is a real and small effect.
 *
 * It cannot rescue a wrong palette: the icons this was written against painted
 * their figure in `#f4f4f2`, eleven to thirteen units from `--surface`.
 */
export const FLAT_FILL_TOLERANCE = 2
