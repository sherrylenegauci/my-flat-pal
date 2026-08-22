import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { readFileSync } from 'node:fs'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'
import { MAINTENANCE } from '../../src/ui/navigation'
import type { Area } from '../../src/ui/navigation'
import { YEARLY, aCompletion, anItem, seed } from './seed'

/**
 * T013 — US2, FR-004 and FR-005: every area is identifiable by name, and the
 * one you are in is marked as current.
 *
 * `ROOMS` is a stand-in for an area that does not exist yet. 003 builds the
 * real one; nothing here should be read as evidence that the app has rooms.
 *
 * ## Two halves, and the second one is weaker than it looks
 *
 * FR-005 — announced by name, and the current one announced as current — is a
 * claim about the accessibility tree, and jsdom holds a real accessibility tree.
 * That half is checked properly below.
 *
 * FR-004 also says the indication **MUST NOT rely on colour alone**, and jsdom
 * cannot check that at all. It resolves no cascaded colour and computes no
 * layout, so a check of what the current tab looks like would pass whatever the
 * stylesheet said — the kind of check the constitution forbids outright,
 * because it reads as coverage.
 *
 * So the second half reads `src/ui/app.css` **off disk** and asks whether the
 * rule that marks the current area changes anything that is not a colour. That
 * is a check on source text and nothing more. It cannot tell you the rule
 * applies to the element, that the cascade does not override it, that the
 * difference is perceptible, or that anyone would notice it at 375px on a phone
 * in daylight. The check that can is
 * `e2e/rendering/tab-colour-independence.spec.ts` (T015), which strips colour
 * out of a real engine and reads what survives — and that spec is skipped until
 * rooms exists, because with one area there is no bar to photograph. Whether a
 * VoiceOver user actually hears "current page" is T022, on a real iPhone.
 */
const ROOMS: Area = { id: 'rooms', label: 'Rooms', root: { name: 'schedule' } }

const AREAS_UNDER_TEST: readonly Area[] = [MAINTENANCE, ROOMS]

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0))
})
afterEach(() => vi.useRealTimers())

function launch() {
  seed([
    anItem({
      name: 'Boiler service',
      interval: YEARLY,
      completions: [aCompletion('2025-06-01')],
    }),
  ])

  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  render(
    <StrictMode>
      <App areas={AREAS_UNDER_TEST} />
    </StrictMode>,
  )
  return user
}

const theBar = () => screen.getByRole('navigation', { name: /areas/i })
const tab = (label: string) => within(theBar()).getByRole('button', { name: label })

/**
 * Which tabs claim to be the current one, by name.
 *
 * `aria-current="false"` counts as not current — that is what the attribute
 * means, and a tab bar that marks every tab false but one is a legitimate
 * implementation.
 */
const markedCurrent = () =>
  AREAS_UNDER_TEST.filter((area) => {
    const value = tab(area.label).getAttribute('aria-current')
    return value !== null && value !== 'false'
  }).map((area) => area.label)

describe('naming the areas (FR-005)', () => {
  it('gives every tab a name of its own', async () => {
    launch()
    await screen.findByText('Boiler service')

    for (const area of AREAS_UNDER_TEST) {
      expect(tab(area.label)).toBeTruthy()
    }
  })
})

describe('marking the current area (FR-005)', () => {
  it('marks the area you are in, and only that one', async () => {
    launch()
    await screen.findByText('Boiler service')

    expect(tab('Maintenance').getAttribute('aria-current')).toBe('page')
    expect(markedCurrent()).toEqual(['Maintenance'])
  })

  it('moves the mark when you switch', async () => {
    // The half that catches a mark hard-coded onto the first tab. A marking
    // that never moves is worse than none: it tells a user who cannot see the
    // screen that they are somewhere they are not.
    const user = launch()
    await screen.findByText('Boiler service')

    await user.click(tab('Rooms'))
    await screen.findByRole('heading', { name: 'Rooms' })

    expect(tab('Rooms').getAttribute('aria-current')).toBe('page')
    expect(markedCurrent()).toEqual(['Rooms'])
  })

  it('moves it back again', async () => {
    const user = launch()
    await screen.findByText('Boiler service')
    await user.click(tab('Rooms'))
    await screen.findByRole('heading', { name: 'Rooms' })

    await user.click(tab('Maintenance'))
    await screen.findByText('Boiler service')

    expect(markedCurrent()).toEqual(['Maintenance'])
  })
})

