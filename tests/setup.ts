import { afterEach } from 'vitest'

/**
 * Shared test setup.
 *
 * This runs for every test file, including the domain and storage suites that
 * deliberately have no DOM (see `environmentMatchGlobs` in vite.config.ts).
 * Everything here has to be guarded — a bare reference to `localStorage` in the
 * node environment is a ReferenceError, not an undefined value, and it takes
 * down the whole file before a single assertion runs.
 */
afterEach(async () => {
  if (typeof document !== 'undefined') {
    const { cleanup } = await import('@testing-library/react')
    cleanup()
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.clear()
  }
})
