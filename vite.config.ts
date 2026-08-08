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
        theme_color: '#1f2933',
        background_color: '#f7f7f5',
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
    globals: true,
    // T003 — two environments. Domain and storage tests are pure and need no
    // DOM; running them without jsdom keeps the bulk of the suite fast.
    environment: 'node',
    environmentMatchGlobs: [['tests/ui/**', 'jsdom']],
    // T004 — RTL cleanup, only needed where there is a DOM.
    setupFiles: ['./tests/setup.ts'],
  },
})
