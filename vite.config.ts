// From `vitest/config`, not `vite` — the plain Vite `defineConfig` does not
// know about the `test` key and rejects it at type-check time.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    // T007 — manifest + service worker.
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'my flat pal',
        short_name: 'my flat pal',
        description: 'Keep track of the upkeep your flat needs.',
        // --surface and --surface-sunken from src/ui/tokens.css: the header the
        // status bar meets, and the page behind the launch splash. Both were
        // still the first palette's values two palettes later — the manifest is
        // the one place colour lives that no stylesheet reaches, so it has to be
        // updated by hand whenever the tokens move.
        theme_color: '#ffffff',
        background_color: '#e7ecf2',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the app shell so a home-screen launch with no network shows
        // the app rather than a browser error page. This is the offline floor
        // the constitution requires — deliberately not offline-first.
        //
        // `woff2` is here because the app now bundles its own typeface
        // (src/ui/fonts.css). Without it Vite still copied the file into
        // `dist/fonts/` and workbox still left it out of the manifest, so an
        // installed launch with no network fetched nothing and fell back to the
        // system stack — legible, so nobody would have reported it.
        // `tests/build/typeface-precache.test.ts` is what stops that returning.
        //
        // Note this precaches *every* matching file in the build, so
        // `public/fonts/` must hold only the face that ships.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,woff2}'],
        // `prompt` + skipWaiting:false means a stale worker cannot silently
        // strand an installed user, and an update never discards work in
        // progress — it waits to be accepted.
        skipWaiting: false,
        clientsClaim: false,
      },
    }),
  ],
  test: {
    // T003 — two projects rather than one config with per-glob environments.
    // `environmentMatchGlobs` does the same job but is deprecated in Vitest 3.
    //
    // Domain tests are pure and need no DOM, so they run in node and stay fast.
    // Storage tests use jsdom even though plan.md put them in node: the
    // repository talks to localStorage, and jsdom ships a real implementation.
    // Testing against a hand-rolled fake risks the fake diverging from the
    // thing it stands in for — string coercion, quota behaviour — which is
    // exactly the class of bug this layer must not have, since it holds the
    // only copy of the user's data.
    projects: [
      {
        test: {
          name: 'domain',
          globals: true,
          environment: 'node',
          include: ['tests/domain/**/*.test.ts'],
          setupFiles: ['./tests/setup.ts'],
        },
      },
      {
        test: {
          name: 'browser-ish',
          globals: true,
          environment: 'jsdom',
          include: ['tests/{storage,ui}/**/*.test.{ts,tsx}'],
          // T004 — RTL cleanup, only meaningful where there is a DOM.
          setupFiles: ['./tests/setup.ts'],
        },
      },
      {
        test: {
          // The asset tier. Reads files that ship as-is out of `public/` and
          // compares them against the source of truth they were generated from.
          //
          // Separate from the build tier below for one reason: that tier runs a
          // full production build, and a second file there is a second build.
          // Nothing here needs one — an icon PNG is copied into `dist/`
          // untouched, so reading it from `public/` reads exactly what ships.
          //
          // Node, no DOM. This exists because the icons drifted two palettes
          // behind the app without anything noticing, and the reason nothing
          // noticed is that no tier had ever opened one.
          name: 'assets',
          globals: true,
          environment: 'node',
          include: ['tests/assets/**/*.test.ts'],
        },
      },
      {
        test: {
          // The build tier. Asserts things that only exist once `vite build`
          // has run — principally what the generated service worker precaches,
          // which is the offline floor the constitution requires and which no
          // other tier can see: jsdom builds nothing, and `e2e/` runs against
          // `vite dev`, where vite-plugin-pwa registers no service worker.
          //
          // Node, no DOM: it reads build output from disk.
          //
          // A build is slow relative to the ~8s unit suite, so this project is
          // deliberately kept to one file that builds once in `beforeAll` and
          // shares the result. Keep it that way — a second file here is a
          // second build.
          name: 'build',
          globals: true,
          environment: 'node',
          include: ['tests/build/**/*.test.ts'],
          // Generous, because it covers a full production build on a cold cache
          // and on whatever machine CI hands us. It is a ceiling that stops a
          // hang, not a performance budget.
          testTimeout: 120_000,
          hookTimeout: 120_000,
          // No setup file: tests/setup.ts is RTL cleanup, which has nothing to
          // clean up here.
        },
      },
    ],
  },
})
