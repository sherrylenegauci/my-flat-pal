/**
 * The Node APIs the file-reading test tiers use, declared locally.
 *
 * Precedent: `playwright.config.ts` declares `process` by hand rather than
 * adding `@types/node`, on the grounds that a whole type package for one
 * environment variable is not something plan.md's dependency budget can
 * justify. The same reasoning holds here — these tiers read a handful of files
 * and inflate one byte stream — and `npx tsc --noEmit` has to stay clean either
 * way.
 *
 * Deliberately narrow: only the calls actually made, with only the overloads
 * actually used. If a future test needs more, widening this is a smaller
 * decision than taking the dependency, and it stays visible in review.
 *
 * It lived in `tests/build/` until the asset tier (`tests/assets/`) needed the
 * same two calls. Ambient declarations are program-wide wherever they sit, so
 * the move is only about where a reader would look for them.
 */
declare module 'node:fs' {
  export function existsSync(path: string): boolean
  export function readFileSync(path: string, encoding: 'utf8'): string
  /** Without an encoding, Node returns a Buffer, which is a `Uint8Array`. */
  export function readFileSync(path: string): Uint8Array
}

declare module 'node:zlib' {
  /**
   * Inflates a zlib stream. Used to decode the IDAT chunks of the generated
   * icon PNGs — the alternative was a PNG library, which Principle I would have
   * made us justify for one call site.
   */
  export function inflateSync(data: Uint8Array): Uint8Array
}