/**
 * The colour half — read from source, and honest about that.
 *
 * Same idiom as `tests/assets/palette-single-source.test.ts`: read the file,
 * blank the comments, look at what is declared. The comment strip is copied
 * from there rather than shared, because that file runs in a different Vitest
 * project; it is two lines, and Principle I asks for a third call site before
 * anything becomes shared machinery.
 */
/**
 * The repo root, derived from this file rather than from the working directory.
 *
 * `/@fs` is stripped, and that is not cosmetic. `tests/assets/` and
 * `tests/build/` take `new URL('../../', import.meta.url).pathname` straight,
 * because those projects run in node and get a `file:` URL. This file runs in
 * the jsdom project, where Vite serves the module and `import.meta.url` is an
 * `http:` URL whose path is prefixed with `/@fs`. Taken straight it produces a
 * path that does not exist, and `readFileSync` throws ENOENT — which would fail
 * this test for a reason that has nothing to do with the stylesheet.
 */
const PROJECT_ROOT = (() => {
  const here = decodeURIComponent(new URL(import.meta.url).pathname).replace(/^\/@fs/, '')
  const marker = here.lastIndexOf('/tests/ui/')
  if (marker === -1) throw new Error(`cannot locate the repo root from ${here}`)
  return here.slice(0, marker + 1)
})()

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
}

/**
 * Properties that only ever change a colour.
 *
 * `box-shadow` is here deliberately. A shadow draws a shape, so it is tempting
 * to count it as more than colour — but it is invisible to anyone who cannot
 * distinguish it from what it sits on, which is the person FR-004 is about.
 * Weight, size, spacing and border *width* survive that; a coloured ring does
 * not necessarily.
 */
const COLOUR_ONLY = new Set([
  'color',
  'background',
  'background-color',
  'background-image',
  'border-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'text-decoration-color',
  'fill',
  'stroke',
  'box-shadow',
  'filter',
])

/**
 * Every declaration inside rules that mark **a tab** as current.
 *
 * Both halves of that are load-bearing. `aria-current` alone was too loose: any
 * rule anywhere in the stylesheet using the attribute satisfied it, so the day a
 * second component adopts `aria-current` the tab bar's own indicator could be
 * reduced to a colour change with this still green. Verification pointed that
 * out; the selector must now mention the bar as well.
 */
function currentAreaDeclarations(css: string): { selector: string; property: string }[] {
  const found: { selector: string; property: string }[] = []

  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (selector === undefined || body === undefined) continue
    if (!selector.includes('aria-current') || !selector.includes('tab-bar')) continue

    for (const declaration of body.split(';')) {
      const property = declaration.split(':')[0]?.trim().toLowerCase()
      if (property) found.push({ selector: selector.trim().replace(/\s+/g, ' '), property })
    }
  }

  return found
}

describe('the current area is marked by more than colour (FR-004)', () => {
  it('is marked in the stylesheet by whatever the accessibility tree is marked by', () => {
    // Keyed off `aria-current` rather than off a class, so the visible marking
    // and the announced one cannot drift apart — and so this check has
    // something to look for that the tests above already pin down.
    const css = withoutComments(readFileSync(`${PROJECT_ROOT}src/ui/app.css`, 'utf8'))

    expect(
      css,
      'src/ui/app.css has no rules left after comments were stripped, so this check ' +
        'scanned nothing. Something opened a comment that is not one.',
    ).toContain('{')

    expect(
      currentAreaDeclarations(css).map((d) => d.selector),
      'no rule in src/ui/app.css marks a tab-bar tab with [aria-current], so nothing ' +
        'about the current area is styled differently from any other tab',
    ).not.toEqual([])
  })

  it('changes something that is not a colour', () => {
    const css = withoutComments(readFileSync(`${PROJECT_ROOT}src/ui/app.css`, 'utf8'))
    const declared = currentAreaDeclarations(css)
    const nonColour = declared.filter((d) => !COLOUR_ONLY.has(d.property))

    expect(
      nonColour.map((d) => d.property),
      'the current area is distinguished only by colour. Declared on the current tab: ' +
        `${declared.map((d) => d.property).join(', ') || 'nothing'}. FR-004 requires the ` +
        'indication not to rely on colour alone — weight, border width, or an indicator ' +
        'edge with a size to it.',
    ).not.toEqual([])
  })
})
