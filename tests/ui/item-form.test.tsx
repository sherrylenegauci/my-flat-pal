import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'
import { MONTHLY, aCompletion, anItem, seed } from './seed'

/**
 * T041 — adding a job. US1 scenarios 2 and 4, FR-001, FR-002, FR-004a.
 */
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0))
})
afterEach(() => vi.useRealTimers())

async function openTheForm(user: ReturnType<typeof userEvent.setup>) {
  render(<App />)
  await user.click(await screen.findByRole('button', { name: /add/i }))
}

async function fillIn(
  user: ReturnType<typeof userEvent.setup>,
  fields: { name: string; count?: string; unit?: string; lastDone?: string },
) {
  await user.clear(screen.getByLabelText(/name/i))
  await user.type(screen.getByLabelText(/name/i), fields.name)

  if (fields.count !== undefined) {
    // The interval count box, by its visible label "Every" (T115). Not
    // `/how often/i`: the legend is borrowed back through `aria-labelledby`, so
    // that regex matches this input under both wordings and can never go red.
    await user.clear(screen.getByLabelText(/^every$/i))
    await user.type(screen.getByLabelText(/^every$/i), fields.count)
  }
  if (fields.unit !== undefined) {
    await user.selectOptions(screen.getByLabelText(/period|unit/i), fields.unit)
  }
  if (fields.lastDone !== undefined) {
    await user.type(screen.getByLabelText(/last done/i), fields.lastDone)
  }
}

describe('adding a job', () => {
  it('saves it and shows when it is next due', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await openTheForm(user)

    await fillIn(user, { name: 'Boiler service', count: '1', unit: 'year', lastDone: '2026-06-14' })
    await user.click(screen.getByRole('button', { name: /save|add/i }))

    expect(await screen.findByText('Boiler service')).toBeTruthy()
    // Counted from when it was actually done: 14 June 2026 + 1 year.
    //
    // Scoped to the row, as the interval test below already is. Unscoped, this
    // now matches twice: US2's undo notice also names the resulting due date, so
    // the query became ambiguous while the behaviour it checks — the list shows
    // when the job is next due — did not change.
    expect(screen.getByRole('listitem').textContent).toMatch(/14 June 2027|2027-06-14/)
  })

  it('accepts every interval unit, and each one changes the due date', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    // Last done 1 Aug 2026, interval of 2 — one distinct due date per unit.
    const expectedDue: Record<string, string> = {
      day: '3 August 2026',
      week: '15 August 2026',
      month: '1 October 2026',
      year: '1 August 2028',
    }

    for (const unit of ['day', 'week', 'month', 'year']) {
      localStorage.clear()
      const { unmount } = render(<App />)
      await user.click(await screen.findByRole('button', { name: /add/i }))

      await fillIn(user, { name: `Every ${unit}`, count: '2', unit, lastDone: '2026-08-01' })
      await user.click(screen.getByRole('button', { name: /save|add/i }))

      await screen.findByText(`Every ${unit}`)
      // Assert the interval actually round-tripped. Checking only that the name
      // appeared would pass even if the unit were discarded and everything
      // treated as annual.
      expect(screen.getByRole('listitem').textContent).toContain(expectedDue[unit])
      unmount()
    }
  })

  it('holds a job with no last-done date as never done, with no invented date', async () => {
    // FR-004a. The most common case when you move in: you know the boiler needs
    // servicing, you have no idea when it last was. The app must not guess.
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await openTheForm(user)

    await fillIn(user, { name: 'Boiler service', count: '1', unit: 'year' })
    await user.click(screen.getByRole('button', { name: /save|add/i }))

    expect(await screen.findByText('Boiler service')).toBeTruthy()
    expect(screen.getByText(/never done/i)).toBeTruthy()

    // Assert no date is rendered at all, rather than matching a phrase.
    // The previous assertion was `queryByText(/next due/i)` — the row renders
    // "Next 14 June 2027", which that regex never matches, so it passed whether
    // or not a fabricated date was shown. FR-004a's whole point is that the app
    // must not invent a service history, and nothing was guarding it.
    const row = screen.getByRole('listitem')
    expect(row.textContent).not.toMatch(/\d{4}/)
  })

  it('refuses an empty name, and says so against the field', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await openTheForm(user)

    await user.click(screen.getByRole('button', { name: /save|add/i }))

    const nameField = screen.getByLabelText(/name/i)
    expect(nameField.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByRole('alert').textContent).toMatch(/name/i)
  })

  it('refuses an interval below 1', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await openTheForm(user)

    await fillIn(user, { name: 'Something', count: '0', unit: 'month' })
    await user.click(screen.getByRole('button', { name: /save|add/i }))

    expect(screen.getByLabelText(/^every$/i).getAttribute('aria-invalid')).toBe('true')
  })

  it('refuses a last-done date in the future', async () => {
    // You cannot have already done something you have not done yet.
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await openTheForm(user)

    await fillIn(user, { name: 'Something', count: '1', unit: 'year', lastDone: '2027-01-01' })
    await user.click(screen.getByRole('button', { name: /save|add/i }))

    expect(screen.getByLabelText(/last done/i).getAttribute('aria-invalid')).toBe('true')
  })

  it('accepts a last-done date from before the app existed', async () => {
    // A boiler serviced years ago is exactly the history worth recording — and
    // it legitimately produces an overdue job (FR-013a).
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await openTheForm(user)

    await fillIn(user, { name: 'Boiler service', count: '1', unit: 'year', lastDone: '2024-05-01' })
    await user.click(screen.getByRole('button', { name: /save|add/i }))

    expect(await screen.findByText('Boiler service')).toBeTruthy()
    expect(screen.getByText(/overdue/i)).toBeTruthy()
  })
})

