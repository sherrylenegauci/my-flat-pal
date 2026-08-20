/**
 * The bundled typeface, named in exactly one place.
 *
 * The face is still being chosen from a shortlist, so every candidate gets the
 * same tests on its own branch. Swapping candidate is the two lines below and
 * nothing else — no test spells the family name or the file path out for
 * itself, which is what stops a swap leaving one assertion pointed at the face
 * that lost.
 *
 * The file is self-hosted from `public/`, so it is same-origin and unhashed:
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
 *   - `e2e/typeface.spec.ts` — a real engine, so: the file was requested, it
 *     came from this origin, it arrived, and the text on screen is measurably
 *     painted with it rather than a fallback. Runs against `vite dev`
 *     (playwright.config.ts explains why), where vite-plugin-pwa registers no
 *     service worker, so **nothing about offline is checkable there**.
 *   - `tests/build/typeface-precache.test.ts` — the built `dist/` and its
 *     generated service worker, which is the only place the offline claim
 *     exists at all.
 */

/** The `font-family` name declared in `src/ui/fonts.css` and named by `--font`. */
export const TYPEFACE_FAMILY = 'Source Sans 3'

/** The path the browser requests it from, root-relative, as written in `src/`. */
export const TYPEFACE_URL = '/fonts/source-sans-3-latin-var.woff2'

/**
 * The same file as workbox writes it into a precache manifest: root-relative
 * with no leading slash. Normalising through one function rather than two
 * literals keeps the build tier honest about which file it is looking for.
 */
export function precacheEntryFor(url: string): string {
  return url.replace(/^\//, '')
}
