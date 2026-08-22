import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import {
  describeToken,
  parseHex,
  parseRgba,
  readColourToken,
  readTokenValue,
} from '../support/tokens'
import type { Rgb } from '../support/tokens'

/**
 * T110 / T119 — colour is supposed to live in exactly one file, and three
 * places it also lives cannot be reached by a stylesheet.
 *
 * ## Why this is a test rather than a comment
 *
 * Constitution Principle V says the palette lives in `src/ui/tokens.css` and
 * that a feature MUST NOT define a colour locally. That is currently untrue in
 * two files, and it has already cost something twice over. `focus.css` defines
 * its own `--focus-ring`, and the ratio it recorded for that ring was wrong in
 * the unsafe direction — 3.6:1 written down, 2.69:1 measured, below the AA floor
 * and shipped. Separately the manifest's `theme_color` and the `theme-color`
 * meta held the *first* palette through two complete design passes, so an
 * installed app opened with a status bar belonging to neither palette. Nothing
 * noticed either, because a comment saying "keep this in step by hand" is not a
 * mechanism.
 *
 * Every note in the repository asking someone to keep two colours in step by
 * hand is a check that has not been written yet. This file is those checks.
 *
 * ## Both sides of every comparison come from `tokens.css`
 *
 * Same posture as `tests/assets/icons.test.ts`, deliberately, and for the same
 * reason: the requirement is never "the chevron is `#0e141b`", it is "the
 * chevron is the colour the app's text is". **There is no hard-coded hex
 * anywhere in this file.** One would pass on the day the palette moves and the
 * chevron does not, which is the original defect with a green test on top of it.
 * The token reads throw rather than defaulting — a token this cannot find is a
 * check that did not run, and a check that did not run must never read as a
 * check that passed.
 *
 * ## What this file cannot say
 *
 * It reads text off disk. It knows nothing about what any of these colours
 * looks like, what contrast it achieves, or whether the browser resolves the
 * cascade the way the source suggests. Contrast is `e2e/contrast.spec.ts`, in a
 * real engine; the installed status bar and splash screen are on the manual
 * checklist in plan.md, because no headless environment shows you an iOS status
 * bar. This file only guarantees that the values agree with each other.
 */

/** The repo root, derived from this file rather than from the working directory. */
const PROJECT_ROOT = decodeURIComponent(new URL('../../', import.meta.url).pathname)
const UI_DIR = `${PROJECT_ROOT}src/ui/`

function read(path: string): string {
  return readFileSync(`${PROJECT_ROOT}${path}`, 'utf8')
}

/**
 * Blanks out `/* … *\/` comments while keeping every character position, so a
 * reported line number is the line number in the file.
 *
 * Necessary rather than tidy: the stylesheets here carry long comments quoting
 * hexes and the contrast ratios computed against them — `focus.css` alone lists
 * seven pairs. Those are documentation, and documentation of a colour is the
 * opposite of the problem. Scanning them would make the guard so noisy it would
 * be turned off.
 *
 * **It is a text scan, not a CSS parser, and that has a limit worth knowing.**
 * A `/*` inside a string or a `url()` would open a comment that is not there and
 * blank everything up to the next `*\/`, which would turn this guard silently
 * vacuous. That is not hypothetical — the same naive strip applied to
 * `vite.config.ts` blanked forty lines, because `'icons/*.png'` opens one and
 * `'**\/*.test.ts'` closes it, which is why the manifest check below does not
 * use it. No stylesheet here contains such a sequence today; the guard against
 * one arriving is the `{` check in each test, and, for `app.css` specifically,
 * the chevron check further down, which throws if the data URI has vanished.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
}

/**
 * Anything that states a colour outright: `#rgb`, `#rrggbb`, `#rrggbbaa`, the
 * functional notations, and `%23` — a `#` URL-encoded into a data URI, which is
 * how the one literal that is allowed to stay hides from a naive search.
 */
const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)|%23[0-9a-fA-F]*/g

/**
 * The single standing exception, and the reason it stands.
 *
 * A `background-image: url("data:…")` cannot read a custom property: the URL is
 * parsed as an opaque string, so `var(--text)` inside it is text rather than a
 * reference. There is no way to write this rule without restating the colour.
 * It is matched on the data URI rather than on a line number so that moving the
 * rule does not silently retire the exception, and the drift this guard cannot
 * catch for it is caught below instead.
 */
interface Exception {
  file: string
  marker: RegExp
  why: string
}

