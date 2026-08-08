import axe from 'axe-core'
import type { AxeResults, Result } from 'axe-core'

/**
 * Structural accessibility scan (T005).
 *
 * **What this checks**: roles, accessible names, labelling, focus order, ARIA
 * misuse. These are the bulk of real defects and they are genuinely automatable
 * here.
 *
 * **What this does not check**: colour contrast. jsdom computes no layout and
 * resolves no cascaded colour, so an automated contrast assertion in this
 * environment would pass regardless of the actual colours — worse than no
 * check, because it looks like coverage. Contrast is guaranteed at source in
 * `tokens.css` and measured per view in a real browser (T074).
 *
 * The contrast rules are disabled explicitly below rather than left to fail
 * silently, so nobody later mistakes their absence for an oversight.
 */
const RULES_JSDOM_CANNOT_JUDGE = ['color-contrast'] as const

export async function scanForViolations(container: HTMLElement): Promise<Result[]> {
  const results: AxeResults = await axe.run(container, {
    rules: Object.fromEntries(RULES_JSDOM_CANNOT_JUDGE.map((id) => [id, { enabled: false }])),
  })
  return results.violations
}

/** Formats violations so a failure says what is wrong, not just that it is. */
export function describeViolations(violations: Result[]): string {
  if (violations.length === 0) return 'no violations'

  return violations
    .map((v) => {
      const targets = v.nodes.map((n) => n.target.join(' ')).join(', ')
      return `  ${v.id} (${v.impact}): ${v.help}\n    at: ${targets}`
    })
    .join('\n')
}

/** Convenience: scan and assert, with a readable message on failure. */
export async function expectNoViolations(container: HTMLElement): Promise<void> {
  const violations = await scanForViolations(container)
  if (violations.length > 0) {
    throw new Error(`Accessibility violations found:\n${describeViolations(violations)}`)
  }
}
