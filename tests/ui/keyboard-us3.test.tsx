import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'
import { load } from '../../src/storage/repository'
import { MONTHLY, aCompletion, anItem, seed } from './seed'
import { named, tabUntil } from './keyboard'

/**
 * T066 — SC-005 for the two flows US3 adds: correcting a job and deleting one.
 *
 * Every control is *reached by tabbing*, and every traversal is asserted to have
 * arrived. A test that clicks its way to a button and then presses Enter shows
 * nothing about keyboard operation — a US1 test once did exactly that under a
 * name claiming otherwise — and a traversal that quietly failed would leave the
 * assertions below passing on whatever the focus happened to be resting on.
 *
 * **This is supporting evidence, not the accessibility gate.** SC-005 was
 * rewritten in the 2026-08-11 clarification session and constitution v1.4.0 to
 * point at VoiceOver on a real iPhone — swiping and double-tapping, which is how
 * someone who cannot use touch actually drives a phone. Desktop Tab order was a
 * poor proxy for that, and it is not what this file should be read as proving.
 * What it does prove is WCAG 2.1.1 at Level A: every control can be reached and
 * worked from the keyboard.
 *
 * **One gap that lives here.** The interval's Period dropdown cannot be
 * exercised in this tier. jsdom implements no keyboard behaviour for `<select>`
 * — neither arrow keys nor first-letter typeahead change the selection, which
 * was verified rather than assumed — so changing a job from months to years by
 * keyboard alone can only be checked in a real browser or on the device. The
 * count field, tested below, is a plain number input and is fully reachable.
 */
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0))
})
afterEach(() => vi.useRealTimers())

const boiler = () =>
  anItem({
    id: 'itm_boiler',
    name: 'Boiler service',
    interval: MONTHLY,
    completions: [aCompletion('2026-06-01')],
  })

const stored = () => load().document.items[0]

/** Open the job and then its edit form, arriving by Tab and Enter throughout. */
async function tabIntoTheEditForm(user: ReturnType<typeof userEvent.setup>) {
  expect(await tabUntil(user, named(/^Boiler service$/))).not.toBeNull()
  await user.keyboard('{Enter}')
  await screen.findByRole('heading', { name: 'Boiler service', level: 2 })

  expect(await tabUntil(user, named(/^Edit job$/))).not.toBeNull()
  await user.keyboard('{Enter}')
  await screen.findByRole('heading', { name: 'Edit job', level: 2 })
}

async function tabIntoTheDeleteConfirmation(user: ReturnType<typeof userEvent.setup>) {
  expect(await tabUntil(user, named(/^Boiler service$/))).not.toBeNull()
  await user.keyboard('{Enter}')
  await screen.findByRole('heading', { name: 'Boiler service', level: 2 })

  expect(await tabUntil(user, named(/^Delete job$/))).not.toBeNull()
  await user.keyboard('{Enter}')
  return screen.findByRole('dialog')
}

describe('keyboard only', () => {
  it('renames a job', async () => {
    seed([boiler()])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<App />)
    await screen.findByText('Boiler service')

    await tabIntoTheEditForm(user)

    // Tabbing into a text field selects what is in it, so typing replaces the
    // old name — the same thing that happens in a browser.
    expect(await tabUntil(user, (el) => el === screen.getByLabelText(/name/i))).not.toBeNull()
    await user.keyboard('Boiler service and flue check')

    expect(await tabUntil(user, named(/^Save changes$/))).not.toBeNull()
    await user.keyboard('{Enter}')

    expect(stored()?.name).toBe('Boiler service and flue check')
  })

  it('changes how often a job comes round', async () => {
    seed([boiler()])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<App />)
    await screen.findByText('Boiler service')

    await tabIntoTheEditForm(user)

    expect(await tabUntil(user, (el) => el === screen.getByLabelText(/how often/i))).not.toBeNull()
    await user.keyboard('6')

    expect(await tabUntil(user, named(/^Save changes$/))).not.toBeNull()
    await user.keyboard('{Enter}')

    expect(stored()?.interval).toEqual({ count: 6, unit: 'month' })
    // And the schedule moved with it, which is the part the user reads.
    expect(await screen.findByText('Next due 1 December 2026')).toBeTruthy()
  })

  it('deletes a job, confirmation and all', async () => {
    seed([boiler()])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<App />)
    await screen.findByText('Boiler service')

    await tabIntoTheDeleteConfirmation(user)

    expect(await tabUntil(user, named(/^Delete permanently$/))).not.toBeNull()
    await user.keyboard('{Enter}')

    expect(load().document.items).toEqual([])
  })

  it('backs out of the confirmation with Escape, and the job survives', async () => {
    seed([boiler()])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<App />)
    await screen.findByText('Boiler service')

    await tabIntoTheDeleteConfirmation(user)
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(stored()?.name).toBe('Boiler service')
  })

  it('backs out of the confirmation with Cancel, and the job survives', async () => {
    seed([boiler()])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<App />)
    await screen.findByText('Boiler service')

    await tabIntoTheDeleteConfirmation(user)

    expect(await tabUntil(user, named(/^Cancel$/))).not.toBeNull()
    await user.keyboard('{Enter}')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(stored()?.name).toBe('Boiler service')
  })

  it('leaves focus somewhere usable after the job is deleted', async () => {
    // The dialog and the view that opened it both go, so unless the app places
    // focus it falls to <body> — which drops a keyboard or VoiceOver user at the
    // top of the document with nothing to say why. Where it *should* land is
    // pinned in confirm-dialog.test.tsx, where the opener survives the close.
    seed([boiler()])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<App />)
    await screen.findByText('Boiler service')

    await tabIntoTheDeleteConfirmation(user)

    expect(await tabUntil(user, named(/^Delete permanently$/))).not.toBeNull()
    await user.keyboard('{Enter}')
    await screen.findByText('Nothing recorded yet')

    expect(document.activeElement).not.toBe(document.body)
  })
})
