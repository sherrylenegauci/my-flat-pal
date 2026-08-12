import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'
import { load } from '../../src/storage/repository'
import { YEARLY, aCompletion, anItem, seed } from './seed'
import { named, tabUntil } from './keyboard'

/**
 * T057 — SC-005 says *every* flow works by keyboard alone. US2 adds three:
 * marking done, undoing, and reading a job's history.
 *
 * Reached by tabbing rather than by clicking. A test that clicks its way to a
 * control and then presses Enter proves nothing about keyboard operation — an
 * earlier US1 test did exactly that and its name claimed otherwise.
 *
 * jsdom tracks focus, so "can you reach it and work it" is genuinely testable
 * here. Whether the focus ring is *visible* is not — that needs computed style
 * and real paint, and lives in `e2e/focus-visibility.spec.ts`.
 */
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0))
})
afterEach(() => vi.useRealTimers())

// `tabUntil` and `named` moved to ./keyboard when US3's keyboard file became
// their second caller.

const stored = () => load().document.items[0]

describe('keyboard only', () => {
  it('marks a job done', async () => {
    seed([anItem({ name: 'Boiler service', interval: YEARLY, completions: [aCompletion('2026-06-01')] })])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<App />)
    await screen.findByText('Boiler service')

    expect(await tabUntil(user, named(/mark done/i))).not.toBeNull()
    await user.keyboard('{Enter}')

    expect(stored()?.completions).toHaveLength(2)
  })

  it('undoes a completion', async () => {
    seed([anItem({ name: 'Boiler service', interval: YEARLY, completions: [aCompletion('2026-06-01')] })])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<App />)
    await screen.findByText('Boiler service')

    await tabUntil(user, named(/mark done/i))
    await user.keyboard('{Enter}')

    expect(await tabUntil(user, named(/^undo/i))).not.toBeNull()
    await user.keyboard('{Enter}')

    expect(stored()?.completions.map((c) => c.id)).toEqual(['cmp_2026-06-01'])
  })

  it('leaves focus somewhere usable after undoing', async () => {
    // The undo control removes itself, so focus falls to <body> unless the app
    // places it — which silently returns a keyboard user to the top of the
    // document with no indication anything happened.
    seed([anItem({ name: 'Boiler service', interval: YEARLY })])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<App />)
    await screen.findByText('Boiler service')

    // Asserted rather than assumed: with neither control present, tabbing ends
    // on some other button and the focus assertion below passes without either
    // step having happened. A check that cannot fail is worse than none.
    expect(await tabUntil(user, named(/mark done/i))).not.toBeNull()
    await user.keyboard('{Enter}')
    expect(await tabUntil(user, named(/^undo/i))).not.toBeNull()
    await user.keyboard('{Enter}')

    expect(document.activeElement).not.toBe(document.body)
  })

  it('opens a job’s history and gets back out again', async () => {
    seed([anItem({ name: 'Boiler service', interval: YEARLY, completions: [aCompletion('2026-06-01')] })])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<App />)
    await screen.findByText('Boiler service')

    expect(await tabUntil(user, named(/^Boiler service$/))).not.toBeNull()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('heading', { name: 'Boiler service', level: 2 })).toBeTruthy()

    // And back out, without a mouse and without the browser's back button,
    // which an installed app does not have.
    expect(await tabUntil(user, named(/back/i))).not.toBeNull()
    await user.keyboard('{Enter}')

    expect(await screen.findByRole('listitem')).toBeTruthy()
  })

  it('records a backdated completion', async () => {
    seed([anItem({ name: 'Boiler service', interval: YEARLY })])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<App />)
    await screen.findByText('Boiler service')

    await tabUntil(user, named(/^Boiler service$/))
    await user.keyboard('{Enter}')
    await screen.findByRole('heading', { name: 'Boiler service', level: 2 })

    const dateField = await tabUntil(user, (el) => el === screen.getByLabelText(/date it was done/i))
    expect(dateField).not.toBeNull()
    await user.keyboard('2025-08-08')

    expect(await tabUntil(user, named(/record it/i))).not.toBeNull()
    await user.keyboard('{Enter}')

    expect(stored()?.completions[0]?.completedOn).toBe('2025-08-08')
  })
})
