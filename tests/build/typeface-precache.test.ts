import { build } from 'vite'
import { existsSync, readFileSync } from 'node:fs'
import { TYPEFACE_URL, precacheEntryFor } from '../support/typeface'

/**
 * The build tier — the only place the offline claim can be checked.
 *
 * ## Why this tier had to exist
 *
 * The constitution requires a service worker that caches the app shell, so a
 * home-screen launch with no network shows the app rather than a browser error
 * page. For a self-hosted typeface that is not a nicety: a font the installed
 * app cannot reach on a train is a font it renders without, and the app it
 * renders instead looks fine enough that nobody reports it.
 *
 * No existing tier can see this.
 *
 *   - jsdom loads nothing and builds nothing.
 *   - `e2e/` runs against `vite dev`, and vite-plugin-pwa registers no service
 *     worker in dev (see the long note in playwright.config.ts on why the dev
 *     server is the right target for that tier). There is no precache there to
 *     inspect, so a Playwright test claiming to cover this would be checking
 *     nothing.
 *
 * What is left is the artifact itself: run the production build and read what
 * workbox actually wrote. That is the thing that ships.
 *
 * ## What this asserts, stated honestly
 *
 * It asserts that the generated service worker's **precache manifest lists the
 * font**. It does not execute a service worker, does not install one, and does
 * not fetch anything with the network off. Node has no service worker to run
 * one in. The gap between "the manifest lists it" and "an installed phone with
 * no signal paints text in it" is real, and it closes on a device — the
 * constitution already requires installed behaviour to be verified there before
 * a release. This test covers the failure that has actually happened and can
 * regress silently: the file being left out of the manifest entirely.
 *
 * ## One build, several assertions
 *
 * `vite build` takes roughly two and a half seconds and the unit suite runs in
 * about eight, so the build happens once in `beforeAll` and both tests read the
 * same output. The two are kept separate because they fail for different
 * reasons and a maintainer should be told which: the font not being in `dist/`
 * at all is a different bug from the font being in `dist/` and unprecached.
 */

/** The repo root, derived from this file rather than from the working directory. */
const PROJECT_ROOT = decodeURIComponent(new URL('../../', import.meta.url).pathname)

/**
 * Its own output directory, not `dist/`.
 *
 * Building into `dist/` would mean every `npx vitest run` silently overwrites
 * whatever the last `npm run build` produced — and it would not overwrite it
 * with the same thing, because Vitest sets `NODE_ENV=test` and vite-plugin-pwa
 * takes workbox's mode from there. Someone who built, ran the suite, then
 * deployed `dist/` would ship a service worker nobody built on purpose. A
 * separate directory costs one gitignore line and removes that entirely.
 */
const OUT_DIR = `${PROJECT_ROOT}dist-test/`

let serviceWorker = ''

beforeAll(async () => {
  await build({ root: PROJECT_ROOT, logLevel: 'silent', build: { outDir: OUT_DIR } })
  serviceWorker = readFileSync(`${OUT_DIR}sw.js`, 'utf8')
})

/**
 * Every URL workbox precached, read back out of the generated worker.
 *
 * The manifest is inlined into `sw.js` as a `precacheAndRoute([...])` argument,
 * so it is read with a pattern rather than parsed. The pattern tolerates both
 * the minified form (`url:"x"`) and the expanded one (`"url": "x"`): which one
 * workbox emits depends on `NODE_ENV`, which Vitest sets to `test`, and *which
 * files are listed does not depend on that at all* — the list comes from
 * `workbox.globPatterns` either way. So the claim under test is unaffected;
 * only the spelling is.
 *
 * Reading minified output with a regex is fragile in one specific way: a
 * workbox upgrade could change the shape and this would quietly return
 * nothing. That is why the test below first asserts a file it *knows* is
 * precached is present. A pattern that has stopped matching then fails loudly
 * instead of passing vacuously.
 */
function precachedUrls(sw: string): string[] {
  const urls: string[] = []
  for (const match of sw.matchAll(/"?url"?\s*:\s*"([^"]+)"/g)) {
    const url = match[1]
    if (url !== undefined) urls.push(precacheEntryFor(url))
  }
  return urls
}

test('the bundled typeface is in the build output', () => {
  const file = `${OUT_DIR}${precacheEntryFor(TYPEFACE_URL)}`

  expect(
    existsSync(file),
    `the build produced no ${TYPEFACE_URL} — the file is missing from public/, or it has been renamed since tests/support/typeface.ts was written`,
  ).toBe(true)
})

test('the service worker precaches the bundled typeface', () => {
  const precached = precachedUrls(serviceWorker)

  // Guard, not a claim: if this fails the pattern above has stopped reading the
  // manifest, and every result below it is meaningless rather than passing.
  expect(
    precached,
    'could not read a precache manifest out of dist/sw.js — the pattern in precachedUrls() no longer matches what workbox emits',
  ).toContain('index.html')

  expect(
    precached,
    `${TYPEFACE_URL} is not precached, so an installed launch with no network has no font to paint with and falls back silently. Check workbox.globPatterns in vite.config.ts covers woff2.`,
  ).toContain(precacheEntryFor(TYPEFACE_URL))
})
