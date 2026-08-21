import { historyDates } from './history'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'
import { load } from '../../src/storage/repository'
import { YEARLY, anItem, seed } from './seed'

/**
 * Saying one thing once.
 *
 * The detail view used to state the same idea three times on its way down the
 * screen: a heading "Record it as done", a field labelled "Date it was done",
 * and a button reading "Record it". The field's label explains, and the button
 * acts:
 *
 *     Add a date you did it
 *     [ dd/mm/yyyy ]  [ Add ]
 *
 * The heading goes; the label and the button take the agreed copy.
 *
 * **Why the label is asserted through `getByLabelText`.** A date field whose
 * label is only visually next to it is unusable to a screen-reader user, who
 * meets the control on its own. Querying by label is the same association the
 * assistive technology relies on, so a broken `htmlFor` fails here — where a
 * lookup by test id or by tag would happily find an unlabelled input and report
 * a pass.
 *
 * **And why that is not enough on its own.** `getByLabelText` matches an
 * `aria-label` too, so it cannot tell a visible label from an invisible one: the
 * label element could be deleted, the accessible name moved onto the input, and
 * every query in this file would still find what it was looking for. What that
 * leaves is a date field with nothing beside it explaining what to put in it,
 * which is precisely what the dropped heading was traded for. A second
 * assertion pins the visible half, and ties the words to the field they label.
 *
 * **How far that assertion reaches, and where it stops.** jsdom loads no
 * stylesheet, so "on the screen" here means "present in the document as text
 * that labels this field". Text hidden by CSS — a `.visually-hidden` span, say
 * — would satisfy it, because nothing in this tier can resolve that the words
 * are painted. Whether the label is legible, and whether it sits where a person
 * expects it relative to the field, belongs to the real browser.
 *
 * **Why "Add" is pinned exactly rather than as `/add/i`.** That pattern also
 * matches "Add job", "Add your first job" and the label of the field beside it.
 * On a screen that will shortly have four buttons on it, a loose match is a test
 * that cannot tell which control it found.
 *
 * **What is deliberately not tested here: that the button sits beside the field
 * rather than beneath it.** That is layout, and jsdom does not do layout — every
 * element reports a zero-sized box at position 0,0, so any assertion about
 * arrangement would pass whatever the stylesheet says. DOM order is not
 * position: the button could follow the field in the markup and be rendered
 * above it, below it, or off-screen. The arrangement belongs to the real-browser
 * tier.
 */
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0)) // 8 August 2026
})
afterEach(() => vi.useRealTimers())

/**
 * StrictMode throughout, because recording a completion writes to storage.
 * React double-invokes state updaters there to prove they are pure, and the app
 * runs inside it in `main.tsx` — a test that renders it any other way is testing
 * a different app from the one that ships. A duplicated-job bug once survived
 * 136 passing tests for exactly this reason.
 */
function launch() {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const app = render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  return { user, app }
}

async function openDetail(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole('button', { name }))
  await screen.findByRole('heading', { name, level: 2 })
}

const storedCompletions = () => load().document.items[0]?.completions ?? []

const headingsInMain = () =>
  within(screen.getByRole('main'))
    .getAllByRole('heading')
    .map((heading) => (heading.textContent ?? '').trim())

describe('the date field on a job', () => {
  it('is labelled "Add a date you did it"', async () => {
    seed([anItem({ name: 'Boiler service', interval: YEARLY })])
    const { user } = launch()
    await openDetail(user, 'Boiler service')

    expect(screen.getByLabelText('Add a date you did it')).toBeTruthy()
  })

  it('says so in words on the screen, not only into the accessibility tree', async () => {
    // `getByLabelText` matches `aria-label` exactly as happily as a `<label>`,
    // so the assertion above is satisfied by an input carrying
    // `aria-label="Add a date you did it"` and no visible text at all — which
    // is a screen with an unexplained date field on it. That matters here
    // specifically: the heading was dropped on the grounds that "the field's
    // label does the explaining", and only half of that agreement was pinned.
    //
    // Both halves, then. The words are on the screen, and they are the label of
    // *this* field rather than a line of prose that happens to say the same
    // thing somewhere else on the page — which is what a sighted user relies on
    // when they look at the field and when they tap the words to reach it.
    seed([anItem({ name: 'Boiler service', interval: YEARLY })])
    const { user } = launch()
    await openDetail(user, 'Boiler service')

    const field = screen.getByLabelText('Add a date you did it')
    const words = screen.getByText('Add a date you did it')

    expect(words).toBeInstanceOf(HTMLLabelElement)
    expect((words as HTMLLabelElement).control).toBe(field)
  })

  it('no longer answers to the old label', async () => {
    seed([anItem({ name: 'Boiler service', interval: YEARLY })])
    const { user } = launch()
    await openDetail(user, 'Boiler service')

    expect(screen.queryByLabelText(/date it was done/i)).toBeNull()
  })
})

describe('the button that records it', () => {
  it('is named "Add"', async () => {
    seed([anItem({ name: 'Boiler service', interval: YEARLY })])
    const { user } = launch()
    await openDetail(user, 'Boiler service')

    // Exact name: nothing visually hidden appended, and nothing else on the
    // screen answering to it.
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy()
  })

  it('no longer answers to the old name', async () => {
    seed([anItem({ name: 'Boiler service', interval: YEARLY })])
    const { user } = launch()
    await openDetail(user, 'Boiler service')

    expect(screen.queryByRole('button', { name: /record it/i })).toBeNull()
  })

  it('records the date, reachable by label and name alone', async () => {
    // The two renamings, used the way a user meets them: find the field by what
    // its label says, find the button by what it is called, and check the
    // completion actually landed. Storage as well as screen — in the duplicated
    // -job bug the screen showed one entry while storage held two, and with no
    // export path what is stored is the part that matters.
    seed([anItem({ name: 'Boiler service', interval: YEARLY })])
    const { user } = launch()
    await openDetail(user, 'Boiler service')

    const field = screen.getByLabelText('Add a date you did it')
    await user.clear(field)
    await user.type(field, '2025-08-08')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(storedCompletions().map((completion) => completion.completedOn)).toEqual(['2025-08-08'])
    // Read through the helper rather than the row's raw text: since T103 every
    // entry carries a Remove control whose accessible name repeats the date, so
    // `textContent` reads "8 August 2025Remove the completion on 8 August 2025".
    // Asserting on that would tie this test to the wording of a button it is not
    // about.
    expect(await historyDates()).toEqual(['8 August 2025'])
  })

  it('still refuses an empty date, and saves nothing', async () => {
    // The rename must not take the validation with it. A submit button that
    // silently records nothing when the field is blank is worse than the old
    // copy it replaced.
    seed([anItem({ name: 'Boiler service', interval: YEARLY })])
    const { user } = launch()
    await openDetail(user, 'Boiler service')

    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(storedCompletions()).toEqual([])
  })
})

describe('the shape of the view', () => {
  it('does not head the date field with a third phrasing of the same idea', async () => {
    seed([anItem({ name: 'Boiler service', interval: YEARLY })])
    const { user } = launch()
    await openDetail(user, 'Boiler service')

    // Every heading in the view, not a chosen one: a screen-reader user
    // navigates by these, so what the list contains is what the view claims its
    // sections are. "Record it as done" was a section heading for a single form
    // field whose label already said the same thing.
    expect(headingsInMain()).toEqual(['Boiler service', 'History'])
  })
})
