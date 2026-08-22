import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'
import { MAINTENANCE } from '../../src/ui/navigation'
import type { Area } from '../../src/ui/navigation'
import { YEARLY, aCompletion, anItem, seed } from './seed'

/**
 * T007 — US1, FR-001 and FR-002: the areas are visible from every screen, and
 * one tap moves between them.
 *
 * ## The second area here is a stand-in, and the app does not have rooms
 *
 * `AREAS` holds one entry today. Rooms is feature 003 and does not exist — no
 * screens, no data, nothing. `ROOMS` below is a fixture passed in through
 * `App`'s `areas` prop purely so this file can exercise a bar that has
 * something to switch between; 003 replaces it with the real one. Nobody should
 * read this file as evidence that the app has a rooms area. What it says is
 * that *when* a second area exists, the structure around it behaves.
 *
 * The one-area case is the app as it actually ships, and it is
 * `tab-bar-hidden.test.tsx`.
 *
 * ## Rendered under StrictMode, like production
 *
 * `main.tsx` renders the app inside `<StrictMode>`, and switching areas is a
 * state change. A test that renders it any other way is testing a different
 * app: 001 shipped a bug that duplicated every job past 136 passing tests for
 * exactly that reason.
 *
 * ## What this file cannot tell you
 *
 * Whether the bar is *visible* in any sense a person would recognise. jsdom
 * lays nothing out — every element it reports measures 0x0 — so it cannot say
 * whether the bar is on screen, whether it covers the content it sits beneath,
 * whether a tab clears 44x44, or whether it clears the home indicator on a
 * notched phone. Those are FR-009 and SC-004, and they belong to `e2e/` and to
 * the device checklist in plan.md. "Visible" here means "present in the
 * accessibility tree with a name", which is a different and weaker claim.
 */
const ROOMS: Area = { id: 'rooms', label: 'Rooms', root: { name: 'schedule' } }

const AREAS_UNDER_TEST: readonly Area[] = [MAINTENANCE, ROOMS]

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0)) // Saturday 8 August 2026, local
})
afterEach(() => vi.useRealTimers())

/** One overdue job, so the list has a row to open and something to still be showing. */
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

/** The structure itself, by its landmark role and its name. */
const theBar = () => screen.getByRole('navigation', { name: /areas/i })

const tab = (label: string) => within(theBar()).getByRole('button', { name: label })

describe('the areas are reachable from every screen (FR-001)', () => {
  it('names every area, and adds nothing else to press', async () => {
    launch()
    await screen.findByText('Boiler service')

    // Looked up by accessible name rather than by reading text out of the
    // markup: the name is what a screen reader announces, and it is the only
    // part of a control this suite is allowed to depend on. The labels come
    // from the areas themselves so that renaming one does not need editing
    // here as well.
    for (const area of AREAS_UNDER_TEST) {
      expect(within(theBar()).getByRole('button', { name: area.label })).toBeTruthy()
    }

    expect(within(theBar()).getAllByRole('button')).toHaveLength(AREAS_UNDER_TEST.length)
  })

  it('is there on the schedule list', async () => {
    launch()
    await screen.findByText('Boiler service')

    expect(tab('Maintenance')).toBeTruthy()
    expect(tab('Rooms')).toBeTruthy()
  })

  it('is still there inside a job', async () => {
    // FR-001 says "visible from every screen", and a bar that only exists on
    // the list is a bar a user loses the moment they go anywhere.
    const user = launch()
    await user.click(await screen.findByRole('button', { name: 'Boiler service' }))
    await screen.findByRole('heading', { name: 'Boiler service', level: 2 })

    expect(tab('Rooms')).toBeTruthy()
  })

  it('is still there in the add-a-job form', async () => {
    const user = launch()
    await user.click(await screen.findByRole('button', { name: 'Add job' }))
    await screen.findByRole('heading', { name: 'Add a job', level: 2 })

    expect(tab('Rooms')).toBeTruthy()
  })
})

describe('moving between areas (FR-002)', () => {
  it('reaches another area in a single action', async () => {
    const user = launch()
    await screen.findByText('Boiler service')

    await user.click(tab('Rooms'))

    // Rooms has no screens, so what it opens at is a heading carrying its name.
    // That is enough to say the switch happened; what rooms *shows* is 003.
    expect(await screen.findByRole('heading', { name: 'Rooms' })).toBeTruthy()
    expect(screen.queryByText('Boiler service')).toBeNull()
  })

  it('gets back the same way, also in a single action', async () => {
    const user = launch()
    await screen.findByText('Boiler service')
    await user.click(tab('Rooms'))
    await screen.findByRole('heading', { name: 'Rooms' })

    await user.click(tab('Maintenance'))

    expect(await screen.findByText('Boiler service')).toBeTruthy()
  })

  it('reaches another area from several screens deep, still in one action', async () => {
    // US1's independent test: "from anywhere in one area, reach another area in
    // one tap". Deep inside maintenance is where a single stack would have
    // needed a back press first.
    const user = launch()
    await user.click(await screen.findByRole('button', { name: 'Boiler service' }))
    await user.click(await screen.findByRole('button', { name: 'Edit job' }))
    await screen.findByRole('heading', { name: 'Edit job', level: 2 })

    await user.click(tab('Rooms'))

    expect(await screen.findByRole('heading', { name: 'Rooms' })).toBeTruthy()
  })
})

describe('tapping the area you are already in (US1/AC4)', () => {
  it('leaves the list exactly where it was', async () => {
    const user = launch()
    await screen.findByText('Boiler service')

    await user.click(tab('Maintenance'))

    expect(screen.getByText('Boiler service')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '1 needing attention' })).toBeTruthy()
  })

  it('raises nothing at the user', async () => {
    // "Nothing jarring" includes not being told anything. An alert appearing
    // because a no-op switch was treated as an event would be exactly that.
    const user = launch()
    await screen.findByText('Boiler service')

    await user.click(tab('Maintenance'))

    expect(screen.queryAllByRole('alert')).toEqual([])
  })

  it('does not tear the screen down and build it again', async () => {
    /**
     * The closest jsdom gets to "no reload, no flicker".
     *
     * It cannot see a flicker — it paints nothing. What it can see is whether
     * the heading a user is looking at is the *same element* afterwards, and
     * that is not a detail: a remount is what loses focus, loses scroll
     * position, and empties a half-filled field. If the node survives, none of
     * those can have happened. If it is replaced, at least one of them did.
     *
     * Whether the user perceives a flash on a real device is on the manual
     * checklist, because no automated tier can answer it.
     */
    const user = launch()
    const before = await screen.findByRole('heading', { name: '1 needing attention' })

    await user.click(tab('Maintenance'))

    expect(screen.getByRole('heading', { name: '1 needing attention' })).toBe(before)
  })
})
