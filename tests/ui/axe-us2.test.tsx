import { describe, it, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'
import { load, save } from '../../src/storage/repository'
import { expectNoViolations } from './axe-helper'
import { MONTHLY, YEARLY, aCompletion, anItem, seed } from './seed'

/**
 * T058 — structural accessibility across the views US2 adds.
 *
 * Roles, accessible names, labelling and ARIA. Not contrast: jsdom resolves no
 * cascaded colour, so that assertion would pass whatever the palette. The
 * detail view is swept for contrast, layout, focus and axe against real
 * rendering in `e2e/` instead, which is why it was added to `APP_STATES` — a
 * view missing from that list is a view no browser-tier check covers.
 */
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0))
})
afterEach(() => vi.useRealTimers())

const withHistory = () =>
  anItem({
    name: 'Boiler service',
    interval: YEARLY,
    completions: [aCompletion('2024-05-06'), aCompletion('2025-05-11')],
  })

describe('accessibility', () => {
  it('the job detail view has no violations', async () => {
    seed([withHistory()])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { container } = render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Boiler service' }))
    await screen.findByRole('heading', { name: 'Boiler service', level: 2 })

    await expectNoViolations(container)
  })

  it('a job with no history has no violations', async () => {
    seed([anItem({ name: 'Boiler service', interval: YEARLY })])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { container } = render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Boiler service' }))
    await screen.findByRole('heading', { name: 'Boiler service', level: 2 })

    await expectNoViolations(container)
  })

  it('the detail view showing a validation error has no violations', async () => {
    seed([withHistory()])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { container } = render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Boiler service' }))
    await user.type(screen.getByLabelText('Add a date you did it'), '2027-01-01')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await screen.findByText(/in the future/i)

    await expectNoViolations(container)
  })

  it('the list showing an undo notice has no violations', async () => {
    seed([withHistory()])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { container } = render(<App />)

    await user.click(await screen.findByRole('button', { name: /mark done/i }))
    await screen.findByRole('button', { name: /undo/i })

    await expectNoViolations(container)
  })

  it('the list showing a refused undo has no violations', async () => {
    // The notice a refused press raises is a state no other sweep reaches, so
    // without this it would ship outside every accessibility check there is.
    // See `undo-other-context.test.tsx` for what the state is and why a direct
    // `save()` is a fair model of a second tab.
    //
    // What this cannot establish: whether VoiceOver actually interrupts and
    // reads the sentence when it appears, or whether it is legible against the
    // page. axe in jsdom sees the role attribute and nothing else — no
    // announcement, no layout, no resolved colour. Both belong to the real
    // device.
    seed([
      anItem({ id: 'itm_a', name: 'Boiler service', interval: YEARLY, completions: [aCompletion('2026-06-01')] }),
      anItem({ id: 'itm_b', name: 'Smoke alarms', interval: MONTHLY, completions: [aCompletion('2026-07-08')] }),
    ])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { container } = render(<App />)

    await user.click(
      await screen.findByRole('button', { name: /mark done.*Boiler service/i }),
    )
    const undo = await screen.findByRole('button', { name: /undo recording Boiler service/i })

    // Another context records something newer, which this app never hears
    // about, so the offer on screen no longer names the newest entry.
    vi.setSystemTime(new Date(Date.now() + 1_000))
    const current = load().document
    save({
      ...current,
      items: current.items.map((item) =>
        item.name === 'Smoke alarms'
          ? {
              ...item,
              completions: [
                ...item.completions,
                {
                  id: 'cmp_other',
                  completedOn: '2026-08-08',
                  recordedAt: new Date().toISOString(),
                },
              ],
            }
          : item,
      ),
    })

    await user.click(undo)
    await screen.findByRole('alert')

    await expectNoViolations(container)
  })
})
