import { describe, it, expect, beforeEach } from 'vitest'
import { StrictMode } from 'react'
import { render, screen } from '@testing-library/react'
import { App } from '../../src/ui/App'
import { MAINTENANCE } from '../../src/ui/navigation'
import type { Area } from '../../src/ui/navigation'
import { AREA_ICONS } from '../../src/ui/icons'

/**
 * The tab icons say nothing.
 *
 * The counterpart to `mark.test.tsx`, and it exists for the same reason: an
 * icon that names itself makes a screen reader announce the tab twice — "Spanner
 * Maintenance" — and **axe passes that**, because there is nothing invalid about
 * a labelled graphic inside a button. So the only thing standing between the app
 * and a doubled announcement is a test that goes looking for it.
 *
 * What this file cannot tell you is what VoiceOver actually says. jsdom does not
 * compute an accessible name the way a real screen reader does, so "the button's
 * name is exactly its label" here is a claim about the DOM, not about iOS. The
 * announcement itself is T022, on a real iPhone.
 *
 * The second area is a stand-in — see the note in `tab-bar.test.tsx`. Rooms does
 * not exist yet; this is a bar with something in it to look at.
 */
const ROOMS: Area = { id: 'rooms', label: 'Rooms', root: { name: 'schedule' } }
const AREAS_UNDER_TEST: readonly Area[] = [MAINTENANCE, ROOMS]

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '/')
})

describe('the tab icons', () => {
  it('draws one for every area', () => {
    render(
      <StrictMode>
        <App areas={AREAS_UNDER_TEST} />
      </StrictMode>,
    )

    for (const area of AREAS_UNDER_TEST) {
      const tab = screen.getByRole('button', { name: area.label })
      expect(tab.querySelector('svg.tab-bar__icon')).not.toBeNull()
    }
  })

  it('hides them from assistive technology, so the tab is announced once', () => {
    render(
      <StrictMode>
        <App areas={AREAS_UNDER_TEST} />
      </StrictMode>,
    )

    for (const area of AREAS_UNDER_TEST) {
      const tab = screen.getByRole('button', { name: area.label })
      const icon = tab.querySelector('svg.tab-bar__icon')

      expect(icon?.getAttribute('aria-hidden')).toBe('true')
      // No <title>, no aria-label, no role="img" — each of which would put a
      // second name in front of the label.
      expect(icon?.querySelector('title')).toBeNull()
      expect(icon?.getAttribute('aria-label')).toBeNull()
      expect(icon?.getAttribute('role')).toBeNull()

      // The name is the label and nothing else. `getByRole` above matches on a
      // normalised substring by default, so this is what actually pins it.
      expect(tab.textContent?.trim()).toBe(area.label)
    }
  })

  it('carries no colour of its own, so the tab decides it', () => {
    // Principle V: colour lives in tokens.css and is applied by app.css. A fill
    // or stroke literal in the geometry would survive a palette change and
    // leave one icon in the old accent — which is exactly how the app icons
    // ended up two palettes stale before `mark.ts` existed.
    const everyPath = Object.values(AREA_ICONS).flatMap((shapes) => shapes.map((shape) => shape.d))

    expect(everyPath.length).toBeGreaterThan(0)
    for (const d of everyPath) {
      expect(d).not.toMatch(/#|rgb|currentColor/i)
    }
  })
})
