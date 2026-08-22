import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'
import { MAINTENANCE } from '../../src/ui/navigation'
import type { Area } from '../../src/ui/navigation'
import { load } from '../../src/storage/repository'
import { MONTHLY, YEARLY, aCompletion, anItem, seed } from './seed'

/**
 * T009 — FR-010: this feature adds a frame and changes nothing inside it.
 *
 * That is an easy sentence to write and it is the sentence most likely to stop
 * being true. Maintenance is the only thing in the app; the shell wraps its
 * every screen, shares its focus management, and re-renders around it on every
 * switch. So the claim gets a check rather than an assurance.
 *
 * ## The same three jobs, run twice: without the frame and with it
 *
 * Both cases matter and they are not the same case. With one area there is no
 * bar (FR-008), which is the app as it ships today — that half is a plain
 * regression guard and it should already be green. With two areas the bar is
 * there, wrapped around the same screens, and that is the half where the frame
 * can break what it frames.
 *
 * **The two-area half asserts the bar is present before it asserts anything
 * else**, and that guard is load-bearing rather than decorative: without it,
 * "maintenance still works with the shell around it" would be running the
 * one-area suite a second time under a different name and reporting a pass for
 * a shell that was never rendered. Same reasoning as
 * `e2e/rendering/colour-independence.spec.ts`, which proves the colour it
 * stripped was actually stripped before believing anything that survived.
 *
 * `ROOMS` is a stand-in. The app has no rooms area — that is 003 — and this
 * fixture exists only to make the bar appear.
 *
 * ## StrictMode, and the stored document as well as the screen
 *
 * `main.tsx` renders inside `<StrictMode>`, where React deliberately invokes
 * state updaters twice. 001 shipped a bug that duplicated every job the user
 * added: the screen showed one, storage held two, and 136 tests missed it
 * because none rendered under StrictMode and none read storage back. Adding an
 * area switch is a new reason for the app to re-render around the same writes,
 * so both are asserted here. With no export path, what is stored is the part
 * that has no second copy.
 *
 * ## What this file cannot tell you
 *
 * Nothing about space. FR-010 is about behaviour; the bar's real cost is the
 * strip of screen it takes from the list, and jsdom lays nothing out. Whether
 * the first overdue job is still above the fold is T019, in a browser.
 */
const ROOMS: Area = { id: 'rooms', label: 'Rooms', root: { name: 'schedule' } }

interface Frame {
  readonly name: string
  readonly areas: readonly Area[] | undefined
  /** Whether the tab bar should be on screen — i.e. whether a frame exists at all. */
  readonly framed: boolean
}

const FRAMES: Frame[] = [
  { name: 'as the app ships today, with one area and no bar', areas: undefined, framed: false },
  { name: 'with the tab bar around it', areas: [MAINTENANCE, ROOMS], framed: true },
]

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0)) // Saturday 8 August 2026, local
})
afterEach(() => vi.useRealTimers())

const storedItems = () => load().document.items

describe.each(FRAMES)('maintenance, $name', (frame) => {
  function launch() {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <StrictMode>{frame.areas ? <App areas={frame.areas} /> : <App />}</StrictMode>,
    )

    if (frame.framed) {
      // Non-vacuity. If the bar is not here, this block is the unframed suite
      // wearing a different name, and a pass would say nothing about whether
      // the frame left maintenance alone.
      expect(
        screen.getByRole('navigation', { name: /areas/i }),
        'the tab bar is not on screen, so this block is not testing maintenance inside a frame',
      ).toBeTruthy()
    }

    return user
  }

  it('adds one job, and stores one job', async () => {
    const user = launch()

    await user.click(await screen.findByRole('button', { name: /add/i }))
    await user.type(screen.getByLabelText(/name/i), 'Bleed the radiators')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(await screen.findByText('Bleed the radiators')).toBeTruthy()
    expect(storedItems().map((item) => item.name)).toEqual(['Bleed the radiators'])
    // A second write would show up here as 2 even when the screen looks right.
    expect(load().document.revision).toBe(1)
  })

  it('records one completion when a job is marked done', async () => {
    seed([anItem({ name: 'Smoke alarms', interval: MONTHLY })])
    const user = launch()
    await screen.findByText('Smoke alarms')

    await user.click(screen.getByRole('button', { name: /mark done/i }))

    expect(await screen.findByText('Nothing due right now')).toBeTruthy()
    expect(storedItems()[0]?.completions.map((c) => c.completedOn)).toEqual(['2026-08-08'])
  })

  it('edits a job without disturbing what it has recorded', async () => {
    seed([
      anItem({
        name: 'Boiler service',
        interval: YEARLY,
        completions: [aCompletion('2025-06-01')],
      }),
    ])
    const user = launch()

    await user.click(await screen.findByRole('button', { name: 'Boiler service' }))
    await user.click(await screen.findByRole('button', { name: 'Edit job' }))
    await screen.findByRole('heading', { name: 'Edit job', level: 2 })

    const name = screen.getByLabelText(/name/i)
    await user.clear(name)
    await user.type(name, 'Boiler service and flue check')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(await screen.findByText('Boiler service and flue check')).toBeTruthy()

    const stored = storedItems()
    expect(stored).toHaveLength(1)
    expect(stored[0]?.name).toBe('Boiler service and flue check')
    // The history is the part with no way back if a save path rebuilds an item
    // instead of amending it.
    expect(stored[0]?.completions.map((c) => c.completedOn)).toEqual(['2025-06-01'])
  })
})