/**
 * T115 — the interval question, asked once.
 *
 * The fieldset asked the same thing twice, one line apart: the legend said
 * "How often does it need doing?" and the number box beneath it was labelled
 * "How often — every", so the form read
 *
 *     How often does it need doing?
 *     How often — every  [ 1 ]  [ years ]
 *
 * The legend asks the question; the field says "Every".
 *
 * **Why these tests are anchored on `^every$` and not on `/how often/i`.** A
 * `<legend>` names the *group*, not the controls inside it, so a bare "Every"
 * label would leave the number box with the accessible name "Every" — worse
 * than the self-contained "How often — every" it replaced. The box therefore
 * borrows the legend back through `aria-labelledby`, which means `/how often/i`
 * goes on matching it after the change as well as before. A lookup written that
 * way cannot be observed failing, so it is not evidence of anything. Every
 * lookup in this suite was re-anchored on the visible label for that reason.
 *
 * **What the accessible-name test below is, and what it is not.** It is a name
 * computed by jsdom, via the same accessible-name algorithm Testing Library
 * uses. It is *not* evidence about what VoiceOver on an iPhone announces when
 * someone swipes onto this field — no tier in this repo can establish that, and
 * Principle II (Constitution v1.6.0) puts it on the device. Read it as a guard
 * against someone tidying the `aria-labelledby` away and shipping a field
 * announced as a bare "Every", not as an accessibility pass.
 */
describe('the interval question is asked once', () => {
  /**
   * Rendered under StrictMode, as `main.tsx` does. Nothing here writes, so it
   * changes no outcome — but a test that renders the app differently from
   * production proves less than it appears to, and there is no reason to add a
   * new one that does.
   */
  async function openTheAddForm(user: ReturnType<typeof userEvent.setup>) {
    const view = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
    await user.click(await screen.findByRole('button', { name: /add/i }))
    await screen.findByRole('heading', { name: 'Add a job', level: 2 })
    return view
  }

  /** The same fieldset, on the other form that renders it. `editing` drops the
   *  last-done field and renames the save button, so it is a different form
   *  around the same markup. */
  async function openTheEditForm(user: ReturnType<typeof userEvent.setup>) {
    seed([
      anItem({
        name: 'Boiler service',
        interval: MONTHLY,
        completions: [aCompletion('2026-06-01')],
      }),
    ])
    const view = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
    await user.click(await screen.findByRole('button', { name: 'Boiler service' }))
    await user.click(await screen.findByRole('button', { name: 'Edit job' }))
    await screen.findByRole('heading', { name: 'Edit job', level: 2 })
    return view
  }

  const forms = [
    ['the add form', openTheAddForm],
    ['the edit form', openTheEditForm],
  ] as const

  /** The interval fieldset, reached the way assistive technology reaches it:
   *  a group named by its legend. */
  const intervalGroup = () => screen.getByRole('group', { name: 'How often does it need doing?' })

  /** The number box, found without reference to any label, so that the label
   *  assertions below have something independent to be checked against. */
  const countBox = () => screen.getByRole('spinbutton')

  describe.each(forms)('%s', (_label, open) => {
    it('asks the question once, in the legend', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      await open(user)

      // Scoped to the fieldset because that is where the duplication was: the
      // legend and the label beneath it. Two matches before, one after.
      const asked = intervalGroup().textContent?.match(/how often/gi) ?? []
      expect(asked).toHaveLength(1)
    })

    it('labels the number box "Every", and nothing longer', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      await open(user)

      // The visible label, as a sighted user reads it.
      expect(screen.getByText('Every', { selector: 'label' }).textContent).toBe('Every')
      // ...and it names the number box, not the period dropdown beside it.
      expect(screen.getByLabelText(/^every$/i)).toBe(countBox())
    })

    it('no longer says "How often — every" anywhere on the form', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      const { container } = await open(user)

      // Pinning the absence of a removed string, as T113 did for the removed
      // error phrasing. Tolerant of the dash character so that swapping the em
      // dash for a hyphen does not read as a fix.
      expect(container.textContent).not.toMatch(/how often\s*[—–-]\s*every/i)
    })

    it('still announces the number box with the question, not a bare "Every"', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      await open(user)

      // See the block comment above: a computed name in jsdom, not a device
      // check. The exact string is asserted because the failure worth catching
      // is the name shrinking to "Every", which any looser matcher would pass.
      expect(
        screen.getByRole('spinbutton', { name: 'How often does it need doing? Every' }),
      ).toBe(countBox())
    })
  })
})
