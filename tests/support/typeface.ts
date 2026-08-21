/**
 * The bundled typeface, named in exactly one place.
 *
 * The face is still being chosen from a shortlist, so every candidate gets the
 * same tests on its own branch. Swapping candidate is this file and nothing
 * else — no test spells a family name or a file path out for itself, which is
 * what stops a swap leaving one assertion pointed at the face that lost.
 *
 * **This candidate bundles one face.** Source Sans 3 sets everything, headings
 * included — `--font-heading` points straight at `--font`. The sibling
 * candidate that bundles a serif for headings as well has two entries in the
 * list below and nothing else different, which is the point of the list: the
 * tests that are about a *file* iterate it, so a candidate with more faces
 * extends them without anyone editing an assertion.
 *
 * Each file is self-hosted from `public/`, so it is same-origin and unhashed:
 * Vite copies `public/**` into the build root untouched. Unhashed is
 * deliberate — it is what lets the URL be written literally in `@font-face`
 * without a build step — and it is also why the service worker's precache
 * revision is the only thing that can invalidate a changed font.
 *
 * ## Which tier can check what, and why jsdom is absent from that list
 *
 * There is **no honest jsdom test for a typeface**, and this file is where that
 * is written down rather than left to be rediscovered.
 *
 * jsdom loads no font resources, resolves no `@font-face`, performs no layout
 * and measures no glyph. `getComputedStyle(el).fontFamily` there returns
 * whatever string the cascade concatenated — it is true whether the file exists,
 * whether it is on this origin, and whether a single character was ever painted
 * with it. A test asserting that string would be asserting a CSS token, which
 * Principle III calls a defect, and it would pass in exactly the situation this
 * work exists to prevent: the woff2 404s and the app quietly renders in the
 * fallback. The constitution's rule against writing a check that cannot check
 * applies squarely, so `tests/ui/` gets nothing.
 *
 * What the other two tiers can honestly say:
 *
 *   - `e2e/typeface.spec.ts` — a real engine, so: each file was requested, it
 *     came from this origin, it arrived, and the text on screen is measurably
 *     painted with it rather than a fallback. Runs against `vite dev`
 *     (playwright.config.ts explains why), where vite-plugin-pwa registers no
 *     service worker, so **nothing about offline is checkable there**.
 *   - `tests/build/typeface-precache.test.ts` — the built `dist/` and its
 *     generated service worker, which is the only place the offline claim
 *     exists at all.
 */

export interface BundledFace {
  /**
   * What this face is for, in words, so a failure names the thing a reader can
   * see on screen rather than a file.
   */
  appliesTo: string

  /** The `font-family` name declared in `src/ui/fonts.css`. */
  family: string

  /**
   * The custom property in `src/ui/tokens.css` that points the app at this
   * face. Used only in failure messages — asserting on it would be asserting a
   * CSS token, which is the defect this whole file exists to avoid.
   */
  token: string

  /** The path the browser requests it from, root-relative, as written in `src/`. */
  url: string

  /**
   * The rest of the stack behind it in `src/ui/tokens.css` — that is, exactly
   * what a user would see if this face never arrived.
   *
   * This is the **control** for the width comparison in `e2e/typeface.spec.ts`,
   * not a claim: the test asserts that painted text measures differently from
   * this, so that "it measures the same as the bundled face" cannot be true of
   * a page that never loaded the bundled face. Naming the real fallback rather
   * than a generic `serif` means the control is the actual failure mode.
   *
   * It is copied from `tokens.css` rather than read from it, which means it can
   * drift if someone reorders that stack. Drift makes the control less
   * pointed — it would compare against a fallback the app no longer uses — but
   * it cannot make the test pass wrongly: the claim is measured against the
   * bundled family, and the control only has to be *some* face that measures
   * differently for the comparison to mean anything. If it stops being one, the
   * control assertion fails and says so.
   */
  fallback: string
}

/**
 * Everything, headings included: `--font` in `src/ui/tokens.css`, which
 * `--font-heading` also points at on this candidate.
 *
 * The fallback is why this is worth measuring at all. It is the system stack,
 * which on the phone this app is built for is San Francisco — a perfectly good
 * typeface. A bundled face that 404s therefore does not produce a broken-looking
 * page. It produces a page that looks fine and is not the design, which is
 * exactly the failure nobody reports.
 */
export const BODY_FACE: BundledFace = {
  appliesTo: 'body text',
  family: 'Source Sans 3',
  token: '--font',
  url: '/fonts/source-sans-3-latin-var.woff2',
  fallback: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
}

/**
/**
 * Every face this candidate ships. One, here.
 *
 * The tests that are about a *file* — it arrives, it is same-origin, it is in
 * the precache manifest — iterate this, so adding or removing a face extends or
 * shrinks them without anyone editing an assertion. The tests that are about
 * *painted text* do not iterate it: each face is applied to different elements,
 * so each needs its own real, rendered sample to measure, and those are listed
 * in `e2e/typeface.spec.ts` beside the face they belong to.
 */
export const BUNDLED_FACES: readonly BundledFace[] = [BODY_FACE]

/**
 * The same file as workbox writes it into a precache manifest: root-relative
 * with no leading slash. Normalising through one function rather than two
 * literals keeps the build tier honest about which file it is looking for.
 */
export function precacheEntryFor(url: string): string {
  return url.replace(/^\//, '')
}
