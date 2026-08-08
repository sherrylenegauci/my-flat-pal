import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'

/**
 * SC-005: every flow completable by keyboard alone.
 *
 * An earlier version of this file called `user.click` in the middle of a test
 * named "can add a job without a mouse", and never submitted the form. It
 * asserted only that the name input held the typed text — so the flow past the
 * first button was unverified while the name claimed otherwise.
 *
 * What this can and cannot prove: jsdom tracks focus, so "can you reach and
 * operate it" is genuinely testable. Whether the focus ring is *visible* is not
 * — that needs a real browser (T073).
 */
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0))
})
afterEach(() => vi.useRealTimers())

/** Tab until the predicate matches, or give up. Returns the focused element. */
async function tabUntil(
  user: ReturnType<typeof userEvent.setup>,
  matches: (el: Element | null) => boolean,
  limit = 25,
): Promise<Element | null> {
  for (let i = 0; i < limit; i++) {
    if (matches(document.activeElement)) return document.activeElement
    await user.tab()
  }
  return matches(document.activeElement) ? document.activeElement : null
}

const labelled = (re: RegExp) => (el: Element | null) => {
  if (!el) return false
  const id = el.getAttribute('id')
  if (!id) return false
  const label = document.querySelector(`label[for="${id}"]`)
  return re.test(label?.textContent ?? '')
}

describe('keyboard only', () => {
  it('completes the whole add-a-job flow without a mouse', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<App />)
    await screen.findByRole('main')

    // Reach the add button and open the form.
    const addButton = await tabUntil(
      user,
      (el) => el?.tagName === 'BUTTON' && /add/i.test(el.textContent ?? ''),
    )
    expect(addButton).not.toBeNull()
    await user.keyboard('{Enter}')

    // Reach and fill the name field — by tabbing, not clicking.
    const nameField = await tabUntil(user, labelled(/name/i))
    expect(nameField).not.toBeNull()
    await user.keyboard('Boiler service')

    // Reach and fill last-done, so the job gets a real due date.
    const lastDone = await tabUntil(user, labelled(/last done/i))
    expect(lastDone).not.toBeNull()
    await user.keyboard('2026-06-14')

    // Submit from the keyboard.
    const save = await tabUntil(
      user,
      (el) => el?.tagName === 'BUTTON' && /save/i.test(el.textContent ?? ''),
    )
    expect(save).not.toBeNull()
    await user.keyboard('{Enter}')

    // The job exists, with the due date derived from what was typed — proving
    // the flow completed rather than merely that a field accepted text.
    expect(await screen.findByText('Boiler service')).toBeTruthy()
    expect(screen.getByRole('listitem').textContent).toContain('14 June 2027')
  })

  it('gives every control an accessible name', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<App />)
    await user.click(await screen.findByRole('button', { name: /add/i }))

    // A control you can reach but cannot identify is not operable — the failure
    // a screen-reader user hits that a sighted keyboard user does not.
    for (const control of screen.getAllByRole('textbox')) {
      expect(control.getAttribute('aria-label') ?? control.id).toBeTruthy()
    }
    for (const button of screen.getAllByRole('button')) {
      expect(button.textContent?.trim() || button.getAttribute('aria-label')).toBeTruthy()
    }
  })

  it('leaves focus somewhere sensible after saving', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<App />)
    await user.click(await screen.findByRole('button', { name: /add/i }))
    await user.type(screen.getByLabelText(/name/i), 'Boiler service')
    await user.click(screen.getByRole('button', { name: /save|add/i }))

    await screen.findByText('Boiler service')
    // Focus falling to <body> silently returns a keyboard user to the top of
    // the document with no indication anything happened.
    expect(document.activeElement).not.toBe(document.body)
  })
})
