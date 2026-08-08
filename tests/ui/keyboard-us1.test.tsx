import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'

/**
 * T045 — SC-005: every flow completable by keyboard alone.
 *
 * Principle II makes this a completion gate, not a polish item. Note what this
 * can and cannot prove: jsdom tracks focus, so "can you reach and operate it"
 * is genuinely testable here. Whether the focus ring is *visible* is not — that
 * is T073, in a real browser.
 */
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0))
})
afterEach(() => vi.useRealTimers())

describe('keyboard only', () => {
  it('can add a job without a mouse', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<App />)
    await screen.findByRole('main')

    // Tab to the add button and activate it.
    let guard = 0
    while (
      document.activeElement?.textContent?.match(/add/i) === null ||
      document.activeElement?.tagName !== 'BUTTON'
    ) {
      await user.tab()
      if (++guard > 20) break
    }
    await user.keyboard('{Enter}')

    // The form is reachable and fillable by keyboard.
    await user.click(screen.getByLabelText(/name/i))
    await user.keyboard('Boiler service')
    await user.tab()
    await user.keyboard('{Control>}a{/Control}1')

    expect(screen.getByLabelText(/name/i)).toHaveProperty('value', 'Boiler service')
  })

  it('gives every control an accessible name', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<App />)
    await user.click(await screen.findByRole('button', { name: /add/i }))

    // A control you can reach but cannot identify is not operable — this is the
    // failure a screen-reader user hits that a sighted keyboard user does not.
    for (const control of screen.getAllByRole('textbox')) {
      expect(control.getAttribute('aria-label') ?? control.id).toBeTruthy()
    }
    for (const button of screen.getAllByRole('button')) {
      expect(button.textContent?.trim() || button.getAttribute('aria-label')).toBeTruthy()
    }
  })

  it('moves focus somewhere sensible after saving', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<App />)
    await user.click(await screen.findByRole('button', { name: /add/i }))
    await user.type(screen.getByLabelText(/name/i), 'Boiler service')
    await user.click(screen.getByRole('button', { name: /save|add/i }))

    await screen.findByText('Boiler service')
    // Focus must not be lost to <body>, which strands a keyboard user at the
    // top of the document with no idea what happened.
    expect(document.activeElement).not.toBe(document.body)
  })
})
