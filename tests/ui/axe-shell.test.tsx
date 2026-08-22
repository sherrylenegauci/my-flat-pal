import { describe, it, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'
import { MAINTENANCE } from '../../src/ui/navigation'
import type { Area } from '../../src/ui/navigation'
import { expectNoViolations } from './axe-helper'
import { YEARLY, aCompletion, anItem, seed } from './seed'

/**
 * 005 — the tab bar's markup, scanned.
 *
 * **Why this file exists at all.** `axe-us1.test.tsx` and `axe-us2.test.tsx`
 * render `<App />` with no props, which means the real `AREAS` — one entry, and
 * FR-008 renders no bar. So every accessibility scan in this repository has run
 * over an app with no tab bar in it, and none of them would have noticed a bar
 * with unnamed controls or a misused ARIA attribute. Verification pointed that
 * out after the feature was otherwise complete; "we have axe tests" reads as
 * cover the new markup did not have.
 *
 * **What this can and cannot say.** Roles, accessible names, ARIA validity,
 * landmark structure — those are real and they are what a bottom bar most often
 * gets wrong. Not contrast, which jsdom cannot resolve; not whether the
 * indicator is visible; not what VoiceOver actually announces on arriving at a
 * tab, which is T022 on a real iPhone and is the check that discharges the
 * accessibility gate.
 *
 * The second area is a stand-in, as everywhere else in this feature: rooms is
 * not built, 003 builds it, and `AREAS` deliberately holds one entry until then.
 */
const ROOMS: Area = { id: 'rooms', label: 'Rooms', root: { name: 'schedule' } }
const TWO_AREAS = [MAINTENANCE, ROOMS] as const

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0))
})
afterEach(() => vi.useRealTimers())

describe('accessibility of the app shell', () => {
  it('the schedule list, with the bar on screen, has no violations', async () => {
    seed([
      anItem({ name: 'Boiler service', interval: YEARLY, completions: [aCompletion('2025-05-11')] }),
    ])
    const { container } = render(<App areas={TWO_AREAS} />)

    await screen.findByText('Boiler service')
    // Asserted rather than assumed: with one area there is no bar, and a scan of
    // an app without one would pass while checking nothing this file is about.
    await screen.findByRole('navigation', { name: 'Areas' })

    await expectNoViolations(container)
  })

  it('a job detail, with the bar on screen, has no violations', async () => {
    seed([
      anItem({ name: 'Boiler service', interval: YEARLY, completions: [aCompletion('2025-05-11')] }),
    ])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { container } = render(<App areas={TWO_AREAS} />)

    await user.click(await screen.findByRole('button', { name: 'Boiler service' }))
    await screen.findByRole('heading', { name: 'Boiler service', level: 2 })
    await screen.findByRole('navigation', { name: 'Areas' })

    await expectNoViolations(container)
  })

  it('has no violations after switching area', async () => {
    seed([
      anItem({ name: 'Boiler service', interval: YEARLY, completions: [aCompletion('2025-05-11')] }),
    ])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { container } = render(<App areas={TWO_AREAS} />)

    await user.click(await screen.findByRole('button', { name: 'Rooms' }))
    await screen.findByRole('heading', { name: 'Rooms' })

    await expectNoViolations(container)
  })
})
