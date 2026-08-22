import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'
import { load } from '../../src/storage/repository'
import type { Interval, IntervalUnit } from '../../src/domain/types'
import { anItem, seed } from './seed'

/**
 * T115 — the period dropdown says "years" whatever the count.
 *
 * The form reads "Every | 1 | years" while the detail view one screen away
 * reads "Every year". Sherrylene chose option 2 of the four recorded under T115:
 * pluralise the option labels off the current count, so the form reads
 * "Every 1 year" and "Every 3 months".
 *
 * **The rule is `formatInterval`'s, and it is the count that decides.** Keying
 * off the unit instead — "the unit is month, so say month" — reads correctly on
 * the annual job that prompts the change and silently misstates every other one,
 * turning a quarterly job into a monthly one. So this file walks all four units
 * at four counts, the way `tests/ui/detail-interval.test.tsx` does, and the
 * twelve plural rows carry as much weight as the four singular ones: they are
 * what fails if the count is dropped for everybody.
 *
 * **Labels are display; values are data.** The stored unit is
 * `'day' | 'week' | 'month' | 'year'` and it must not move. A test that read
 * only the labels would pass an implementation that renamed the values too and
 * corrupted every document the app has ever written — there is no export path,
 * so that is not a bug the user can recover from.
 *
 * **Everything that saves renders under `<StrictMode>`, as `main.tsx` does, and
 * asserts the stored document.** React double-invokes state updaters there, and
 * the last mutation that went untested under it duplicated every job the user
 * added: the screen showed one, storage held two, and 136 green tests missed it.
 *
 * ## What this file cannot establish
 *
 * - **What the closed control shows.** jsdom renders nothing, so "the dropdown
 *   reads year" is really "the option element's text is `year` and it is the
 *   selected one". That is the honest limit of the tier, and it is what a
 *   sighted user sees only because a real engine paints the selected option.
 * - **Anything about iOS.** There the `<select>` is a wheel picker, and whether
 *   VoiceOver re-announces an option whose text changes under the user is a
 *   device question. Nothing here pretends to check it; it belongs to T078, the
 *   manual device checklist. The same goes for whether the re-labelled row still
 *   fits on one line at 375px.
 */
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0)) // Saturday 8 August 2026, local
})
afterEach(() => vi.useRealTimers())

function launch() {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  return user
}

async function openTheAddForm() {
  const user = launch()
  await user.click(await screen.findByRole('button', { name: /add/i }))
  await screen.findByRole('heading', { name: 'Add a job', level: 2 })
  return user
}

/**
 * The same fieldset on the other form that renders it. `editing` arrives with
 * values already in the controls, which is the case the labels have to be right
 * for before anyone touches anything.
 */
async function openTheEditForm(interval: Interval) {
  seed([anItem({ name: 'Boiler service', interval })])
  const user = launch()
  await user.click(await screen.findByRole('button', { name: 'Boiler service' }))
  await user.click(await screen.findByRole('button', { name: 'Edit job' }))
  await screen.findByRole('heading', { name: 'Edit job', level: 2 })
  return user
}

/** The period dropdown, by the label that names it for a screen reader. */
const periodBox = () => screen.getByLabelText(/^period$/i) as HTMLSelectElement
/** The count box, by its visible label (T116). */
const countBox = () => screen.getByLabelText(/^every$/i) as HTMLInputElement

/** What the four options read as, in the order they are offered. */
const optionLabels = () =>
  within(periodBox())
    .getAllByRole('option')
    .map((option) => option.textContent)

/** What each option would store if it were chosen. */
const optionValues = () =>
  within(periodBox())
    .getAllByRole('option')
    .map((option) => (option as HTMLOptionElement).value)

async function setCount(user: ReturnType<typeof userEvent.setup>, count: string) {
  await user.clear(countBox())
  await user.type(countBox(), count)
}

const SINGULAR = ['day', 'week', 'month', 'year']
const PLURAL = ['days', 'weeks', 'months', 'years']
const VALUES: IntervalUnit[] = ['day', 'week', 'month', 'year']

/**
 * One count, and three that are not one.
 *
 * 1 is the case the change is about; 2, 3 and 10 are the control. Without them,
 * "singular labels" and "singular labels only at 1" are indistinguishable, and
 * the first of those describes the user's schedule incorrectly.
 */
const COUNTS: ReadonlyArray<[string, string[]]> = [
  ['1', SINGULAR],
  ['2', PLURAL],
  ['3', PLURAL],
  ['10', PLURAL],
]

