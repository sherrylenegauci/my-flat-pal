import { defineConfig, devices } from '@playwright/test'

/**
 * The real-browser tier (T085).
 *
 * This is the third tier of the constitution's Testing Strategy — the one that
 * was a manual checklist. It exists to check the things jsdom genuinely cannot:
 * resolved cascaded colour, real layout, and a real focus ring. See plan.md
 * § Dependency budget for the justification of adding Playwright at all.
 *
 * ## Isolation from Vitest
 *
 * Two suites, two runners, no overlap:
 *   - Vitest collects only `tests/domain/**` and `tests/{storage,ui}/**`
 *     (explicit `include` globs in vite.config.ts). It cannot reach `e2e/`.
 *   - Playwright collects only `testDir: './e2e'`. It cannot reach `tests/`.
 *
 * Both directions are verified rather than assumed: `npx vitest run` reports the
 * same count as before this directory existed, and `npx playwright test --list`
 * lists only files under `e2e/`.
 *
 * ## Why these two browsers
 *
 * Chromium and WebKit only. WebKit is not optional here — the target device is
 * an iPhone, where every browser is WebKit, and it is the engine most likely to
 * differ on the things this tier checks (form control metrics, focus
 * behaviour). Firefox would test an engine no user of this app will ever run.
 *
 * ## Why a fixed viewport and a fixed timezone
 *
 * 375px is the width Principle II requires the layout to be designed at. The
 * timezone is pinned because the app derives "today" from the device clock and
 * the specs pin the clock (see e2e/support/app.ts); a floating timezone would
 * make the seeded statuses depend on where the machine happens to be.
 */
/**
 * Declared here rather than pulled in with `@types/node`.
 *
 * Principle I: a whole type package for two environment variables is not a
 * dependency this file can justify, and `npx tsc --noEmit` has to stay clean.
 * Four uses: three `CI`, one `PLAYWRIGHT_PORT`.
 */
declare const process: { env: Record<string, string | undefined> }

/**
 * ## Why this port is overridable, and why that is a correctness fix
 *
 * `reuseExistingServer` is on outside CI, which is right for the ordinary case:
 * a dev server you already have open makes the suite start instantly. Combined
 * with a hard-coded port it is also a trap, and it was sprung. This repository
 * is worked on in git worktrees — several checkouts of different branches, side
 * by side — and `vite` in any of them binds 5173. Whichever one got there first
 * then serves *every* browser run started from *any* of them.
 *
 * The failure is silent and it points the wrong way. A run can go green against
 * a checkout that does not contain the change under test, or red against one
 * that does not contain the fix; both were observed here within a few minutes,
 * on a mark that was on the page in this worktree and absent from the one
 * actually being served. Nothing in the output says which checkout answered.
 *
 * So: `PLAYWRIGHT_PORT=5199 npx playwright test` when anything else might be
 * listening. The default is unchanged, because for a single checkout reuse is a
 * real convenience and there is nothing to collide with.
 */
const PORT = Number(process.env['PLAYWRIGHT_PORT'] ?? 5173)

export default defineConfig({
  testDir: './e2e',
  // Named so a failure reads as a browser-tier failure rather than a unit one.
  testMatch: /.*\.spec\.ts/,

  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  reporter: process.env['CI'] ? 'list' : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: `http://localhost:${PORT}`,
    // A slow machine must not be able to fail this suite; a wrong one must.
    trace: 'retain-on-failure',
    timezoneId: 'Europe/London',
    locale: 'en-GB',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 375, height: 812 },
        // `isMobile` is deliberately not set for WebKit: Playwright's WebKit
        // does not support it, and setting it throws at context creation.
        hasTouch: true,
        deviceScaleFactor: 3,
      },
    },
  ],

  /**
   * The dev server, not a preview of a build.
   *
   * Deliberate: `vite dev` serves the React development build, which means
   * `<StrictMode>` double-invocation is active — the same conditions
   * `tests/ui/**` runs under, and the conditions that hid the duplicate-job
   * bug. A production preview would silently switch that off.
   *
   * vite-plugin-pwa registers no service worker in dev (devOptions are off), so
   * nothing here is served from a cache and there is no stale-worker flake.
   */
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
})
