import { test, expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { openScheduleList } from '../support/app'
import { BODY_FACE, BUNDLED_FACES } from '../../tests/support/typeface'
import type { BundledFace } from '../../tests/support/typeface'

/**
 * The bundled typefaces, in a real engine.
 *
 * ## Why none of this lives in jsdom
 *
 * jsdom fetches no font, resolves no `@font-face` and lays nothing out, so the
 * only thing it could assert is the `font-family` *string* the cascade produced
 * — which is a CSS token, is true whether or not a glyph was ever painted, and
 * is exactly the always-passing check the constitution forbids. The reasoning is
 * written out once in `tests/support/typeface.ts`; the short version is that a
 * silent fallback is invisible to every tier below this one.
 *
 * ## Why the measuring is done on real rendered text
 *
 * This candidate bundles one face, Source Sans 3, and paints everything in it —
 * headings included, because `--font-heading` points at `--font`.
 *
 * An earlier version of this file measured a probe span appended to
 * `document.body`. That was weaker than it read: a probe on `body` shows the
 * face loaded and that `body` inherits it, which is not the same as anything a
 * user looks at being painted in it. The sibling candidate that bundles a serif
 * for headings is where that gap bites hardest — a Newsreader that 404s leaves
 * every heading in Georgia, looking perfectly reasonable, with the probe green —
 * and the shape adopted there is kept here because it is the better claim on any
 * candidate.
 *
 * So the measuring is done on **text the app actually rendered**, listed in
 * `PAINTED_TEXT` below. That is a stronger claim than the probe
 * made even for the body face: a probe on `body` shows that the face loaded and
 * that `body` inherits it, where measuring a real heading shows that the face is
 * what that heading is *painted in*. Those come apart the moment two faces are
 * in play and one selector is pointed at the wrong one.
 *
 * ## Why this is not a sweep over APP_STATES
 *
 * Four of the specs in this directory iterate `APP_STATES`, and they should: a
 * touch target, a focus ring and a contrast ratio are all properties of a
 * particular view, so a new view genuinely needs re-checking. A typeface is not.
 * Both faces are declared once, in one stylesheet, and applied by selectors that
 * span every view; the app loads one stylesheet bundle regardless of which view
 * is on screen. Sweeping eight states across two engines would restate one
 * document-level fact sixty-four times, slow the suite, and give a maintainer
 * eight identical failures to read when one file has a typo in it.
 *
 * The judgement that makes that safe is "no view loads a stylesheet or a font of
 * its own", which is true today and is not the sort of thing that changes
 * quietly — there is one `fonts.css`, imported from `App.tsx`. If a feature ever
 * lazy-loads its own CSS, this decision is worth revisiting, and this paragraph
 * is where to revisit it.
 *
 * ## What this tier cannot say
 *
 * Nothing about offline. Playwright runs against `vite dev` (playwright.config.ts
 * explains why at length), and vite-plugin-pwa registers no service worker
 * there, so there is no precache to inspect and no cache to serve from. The
 * offline claim lives in `tests/build/typeface-precache.test.ts`, which reads
 * the built worker instead.
 *
 * Nothing about *which* selectors carry `--font-heading` either. `PAINTED_TEXT`
 * names one rendered sample per face, so it proves the face reaches the screen,
 * not that all seven heading selectors in `app.css` point at it. One of them
 * dropping the declaration would show up here only if the sample happened to be
 * the one that dropped it. That gap is recorded rather than closed, because
 * closing it means enumerating selectors, and a test that enumerates selectors
 * is a test of the stylesheet's text rather than of what a user sees.
 */

/**
 * A real, rendered string, and the face it must be painted in.
 *
 * Both entries come from the same row of the seeded schedule list, which is
 * where the two faces meet: the job's name is a heading, the button under it is
 * not. They are found by role and by the text a user reads, not by class.
 *
 * `sample` is the exact text node to measure, and it is separate from the
 * locator on purpose. A job's name is an `<h3>` containing a `<button>` with
 * `font: inherit`, so the accessible heading and the element that actually
 * paints the glyphs are two different elements; the button's own accessible name
 * ("Mark done — Change the water filter") likewise spans two text nodes, one of
 * them visually hidden. Naming the string means the measurement lands on
 * whatever element genuinely paints it, whichever of those it turns out to be,
 * and fails loudly rather than silently measuring the wrong run if the markup
 * moves.
 */
const PAINTED_TEXT: ReadonlyArray<{
  face: BundledFace
  what: string
  sample: string
  find: (page: Page) => Locator
}> = [
  {
    // A heading. `--font-heading` points at `--font` on this candidate, so this
    // is the same face as the row below.
    //
    // It is **not** a check on the `--font-heading` route, and an earlier
    // version of this comment claimed it was. Setting that token to something
    // invalid makes `font-family: var(--font-heading)` invalid at
    // computed-value time, and an invalid inherited property falls back to
    // `inherit` — which on this candidate is `--font`, the same face. Measured:
    // the heading renders at 198.16px either way. So the token could be
    // misspelled and every heading would still be right, for the wrong reason,
    // and this test would still pass. It becomes a real check the moment
    // `--font-heading` names a different family, which is what the sibling
    // Newsreader candidate does.
    //
    // What this entry does check is worth having on its own: that a heading is
    // painted in the bundled face, so a rule hard-coding some other family onto
    // `.row__name` would fail here.
    face: BODY_FACE,
    what: 'a job’s name on the schedule list',
    sample: 'Change the water filter',
    find: (page) =>
      page.getByRole('heading', { name: 'Change the water filter', level: 3 }),
  },
  {
    face: BODY_FACE,
    what: 'the label on a row’s action button',
    sample: 'Mark done',
    find: (page) =>
      page.getByRole('button', { name: 'Mark done — Change the water filter' }),
  },
]

interface Measurement {
  /** Whether `sample` was found as a text node under the located element. */
  sampleWasFound: boolean
  /** Every text node the located element did contain, for when it was not. */
  textFound: string[]
  /**
   * The face's own load status, read off `document.fonts` **before** this test
   * asked for it. `null` means no `@font-face` on the page declares that family
   * at all.
   *
   * `'loaded'` here is the whole of "the app asked for it": a browser never
   * fetches an `@font-face` nobody uses, so a declared-but-`'unloaded'` face
   * means nothing the app renders named it.
   */
  statusBeforeThisTestAsked: string | null
  /** The same, after this test forced the load. `'error'` means the file did not arrive. */
  statusAfterForcingIt: string | null
  /** Every family the page's `@font-face` rules declare, for when the wanted one is absent. */
  familiesDeclared: string[]
  asTheAppPaintsIt: number
  forcedToTheBundledFace: number
  forcedToTheFallback: number
}

/**
 * Measure one run of real rendered text three ways: as the app paints it, forced
 * to the bundled face, and forced to the fallback the app would use if that face
 * were missing.
 *
 * A `Range` over the text node rather than the element's box, because the
 * element's box is a layout result — a flex child can be stretched, a block
 * fills its line — and would be the same width in either face. The range is the
 * painted glyph run itself, which is the thing the claim is about.
 */
async function measurePaintedText(
  where: Locator,
  sample: string,
  face: BundledFace,
): Promise<Measurement> {
  return where.evaluate(
    async (element, { sample: wanted, family, fallback }): Promise<Measurement> => {
      // Every font the page itself decided it needed has finished loading.
      await document.fonts.ready

      // `document.fonts` entry by entry, not `document.fonts.check()`.
      //
      // This started as `check('32px "<family>"')`, which reads as "is that
      // face loaded" and is not. It reports "no *matching* face is still
      // unloaded", so a family with **no** `@font-face` at all comes back
      // `true` — measured in both engines, with a family invented on the spot.
      // It was therefore vacuous in one of the exact cases this test exists to
      // catch: `fonts.css` misspelling the family, so nothing declares it and
      // nothing can ever paint with it. Reading the set's own entries is not
      // vacuous, because an absent family is an absent entry.
      //
      // Read before anything below asks for the face, because asking would load
      // it and make the answer trivially yes. A browser never fetches an
      // `@font-face` nobody uses, so a face sitting at `'unloaded'` here is a
      // face nothing the app renders named.
      const unquote = (name: string): string => name.replace(/^['"]|['"]$/g, '')
      const statusOf = (): { status: string | null; families: string[] } => {
        const families: string[] = []
        let status: string | null = null
        document.fonts.forEach((declared) => {
          const declaredFamily = unquote(declared.family)
          families.push(declaredFamily)
          if (declaredFamily !== family) return
          // 'loaded' wins if any entry for the family has it; a family split
          // across several faces only needs one usable.
          if (status !== 'loaded') status = declared.status
        })
        return { status, families }
      }

      const before = statusOf()
      const statusBeforeThisTestAsked = before.status

      // Now force it, so the reference measurement below is genuinely the real
      // face rather than whatever `font-display: swap` was showing while it
      // downloaded. Without this the comparison would race the network.
      //
      // Swallowed deliberately: if the file 404s this rejects, and an unhandled
      // rejection here would surface as "page.evaluate: NetworkError" — true, but
      // it tells a maintainer nothing. Letting it through means the assertions
      // below report the actual problem in words.
      try {
        await document.fonts.load(`32px "${family}"`)
      } catch {
        // Nothing to do. `statusAfterForcingIt` below records that the face is
        // unavailable, and that is what fails, in words.
      }

      const after = statusOf()
      const statusAfterForcingIt = after.status
      const familiesDeclared = [...new Set(after.families)]

      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      const textFound: string[] = []
      let target: Text | null = null
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const value = node.nodeValue ?? ''
        textFound.push(value)
        if (value.trim() === wanted) target = node as Text
      }

      const painter = target?.parentElement ?? null
      if (target === null || painter === null) {
        return {
          sampleWasFound: false,
          textFound,
          statusBeforeThisTestAsked,
          statusAfterForcingIt,
          familiesDeclared,
          asTheAppPaintsIt: 0,
          forcedToTheBundledFace: 0,
          forcedToTheFallback: 0,
        }
      }

      // Re-bound as consts so the closure below keeps the narrowing the guard
      // above established.
      const textNode: Text = target
      const paintedBy: HTMLElement = painter

      const widthOfTheGlyphs = (): number => {
        const range = document.createRange()
        range.selectNodeContents(textNode)
        return range.getBoundingClientRect().width
      }

      // Whatever was there before, restored at the end, so nothing this test did
      // is left on the page for the next assertion to read.
      const inlineFontFamilyBefore = paintedBy.style.fontFamily

      const asTheAppPaintsIt = widthOfTheGlyphs()
      paintedBy.style.fontFamily = `"${family}"`
      const forcedToTheBundledFace = widthOfTheGlyphs()
      paintedBy.style.fontFamily = fallback
      const forcedToTheFallback = widthOfTheGlyphs()
      paintedBy.style.fontFamily = inlineFontFamilyBefore

      return {
        sampleWasFound: true,
        textFound,
        statusBeforeThisTestAsked,
        statusAfterForcingIt,
        familiesDeclared,
        asTheAppPaintsIt,
        forcedToTheBundledFace,
        forcedToTheFallback,
      }
    },
    { sample, family: face.family, fallback: face.fallback },
  )
}

for (const subject of PAINTED_TEXT) {
  test(`${subject.what} is painted in ${subject.face.family}, not a fallback`, async ({
    page,
  }) => {
    await openScheduleList(page)

    const { face, sample } = subject
    const measured = await measurePaintedText(subject.find(page), sample, face)

    // Guard, not a claim. Everything below measures one text node; if the markup
    // moved and that node is not there, the widths are zeroes and the assertions
    // would compare nothing against nothing.
    expect(
      measured.sampleWasFound,
      `no text node reading "${sample}" was found in ${subject.what}, so there was nothing to measure — the text the app renders there is ${JSON.stringify(measured.textFound)}`,
    ).toBe(true)

    // Guard, and the reason the comparison below is not a mirage. Forcing
    // `font-family: "<the bundled family>"` on an element does not conjure it: if
    // no such face is usable the browser quietly paints the run in its default
    // font, and "as painted" could then match "forced to the bundled face" while
    // neither of them is the bundled face. Establishing that the face is real
    // and usable first is what stops that being a pass.
    expect(
      measured.statusAfterForcingIt,
      measured.statusAfterForcingIt === null
        ? `no @font-face on the page declares the family "${face.family}" — the page declares ${JSON.stringify(measured.familiesDeclared)}. Check the spelling in src/ui/fonts.css against tests/support/typeface.ts.`
        : `"${face.family}" is declared but the browser could not load it (status "${measured.statusAfterForcingIt}") — its src: almost certainly points at a file that is not there, so ${face.appliesTo} render in ${face.fallback} and look perfectly reasonable.`,
    ).toBe('loaded')

    // The face is usable, so if the browser had not already loaded it before
    // this test asked, nothing the app renders named it.
    expect(
      measured.statusBeforeThisTestAsked,
      `the browser had not loaded "${face.family}" until this test asked for it, which means nothing the app renders asks for it — check that ${face.token} names the family exactly as src/ui/fonts.css declares it`,
    ).toBe('loaded')

    // Control. Both of these are real, usable faces; if measuring text width
    // cannot tell them apart on this engine then the assertion after it proves
    // nothing, so the difference is asserted rather than assumed.
    expect(
      Math.abs(measured.forcedToTheBundledFace - measured.forcedToTheFallback),
      `measuring text width cannot distinguish "${face.family}" from the fallback behind it (${face.fallback}) here — both render "${sample}" at ${measured.forcedToTheBundledFace}px — so this test cannot tell whether the right one is in use`,
    ).toBeGreaterThan(1)

    // The claim: the text a user sees measures the same as that text explicitly
    // painted in the bundled face. If the app were silently falling back, these
    // would differ.
    expect(
      Math.abs(measured.asTheAppPaintsIt - measured.forcedToTheBundledFace),
      `${subject.what} is not painted in "${face.family}" — "${sample}" measures ${measured.asTheAppPaintsIt}px there, where the same text in that face measures ${measured.forcedToTheBundledFace}px and in the fallback (${face.fallback}) ${measured.forcedToTheFallback}px. The app is painting ${face.appliesTo} in something else.`,
    ).toBeLessThan(0.5)
  })
}

test('every bundled typeface is served by the app itself, and arrives', async ({ page }) => {
  const responses: Array<{ url: string; status: number }> = []
  page.on('response', (r) => responses.push({ url: r.url(), status: r.status() }))

  await openScheduleList(page)
  await page.evaluate(async () => {
    await document.fonts.ready
  })

  const origin = new URL(page.url()).origin

  for (const face of BUNDLED_FACES) {
    const fontResponses = responses.filter((r) => new URL(r.url).pathname === face.url)

    expect(
      fontResponses.length,
      `nothing requested ${face.url} at all — either no rendered text names "${face.family}", or its @font-face points somewhere else`,
    ).toBeGreaterThan(0)

    // Deduplicated, because one fetch or two is a caching detail; where it came
    // from and whether it arrived are not.
    const outcomes = [
      ...new Set(fontResponses.map((r) => `${new URL(r.url).origin} -> ${r.status}`)),
    ]

    expect(
      outcomes,
      `${face.url} must come from this app's own origin and return 200 — a 404 renders ${face.appliesTo} in a fallback that looks fine, and another origin is a font that is not there on a train`,
    ).toEqual([`${origin} -> 200`])
  }
})

test('nothing the app loads comes from another origin', async ({ page }) => {
  const requested: string[] = []
  page.on('request', (r) => requested.push(r.url()))

  await openScheduleList(page)
  await page.evaluate(async () => {
    await document.fonts.ready
  })

  const origin = new URL(page.url()).origin
  const foreign = [
    ...new Set(
      requested.filter((url) => /^https?:/i.test(url) && new URL(url).origin !== origin),
    ),
  ]

  expect(
    foreign,
    'the app fetched something from another origin. Installed on a phone with no network, every one of these is a request that fails and something the user does not get.',
  ).toEqual([])
})

test('no stylesheet points a font at another origin', async ({ page }) => {
  await openScheduleList(page)

  // The test above sees only what this page happened to fetch. A face declared
  // for text that is not currently on screen — a weight used by one view, an
  // italic — is never requested here and would slip past it, then fail on a
  // train. This reads the declarations themselves, so an unused cross-origin
  // source is caught before anyone relies on it.
  const audit = await page.evaluate(() => {
    const offenders: string[] = []
    let fontFacesInspected = 0

    const isForeign = (url: string): boolean =>
      new URL(url, location.href).origin !== location.origin

    const walk = (rules: CSSRuleList): void => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSImportRule) {
          if (isForeign(rule.href)) offenders.push(`@import ${rule.href}`)
          if (rule.styleSheet) walk(rule.styleSheet.cssRules)
        } else if (rule instanceof CSSFontFaceRule) {
          fontFacesInspected += 1
          // `cssText` rather than `style.getPropertyValue('src')`: the two
          // engines serialise `src` differently, the raw text does not.
          for (const match of rule.cssText.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
            const url = match[1]
            if (url !== undefined && isForeign(url)) offenders.push(`@font-face src ${url}`)
          }
        } else if (rule instanceof CSSGroupingRule) {
          walk(rule.cssRules)
        }
      }
    }

    for (const sheet of Array.from(document.styleSheets)) {
      if (sheet.href !== null && isForeign(sheet.href)) {
        // A cross-origin sheet is already the violation, and its rules cannot
        // be read from script anyway.
        offenders.push(`<link> ${sheet.href}`)
        continue
      }
      try {
        walk(sheet.cssRules)
      } catch {
        offenders.push(`unreadable stylesheet ${sheet.href ?? '(inline)'}`)
      }
    }

    return { offenders, fontFacesInspected }
  })

  // Without this the audit would report a clean sweep on a page that declares
  // fewer bundled faces than it ships — including none at all, which is the
  // situation this whole file exists to prevent. Counted against the length of
  // the list rather than against zero, so that a candidate bundling more than
  // one face cannot pass this having inspected only the first.
  expect(
    audit.fontFacesInspected,
    `the page declares ${audit.fontFacesInspected} @font-face rules, and this candidate bundles ${BUNDLED_FACES.length} faces — so this audit did not inspect all of them`,
  ).toBeGreaterThanOrEqual(BUNDLED_FACES.length)

  expect(
    audit.offenders,
    'a font is declared against another origin. The point of self-hosting is that an installed app with no network still has its typeface.',
  ).toEqual([])
})
