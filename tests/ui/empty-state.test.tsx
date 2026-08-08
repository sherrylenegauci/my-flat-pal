import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { App } from '../../src/ui/App'

/**
 * T040 — FR-011, US1 scenario 1.
 *
 * The first thing anyone sees. It has to explain what the app is for and offer
 * a way in, because there is no onboarding, no tour, and nothing else on
 * screen.
 */
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0))
})
afterEach(() => vi.useRealTimers())

describe('the empty state', () => {
  it('explains what the app is for', async () => {
    render(<App />)

    const main = await screen.findByRole('main')
    expect(main.textContent).toMatch(/flat|upkeep|maintenance/i)
  })

  it('offers a way to add the first job', async () => {
    render(<App />)

    expect(await screen.findByRole('button', { name: /add/i })).toBeTruthy()
  })

  it('does not pretend there is a list', async () => {
    render(<App />)
    await screen.findByRole('main')

    // An empty list with a heading reads as "your jobs are gone", which matters
    // here: there is no backup, so a user who lost data must not be shown
    // something indistinguishable from a normal empty app... but equally, a
    // first run must not look alarming. No list at all is the honest middle.
    expect(screen.queryByRole('list')).toBeNull()
  })
})
