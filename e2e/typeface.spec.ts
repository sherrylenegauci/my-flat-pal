import { test, expect } from '@playwright/test'
import { openScheduleList } from './support/app'
import { TYPEFACE_FAMILY, TYPEFACE_URL } from '../tests/support/typeface'

/**
 * The bundled typeface, in a real engine.
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
 * ## Why this is not a sweep over APP_STATES
 *
 * Four of the specs in this directory iterate `APP_STATES`, and they should: a
 * touch target, a focus ring and a contrast ratio are all properties of a
 * particular view, so a new view genuinely needs re-checking. A typeface is not.
 * It is declared once, applied to `body`, and inherited by everything; the app
 * loads one stylesheet bundle regardless of which view is on screen. Sweeping
 * eight states across two engines would restate one document-level fact
 * sixty-four times, slow the suite, and give a maintainer eight identical
 * failures to read when one file has a typo in it.
 *
 * The judgement that makes that safe is "no view loads a stylesheet or a font
 * of its own", which is true today and is not the sort of thing that changes
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
 */

test('the app paints its text in the bundled typeface, not a fallback', async ({ page }) => {
  await openScheduleList(page)

  const measured = await page.evaluate(async (family) => {
    // Every font the page itself decided it needed has finished loading.
    await document.fonts.ready

    // Read this *before* anything below asks for the face, because asking for
    // it would load it and make the answer trivially yes. As it stands the
    // browser has downloaded the face only if something the app renders named
    // it — a browser never fetches an `@font-face` nobody uses. So this alone
    // catches a family misspelled in `--font`, a family misspelled in the
    // `@font-face`, and the two failing to match each other.
    const theAppAskedForIt = document.fonts.check(`32px "${family}"`)

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
      // Nothing to do. `theAppAskedForIt` above has already recorded that the
      // face is unavailable, and that is what fails.
    }

    // Long enough, and mixed enough, that two different faces cannot advance
    // to the same total width by coincidence.
    const SAMPLE = 'Handgloves 0123456789 — bleed the radiators'

    function widthOf(override: string | null): number {
      const probe = document.createElement('span')
      probe.textContent = SAMPLE
      probe.style.position = 'absolute'
      probe.style.left = '-10000px'
      probe.style.top = '0'
      probe.style.whiteSpace = 'pre'
      // Larger than body text so a metric difference is many pixels rather
      // than something a rounding mode could swallow.
      probe.style.fontSize = '32px'
      // `null` means "change nothing", so the probe inherits `body`'s font
      // exactly as a user's text does.
      if (override !== null) probe.style.fontFamily = override
      document.body.appendChild(probe)
      const width = probe.getBoundingClientRect().width
      probe.remove()
      return width
    }

    return {
      theAppAskedForIt,
      asTheAppPaintsIt: widthOf(null),
      forcedToTheBundledFace: widthOf(`"${family}"`),
      forcedToSomethingElse: widthOf('serif'),
    }
  }, TYPEFACE_FAMILY)

  expect(
    measured.theAppAskedForIt,
    `the browser never loaded "${TYPEFACE_FAMILY}", which means nothing the app renders asks for it — check that --font names the family and that the @font-face declares the same spelling`,
  ).toBe(true)

  // Control. If measuring cannot tell two faces apart on this engine then the
  // assertion after it proves nothing, so the difference is asserted rather
  // than assumed.
  expect(
    Math.abs(measured.asTheAppPaintsIt - measured.forcedToSomethingElse),
    'measuring text width cannot distinguish two different faces here, so this test cannot tell whether the right one is in use',
  ).toBeGreaterThan(1)

  // The claim: the text a user sees measures the same as that text explicitly
  // painted in the bundled face. If the app were silently falling back, these
  // would differ.
  expect(
    Math.abs(measured.asTheAppPaintsIt - measured.forcedToTheBundledFace),
    `body text is not painted in "${TYPEFACE_FAMILY}" — it measures ${measured.asTheAppPaintsIt}px, where the same text in that face measures ${measured.forcedToTheBundledFace}px. The app is rendering in a fallback.`,
  ).toBeLessThan(0.5)
})

test('the typeface is served by the app itself, and it arrives', async ({ page }) => {
  const responses: Array<{ url: string; status: number }> = []
  page.on('response', (r) => responses.push({ url: r.url(), status: r.status() }))

  await openScheduleList(page)
  await page.evaluate(async () => {
    await document.fonts.ready
  })

  const origin = new URL(page.url()).origin
  const fontResponses = responses.filter((r) => new URL(r.url).pathname === TYPEFACE_URL)

  expect(
    fontResponses.length,
    `nothing requested ${TYPEFACE_URL} at all — either no rendered text names "${TYPEFACE_FAMILY}", or the @font-face points somewhere else`,
  ).toBeGreaterThan(0)

  // Deduplicated, because one fetch or two is a caching detail; where it came
  // from and whether it arrived are not.
  const outcomes = [...new Set(fontResponses.map((r) => `${new URL(r.url).origin} -> ${r.status}`))]

  expect(
    outcomes,
    `${TYPEFACE_URL} must come from this app's own origin and return 200 — a 404 renders in a fallback that looks fine, and another origin is a font that is not there on a train`,
  ).toEqual([`${origin} -> 200`])
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
  // no bundled face at all, which is the situation this whole file exists to
  // prevent.
  expect(
    audit.fontFacesInspected,
    'no @font-face rule was found on the page, so this audit inspected nothing',
  ).toBeGreaterThan(0)

  expect(
    audit.offenders,
    'a font is declared against another origin. The point of self-hosting is that an installed app with no network still has its typeface.',
  ).toEqual([])
})
