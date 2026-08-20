/**
 * The two Node APIs the build tier uses, declared locally.
 *
 * Precedent: `playwright.config.ts` declares `process` by hand rather than
 * adding `@types/node`, on the grounds that a whole type package for one
 * environment variable is not something plan.md's dependency budget can
 * justify. The same reasoning holds here — this tier reads one file and asks
 * whether another exists — and `npx tsc --noEmit` has to stay clean either way.
 *
 * Deliberately narrow: only the calls actually made, with only the overloads
 * actually used. If a future build test needs more, widening this is a smaller
 * decision than taking the dependency, and it stays visible in review.
 */
declare module 'node:fs' {
  export function existsSync(path: string): boolean
  export function readFileSync(path: string, encoding: 'utf8'): string
}
