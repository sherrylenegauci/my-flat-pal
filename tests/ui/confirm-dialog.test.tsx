import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from '../../src/ui/components/ConfirmDialog'
import { expectNoViolations } from './axe-helper'

/**
 * T065 — the confirmation dialog, on its own.
 *
 * Tested through a harness rather than through the app because the dialog is
 * general by design: T103 reuses it to remove a single completion from a job's
 * history, so nothing about deleting a *job* may be baked into it. The harness
 * gives it a question, a consequence and a confirm label, exactly as any caller
 * will, and shows what came back out.
 *
 * **The harness also keeps the opener mounted**, which is what makes focus
 * return testable here at all. In the app, confirming a deletion takes the view
 * — and the button that opened the dialog — off the screen, so `delete.test.tsx`
 * can only assert that focus did not fall to `<body>`. Here the button is still
 * there afterwards, so "focus goes back where it came from" can be pinned
 * exactly, on cancel, on Escape and on confirm alike. A dialog that closes and
 * drops focus returns a keyboard or VoiceOver user to the top of the document
 * with nothing to tell them it happened.
 *
 * **What this file does not establish.** That a VoiceOver user is *told* a
 * dialog has opened. `role="dialog"` and `aria-modal` are attributes in a DOM
 * that no assistive technology is attached to; whether VoiceOver interrupts,
 * reads the question, and confines the rotor to the dialog is a platform
 * behaviour, and constitution v1.4.0 makes VoiceOver on a real iPhone the check
 * that discharges the accessibility gate. Treat this file as evidence about
 * structure and focus, and nothing more. Contrast is likewise out of reach —
 * `axe-helper.ts` disables the contrast rules because jsdom resolves no
 * cascaded colour, so an assertion about them would pass whatever the palette.
 */
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0))
})
afterEach(() => vi.useRealTimers())

const QUESTION = 'Delete “Boiler service”?'
const CONSEQUENCE =
  'Its history goes too: 3 completions recorded. ' +
  'This app has no backup and no export, so nothing here can be got back.'

interface Asked {
  question: string
  consequence: string
  confirmLabel: string
  cancelLabel?: string
}

/**
 * A page with something to open the dialog, something else to focus, and a
 * running commentary on what the dialog reported back. The outcome is on screen
 * rather than counted in a spy: what the caller was told is observable
 * behaviour, how many times a function ran is not.
 */
function Harness(asked: Asked) {
  const [open, setOpen] = useState(false)
  const [outcome, setOutcome] = useState('nothing yet')

  return (
    <div>
      <h1>A page</h1>
      <button type="button" onClick={() => setOpen(true)}>
        Delete job
      </button>
      <button type="button">Something else on the page</button>
      <p>Outcome: {outcome}</p>
      {open && (
        <ConfirmDialog
          {...asked}
          onConfirm={() => {
            setOutcome('confirmed')
            setOpen(false)
          }}
          onCancel={() => {
            setOutcome('cancelled')
            setOpen(false)
          }}
        />
      )}
    </div>
  )
}

const DEFAULTS: Asked = {
  question: QUESTION,
  consequence: CONSEQUENCE,
  confirmLabel: 'Delete permanently',
}

async function openIt(asked: Asked = DEFAULTS) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const view = render(<Harness {...asked} />)

  const opener = screen.getByRole('button', { name: 'Delete job' })
  await user.click(opener)

  return { user, opener, dialog: screen.getByRole('dialog'), ...view }
}

/** Tab until `target` has focus, or give up. Returns whether it was reached. */
async function tabTo(
  user: ReturnType<typeof userEvent.setup>,
  target: Element | undefined,
  limit = 12,
): Promise<boolean> {
  for (let i = 0; i < limit; i++) {
    if (document.activeElement === target) return true
    await user.tab()
  }
  return document.activeElement === target
}

const outcome = () => screen.getByText(/^Outcome:/).textContent

describe('the confirmation dialog', () => {
  it('is named by the question and described by the consequence', async () => {
    await openIt()

    expect(screen.getByRole('dialog', { name: QUESTION, description: CONSEQUENCE })).toBeTruthy()
  })

  it('offers the caller’s confirm label and a Cancel by default', async () => {
    const { dialog } = await openIt()

    expect(within(dialog).getByRole('button', { name: 'Delete permanently' })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeTruthy()
  })

  it('asks whatever it is given, with nothing about jobs baked in', async () => {
    // T103 reuses this dialog to remove one completion from a job's history. If
    // any of this wording came from the component, that task would have to build
    // a second dialog.
    const { dialog } = await openIt({
      question: 'Remove the entry for 11 May 2025?',
      consequence: 'The schedule will be worked out again without it. It cannot be got back.',
      confirmLabel: 'Remove it',
      cancelLabel: 'Keep it',
    })

    expect(
      screen.getByRole('dialog', {
        name: 'Remove the entry for 11 May 2025?',
        description: 'The schedule will be worked out again without it. It cannot be got back.',
      }),
    ).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Remove it' })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Keep it' })).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: 'Cancel' })).toBeNull()
  })

  it('takes focus when it opens', async () => {
    // Otherwise focus stays on the page behind, and a keyboard user has to
    // discover a dialog they were never sent to.
    const { dialog } = await openIt()

    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('keeps Tab inside itself', async () => {
    const { user, dialog, opener } = await openIt()

    for (let i = 0; i < 8; i++) {
      await user.tab()
      expect(dialog.contains(document.activeElement)).toBe(true)
      expect(document.activeElement).not.toBe(opener)
    }
  })

  it('wraps from its last control round to its first', async () => {
    const { user, dialog } = await openIt()
    const controls = within(dialog).getAllByRole('button')

    expect(await tabTo(user, controls[controls.length - 1])).toBe(true)
    await user.tab()

    expect(document.activeElement).toBe(controls[0])
  })

  it('wraps backwards from its first control to its last', async () => {
    const { user, dialog } = await openIt()
    const controls = within(dialog).getAllByRole('button')

    expect(await tabTo(user, controls[0])).toBe(true)
    await user.tab({ shift: true })

    expect(document.activeElement).toBe(controls[controls.length - 1])
  })

  it('closes on Escape, having confirmed nothing', async () => {
    const { user } = await openIt()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(outcome()).toBe('Outcome: cancelled')
  })

  it('reports a confirmation to the caller', async () => {
    const { user, dialog } = await openIt()

    await user.click(within(dialog).getByRole('button', { name: 'Delete permanently' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(outcome()).toBe('Outcome: confirmed')
  })

  it('returns focus to the control that opened it, when cancelled', async () => {
    const { user, dialog, opener } = await openIt()

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(document.activeElement).toBe(opener)
  })

  it('returns focus to the control that opened it, when dismissed with Escape', async () => {
    const { user, opener } = await openIt()

    await user.keyboard('{Escape}')

    expect(document.activeElement).toBe(opener)
  })

  it('returns focus to the control that opened it, when confirmed', async () => {
    // Including here. Landing on <body> after a confirmed deletion is the case
    // the app itself cannot pin, so it is pinned where the opener survives.
    const { user, dialog, opener } = await openIt()

    await user.click(within(dialog).getByRole('button', { name: 'Delete permanently' }))

    expect(document.activeElement).toBe(opener)
  })

  it('passes an axe scan', async () => {
    // Scanned from the dialog element rather than the render container, so a
    // dialog rendered through a portal is still the thing being checked. A scan
    // that quietly walked a subtree the dialog had left would report a pass for
    // an element it never looked at.
    const { dialog } = await openIt()

    await expectNoViolations(dialog)
  })
})
