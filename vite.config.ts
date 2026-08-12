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
        name: 'my-flat-pal',
        short_name: 'Flat Pal',
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
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
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
    ],
  },
})