const ALLOWED: readonly Exception[] = [
  {
    file: 'app.css',
    marker: /url\(\s*["']?data:image\/svg\+xml/,
    why: 'a data URI cannot read a custom property; kept in step with --text by the check below',
  },
]

const STYLESHEETS = readdirSync(UI_DIR)
  .filter((file) => file.endsWith('.css'))
  .sort()

describe('colour is defined in tokens.css and nowhere else', () => {
  it('finds the stylesheets to check', () => {
    // A glob that quietly matched nothing would make every assertion below
    // vacuous, and the whole file would read as a pass. `tokens.css` is the one
    // name that must be there.
    expect(STYLESHEETS).toContain('tokens.css')
    expect(STYLESHEETS.length).toBeGreaterThan(1)
  })

  for (const file of STYLESHEETS.filter((name) => name !== 'tokens.css')) {
    it(`${file} states no colour of its own`, () => {
      const exceptions = ALLOWED.filter((allowed) => allowed.file === file)
      const declarations = withoutComments(readFileSync(`${UI_DIR}${file}`, 'utf8'))

      // A runaway comment strip would blank the file and leave nothing to find,
      // and a guard with nothing to scan reads exactly like a guard that
      // passed. See the note on `withoutComments`.
      expect(
        declarations,
        `${file} has no rules left after comments were stripped, so this guard scanned ` +
          'nothing. Something opened a comment that is not one.',
      ).toContain('{')

      const lines = declarations.split('\n')
      const found: string[] = []

      lines.forEach((line, index) => {
        if (exceptions.some((allowed) => allowed.marker.test(line))) return
        for (const literal of line.match(COLOUR_LITERAL) ?? []) {
          found.push(`${file}:${index + 1} — ${literal.trim()}`)
        }
      })

      expect(
        found,
        `${file} states a colour outright. Colour belongs in src/ui/tokens.css: ` +
          'Principle V puts the whole palette in one file, so that changing it is one ' +
          'edit rather than a search, and so that every value has its contrast recorded ' +
          'beside it. Move each of these to a token and reference it with var(). ' +
          'The literals, with line numbers, are listed above.',
      ).toEqual([])
    })
  }
})

/**
 * The exception above, given the check the exception makes impossible.
 *
 * Green when written. It is here because "keep these two in step by hand" is
 * exactly the note that was already on this rule, and on the manifest, and on
 * the scrim — and it did not work on the manifest.
 */
describe('the select chevron, which cannot read a token', () => {
  it('is the only data URI in app.css, so the exception covers only it', () => {
    // The exception is matched on "a line with a data URI on it", which would
    // wave through a *second* data URI added later — a colour smuggled into
    // app.css with the allowlist holding the door. There is one; this is what
    // says so. If a second is genuinely needed, it needs its own entry in
    // ALLOWED and its own drift check, exactly like this one.
    const uris = withoutComments(read('src/ui/app.css')).match(/data:image\/svg\+xml/g) ?? []

    expect(
      uris.length,
      'src/ui/app.css has more than one data URI. The Principle V guard exempts any ' +
        'line carrying one, so a second would be unchecked colour hiding behind the ' +
        "chevron's exception.",
    ).toBe(1)
  })

  it('is drawn in --text', () => {
    const css = withoutComments(read('src/ui/app.css'))
    // To the end of the line rather than to a closing quote: the SVG inside is
    // full of single quotes and slashes of its own, and this only has to be
    // good enough to find the stroke and to quote back what it found.
    const uri = /url\(\s*["']?(data:image\/svg\+xml.*)/.exec(css)?.[1]

    if (uri === undefined) {
      throw new Error(
        'No data-URI background-image found in src/ui/app.css. Either the select ' +
          'chevron moved, or it is gone — and either way the allowlisted exception ' +
          'in the guard above is now unearned. Refusing to pass a check that found ' +
          'nothing to check.',
      )
    }

    const encoded = /stroke='%23([0-9a-fA-F]{3,6})'/.exec(uri)?.[1]

    if (encoded === undefined) {
      throw new Error(
        `The chevron data URI in src/ui/app.css has no stroke='%23…' colour: ${uri}`,
      )
    }

    expect(
      parseHex(`#${encoded}`, 'the select chevron in src/ui/app.css'),
      "the select chevron's stroke is no longer --text. It is a data URI, so it " +
        'cannot read the token and has to be edited by hand every time --text moves. ' +
        'Re-encode the new value as %23rrggbb.',
    ).toEqual(readColourToken('--text'))
  })
})

/**
 * T119 — the two colours no stylesheet reaches.
 *
 * These are read from source rather than from `dist/`. A build would prove the
 * same thing and cost 30-60 seconds, and it would prove it about the wrong
 * artifact: the recorded failure is a person moving the tokens and forgetting
 * these two files, which is visible in the source the moment it happens.
 *
 * Green when written, and that is the point — they were wrong for two design
 * passes and were fixed by hand, with nothing to stop the third.
 */
describe('the colours the installed app shows before it has painted anything', () => {
  /**
   * Whole-line `//` comments only, and deliberately **not** `withoutComments`.
   *
   * `vite.config.ts` contains `'icons/*.png'` and `'tests/domain/**\/*.test.ts'`,
   * which between them open and close a block comment that does not exist. The
   * naive strip blanks the forty lines in between — including the whole
   * manifest — and every assertion here would then fail with "not found" rather
   * than with the truth. Line comments are what this file actually uses, and
   * they are what the manifest colours are documented in.
   */
  function withoutLineComments(source: string): string {
    return source.replace(/^[ \t]*\/\/.*$/gm, '')
  }

  function manifestColour(key: string): Rgb {
    const config = withoutLineComments(read('vite.config.ts'))
    const hex = new RegExp(`\\b${key}:\\s*['"](#[0-9a-fA-F]{3,8})['"]`).exec(config)?.[1]

    if (hex === undefined) {
      throw new Error(
        `No ${key} found in the PWA manifest in vite.config.ts. The manifest is the ` +
          'one place colour lives that no stylesheet reaches, so a check that cannot ' +
          'find it is not a check that passed.',
      )
    }

    return parseHex(hex, `${key} in vite.config.ts`)
  }

  it('theme_color in the manifest is --surface', () => {
    // The colour Android tints the status bar with over the app header.
    expect(
      manifestColour('theme_color'),
      'the manifest theme_color is not --surface. It sits directly above the app ' +
        'header when the app runs installed, and nothing in the stylesheet reaches ' +
        `it. --surface is ${describeToken(readColourToken('--surface'))}.`,
    ).toEqual(readColourToken('--surface'))
  })

  it('background_color in the manifest is --surface-sunken', () => {
    // The launch splash, shown before a single byte of the app has run.
    expect(
      manifestColour('background_color'),
      'the manifest background_color is not --surface-sunken. It is the launch ' +
        'splash, so it is the first thing anyone sees after tapping the icon, and it ' +
        'is painted before any CSS has loaded.',
    ).toEqual(readColourToken('--surface-sunken'))
  })

  it('the theme-color meta in index.html is --surface', () => {
    // iOS reads the meta rather than the manifest, so both have to move.
    const html = read('index.html').replace(/<!--[\s\S]*?-->/g, '')
    const tag = /<meta\b[^>]*name=["']theme-color["'][^>]*>/i.exec(html)?.[0]

    if (tag === undefined) {
      throw new Error(
        'No <meta name="theme-color"> in index.html. iOS reads this rather than the ' +
          'manifest, so its absence is a defect in itself — not a check that passed.',
      )
    }

    const hex = /content=["'](#[0-9a-fA-F]{3,8})["']/.exec(tag)?.[1]
    if (hex === undefined) {
      throw new Error(`The theme-color meta in index.html has no hex content: ${tag}`)
    }

    expect(
      parseHex(hex, 'the theme-color meta in index.html'),
      'the theme-color meta in index.html is not --surface. This one had been the ' +
        'first palette since the app was built and survived a whole design pass ' +
        'unnoticed, because the only thing holding it in place was a comment.',
    ).toEqual(readColourToken('--surface'))
  })
})

/**
 * T110's two genuine exceptions, made into tokens.
 *
 * A scrim and a shadow are `--text`'s hue at an opacity, and a hex token cannot
 * be given an alpha without restating its channels — `rgba(var(--text), 0.6)`
 * is not valid CSS against a hex custom property. So the restatement is
 * irreducible. What is not irreducible is where it lives: in `tokens.css` with
 * every other colour, where someone changing `--text` will see it, rather than
 * six hundred lines into `app.css` under a comment asking them to remember.
 *
 * The channels still have to agree, and nothing but this says so.
 */
describe('the translucent colours, which restate --text because they need an alpha', () => {
  const restatements = [
    { token: '--scrim', what: 'the dimmed page behind a dialog' },
    { token: '--shadow-dialog', what: "the dialog's drop shadow" },
    { token: '--shadow-card', what: "a card's drop shadow" },
  ] as const

  for (const { token, what } of restatements) {
    describe(`${token} — ${what}`, () => {
      it("carries --text's channels", () => {
        const value = readTokenValue(token)
        const { r, g, b } = parseRgba(value, `${token} in src/ui/tokens.css`)

        expect(
          { r, g, b },
          `${token} is "${value}", whose channels are not --text's ` +
            `(${describeToken(readColourToken('--text'))}). It has to restate --text ` +
            'because it needs an alpha and --text is a hex, but restating is not ' +
            'licence to drift: a warm scrim over a cool palette is exactly the kind ' +
            'of thing nobody spots and everybody feels.',
        ).toEqual(readColourToken('--text'))
      })

      it('is translucent, which is the only reason it may restate anything', () => {
        const value = readTokenValue(token)
        const { a } = parseRgba(value, `${token} in src/ui/tokens.css`)

        expect(
          a,
          `${token} is "${value}", which is fully opaque. An opaque colour needs no ` +
            'restatement — it should read var(--text) and then it cannot drift at all.',
        ).toBeLessThan(1)
      })
    })
  }

  it('app.css reads the tokens rather than carrying the values', () => {
    // The guard at the top of this file proves app.css states no colour. This
    // proves it states no colour *because it uses these*, rather than because
    // the scrim quietly moved somewhere else.
    const css = withoutComments(read('src/ui/app.css'))
    const missing = ['--scrim', '--shadow-dialog'].filter(
      (token) => !new RegExp(`var\\(\\s*${token}\\s*[,)]`).test(css),
    )

    expect(
      missing,
      'src/ui/app.css does not reference these tokens. The scrim and the dialog ' +
        'shadow were written out as rgba() literals in app.css; they belong in ' +
        'tokens.css, referenced from here with var().',
    ).toEqual([])
  })
})