describe('the period options agree with the count beside them', () => {
  it.each(COUNTS)('at a count of %s the options read %j', async (count, expected) => {
    const user = await openTheAddForm()

    await setCount(user, count)

    // All four units at once rather than one assertion per unit: the failure
    // worth catching is a table that pluralises some and not others, and a
    // whole-list comparison prints what the form actually offers.
    expect(optionLabels()).toEqual(expected)
  })

  it.each(COUNTS)('the stored values are unchanged at a count of %s', async (count) => {
    // The labels are what a person reads; these are what the app writes down.
    // An implementation that renamed both would read correctly and corrupt
    // every saved document, and there is no export path to recover from.
    const user = await openTheAddForm()

    await setCount(user, count)

    expect(optionValues()).toEqual(VALUES)
  })

  it('still offers all four periods while the count box is empty', async () => {
    // Mid-edit: the box is cleared before the new number is typed, so this
    // state is on screen every time anyone changes the count. Which way the
    // labels read with no count at all is nobody's decision yet, so it is not
    // asserted — that four options are still there, and still store the same
    // four values, is.
    const user = await openTheAddForm()

    await user.clear(countBox())

    expect(optionValues()).toEqual(VALUES)
    expect(optionLabels()).toHaveLength(4)
  })
})

describe('changing the count under a chosen period', () => {
  it('keeps the choice, and the label follows the count', async () => {
    const user = await openTheAddForm()

    // Chosen by value, the way the choice is stored, so this line says nothing
    // about the label and cannot be satisfied by one.
    await user.selectOptions(periodBox(), 'month')
    expect(periodBox().value).toBe('month')
    expect(optionLabels()).toEqual(SINGULAR)

    await setCount(user, '3')

    // The label changed under the user; the value did not.
    expect(periodBox().value).toBe('month')
    expect(optionLabels()).toEqual(PLURAL)
    expect((screen.getByRole('option', { name: 'months' }) as HTMLOptionElement).selected).toBe(true)
  })

  it('does not move focus away from the count box', async () => {
    // The objection recorded against option 2 in T115 was that a dropdown
    // cannot re-label itself without moving focus under the user. For a closed
    // `select` that looks unfounded — React rewrites the option text in place —
    // but "looks unfounded" is not evidence, so it is asserted. What it cannot
    // speak to is the iOS wheel picker, which is a device question (T078).
    const user = await openTheAddForm()

    await user.selectOptions(periodBox(), 'week')
    await setCount(user, '4')

    expect(document.activeElement).toBe(countBox())
  })
})

describe('what the form saves', () => {
  it('stores a count of 1 with the singular label showing', async () => {
    const user = await openTheAddForm()

    await user.type(screen.getByLabelText(/^name$/i), 'Boiler service')
    await setCount(user, '1')
    await user.selectOptions(periodBox(), 'year')

    // The precondition this test is about: the option the user is looking at
    // says "year", not "years".
    expect(optionLabels()).toEqual(SINGULAR)

    await user.click(screen.getByRole('button', { name: 'Save job' }))
    await screen.findByText('Boiler service')

    // The whole list, so a job saved twice under StrictMode fails here rather
    // than passing on a screen that shows one row.
    expect(
      load().document.items.map((item) => ({ name: item.name, interval: item.interval })),
    ).toEqual([{ name: 'Boiler service', interval: { count: 1, unit: 'year' } }])
  })

  it('stores a count of 3 with the plural label showing', async () => {
    const user = await openTheAddForm()

    await user.type(screen.getByLabelText(/^name$/i), 'Water filter')
    await setCount(user, '3')
    await user.selectOptions(periodBox(), 'month')

    expect(optionLabels()).toEqual(PLURAL)

    await user.click(screen.getByRole('button', { name: 'Save job' }))
    await screen.findByText('Water filter')

    expect(
      load().document.items.map((item) => ({ name: item.name, interval: item.interval })),
    ).toEqual([{ name: 'Water filter', interval: { count: 3, unit: 'month' } }])
  })
})

describe('the edit form, which is the same fieldset', () => {
  it('shows an annual job as "year"', async () => {
    await openTheEditForm({ count: 1, unit: 'year' })

    expect(periodBox().value).toBe('year')
    expect(optionLabels()).toEqual(SINGULAR)
    expect((screen.getByRole('option', { name: 'year' }) as HTMLOptionElement).selected).toBe(true)
  })

  it('shows a six-monthly job as "months"', async () => {
    await openTheEditForm({ count: 6, unit: 'month' })

    expect(periodBox().value).toBe('month')
    expect(optionLabels()).toEqual(PLURAL)
    expect((screen.getByRole('option', { name: 'months' }) as HTMLOptionElement).selected).toBe(true)
  })

  it('saves the unit it was showing when the count changes', async () => {
    // The count goes from 1 to 2, so the labels flip from singular to plural
    // mid-edit and the value has to survive it — on the path that overwrites an
    // existing job rather than adding one.
    const user = await openTheEditForm({ count: 1, unit: 'year' })

    await setCount(user, '2')
    expect(optionLabels()).toEqual(PLURAL)

    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByText('Boiler service')

    expect(
      load().document.items.map((item) => ({ name: item.name, interval: item.interval })),
    ).toEqual([{ name: 'Boiler service', interval: { count: 2, unit: 'year' } }])
  })
})
