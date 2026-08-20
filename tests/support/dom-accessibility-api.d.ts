/**
 * `computeAccessibleName`, declared locally so `npx tsc --noEmit` stays clean.
 *
 * `dom-accessibility-api` is already on disk — Testing Library depends on it and
 * uses it for every `getByRole({ name })` lookup — so importing it adds nothing
 * to the tree. What it does not have is a `types` entry that survives its own
 * `exports` map: the declarations exist at `dist/index.d.ts`, the map points the
 * `import` condition at `dist/index.mjs`, and TypeScript looks for a matching
 * `index.d.mts` that the package does not ship. Verified: TS7016, quoting
 * "There are types at .../dist/index.d.ts, but this result could not be resolved
 * when respecting package.json 'exports'".
 *
 * Precedent for fixing that here rather than with a dependency:
 * `tests/support/node-api.d.ts`, and before it `playwright.config.ts`'s hand-
 * written `process` declaration. The posture is the same — declare the calls
 * actually made, keep it narrow, and leave it visible in review.
 *
 * Only the one function, with only the signature used. The upstream one takes an
 * options bag; nothing here passes one.
 */
declare module 'dom-accessibility-api' {
  /**
   * The accessible name of an element, computed the way a screen reader
   * computes it — `aria-labelledby`, then `aria-label`, then the element's own
   * content, with `aria-hidden` subtrees excluded.
   */
  export function computeAccessibleName(element: Element): string
}
