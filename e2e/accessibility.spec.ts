import AxeBuilder from '@axe-core/playwright'
import { test, expect } from '@playwright/test'
import { APP_STATES } from './support/app'

/**
 * T086 — axe against real rendering. Takes over the manual T070.
 *
 * The same engine as `tests/ui/axe-helper.ts`, in a place where it can do its
 * whole job. That helper has to switch `color-contrast` off, because jsdom
 * resolves no cascaded colour and the rule would return a pass whatever the
 * palette actually was. **Here the rule is left on**, and it is the single
 * biggest reason this file exists: a real engine has computed styles, real
 * layout, and real stacking, so the answer means something.
 *
 * Scope is `wcag2a`/`wcag2aa`/`wcag21a`/`wcag21aa` — the levels Principle II
 * names. axe's `best-practice` rules are deliberately out: they are opinions
 * rather than the standard the constitution gates on, and a suite that fails on
 * an opinion gets muted, which costs the rules that matter.
 *
 * What axe still cannot judge, in any browser: whether the focus indicator is
 * visible (e2e/focus-visibility.spec.ts), whether touch targets are big enough
 * at 44px rather than axe's laxer 24px (e2e/layout.spec.ts), and whether status
 * survives colour being removed (e2e/colour-independence.spec.ts). Those are
 * why this is one file of four rather than the whole tier.
 */
const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

for (const state of APP_STATES) {
  test(`no accessibility violations: ${state.name}`, async ({ page }) => {
    await state.go(page)

    const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze()

    const violations = results.violations.map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help}\n    at: ${v.nodes
          .map((n) => n.target.join(' '))
          .join(', ')}`,
    )

    expect(violations, `axe violations in "${state.name}"`).toEqual([])
  })
}
