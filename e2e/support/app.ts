import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { STORAGE_KEY } from '../../src/storage/schema'
import type { StoredDocument } from '../../src/storage/schema'

/**
 * Driving the app from a real browser, deterministically.
 *
 * Two sources of non-determinism have to be closed before any of this tier's
 * assertions mean anything:
 *
 *   1. **The clock.** `src/domain/` is pure and takes dates as parameters, but
 *      `useCurrentDate` reads the device clock, and every status on the list
 *      derives from "today". The clock is therefore pinned per test, and the
 *      seeded dates are written relative to that pinned day. Without this a run
 *      that straddled midnight would flip "Due today" to "Overdue" and the
 *      suite would fail for the wrong reason on a slow machine — the exact
 *      thing the project's testing rules forbid.
 *   2. **Storage.** Seeded through an init script, so it is in place before the
 *      app's first read rather than racing it.
 *
 * The timezone is pinned in playwright.config.ts for the same reason: `today`
 * is a *local* calendar date.
 */

/** 13:00 on 15 June 2026 in Europe/London — comfortably mid-day, so no rollover. */
export const FIXED_NOW = new Date('2026-06-15T12:00:00Z')
export const TODAY = '2026-06-15'

interface SeedItem {
  id: string
  name: string
  interval: { count: number; unit: 'day' | 'week' | 'month' | 'year' }
  createdAt: string
  lastDone?: string
  /**
   * Several completions, for the states that need a history to render.
   *
   * Given oldest-first for readability; the app is responsible for turning that
   * into newest-first on screen (FR-008), so a seed that arrived pre-sorted the
   * way the view displays it would hide a view that never sorted at all.
   */
  history?: string[]
}

function toDocument(items: SeedItem[]): StoredDocument {
  return {
    schemaVersion: 1,
    revision: 1,
    items: items.map((item) => {
      const dates = item.history ?? (item.lastDone ? [item.lastDone] : [])

      return {
        id: item.id,
        name: item.name,
        interval: item.interval,
        createdAt: item.createdAt,
        completions: dates.map((completedOn, index) => ({
          id: `${item.id}-c${index + 1}`,
          completedOn,
          recordedAt: `${completedOn}T09:00:00.000Z`,
        })),
      }
    }),
  }
}

/**
 * One job in each of the four statuses, so a sweep over the list covers every
 * badge, every border colour, and both the "needs attention" and "later"
 * groups. Dates are chosen against TODAY above.
 */
const FOUR_STATUSES: SeedItem[] = [
  {
    id: 'seed-overdue',
    name: 'Bleed the radiators',
    interval: { count: 6, unit: 'month' },
    createdAt: '2025-01-04',
    lastDone: '2025-06-01', // due 2025-12-01 → overdue
  },
  {
    id: 'seed-due',
    name: 'Test the smoke alarms',
    interval: { count: 1, unit: 'month' },
    createdAt: '2025-02-10',
    lastDone: '2026-05-15', // due 2026-06-15 → due today
  },
  {
    id: 'seed-never',
    name: 'Service the boiler',
    interval: { count: 1, unit: 'year' },
    createdAt: '2025-03-01', // never done
  },
  {
    id: 'seed-not-due',
    name: 'Change the water filter',
    interval: { count: 1, unit: 'year' },
    createdAt: '2025-04-01',
    lastDone: '2026-05-01', // due 2027-05-01 → scheduled
  },
]

/**
 * One job with a history, for the detail view.
 *
 * A separate seed rather than a fifth entry in FOUR_STATUSES: the list states
 * assert an exact "3 needing attention" heading, and adding a job would change
 * that count in every one of them.
 */
const WITH_HISTORY: SeedItem[] = [
  {
    id: 'seed-history',
    name: 'Service the boiler',
    interval: { count: 1, unit: 'year' },
    createdAt: '2023-01-04',
    history: ['2023-05-02', '2024-05-06', '2025-05-11'], // due 2026-05-11 → overdue
  },
]

/**
 * What each seeded job's status must read as on the pinned day.
 *
 * Kept beside the seed so the two cannot drift. The status *words* are the
 * app's contract with a user who cannot distinguish the colours it also uses —
 * see e2e/colour-independence.spec.ts.
 */
export const SEEDED_STATUSES = [
  { name: 'Bleed the radiators', status: 'Overdue' },
  { name: 'Test the smoke alarms', status: 'Due today' },
  { name: 'Service the boiler', status: 'Never done' },
  { name: 'Change the water filter', status: 'Scheduled' },
] as const

/** The list view with one job in each status, ready to inspect. */
export async function openScheduleList(page: Page): Promise<void> {
  const state = APP_STATES.find((s) => s.name === 'schedule list')
  if (!state) throw new Error('The "schedule list" state has been renamed or removed')
  await state.go(page)
}

/**
 * Put a document (or deliberate rubbish) in place before the app boots, and
 * pin the answer to `navigator.storage.persist()`.
 *
 * Pinning persistence is not tidiness. Both headless engines refuse it, so
 * without this every state would carry the storage warning banner and the
 * banner's own state would never be chosen deliberately — the sweeps' subject
 * matter would depend on the browser build. Refused is covered by its own state
 * below instead.
 */
async function seed(
  page: Page,
  raw: string | null,
  persistence: 'granted' | 'refused' = 'granted',
): Promise<void> {
  await page.addInitScript(
    ([key, value, grant]) => {
      window.localStorage.clear()
      if (value !== null) window.localStorage.setItem(key as string, value as string)

      const granted = grant === 'granted'
      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        value: {
          persist: () => Promise.resolve(granted),
          persisted: () => Promise.resolve(granted),
          estimate: () => Promise.resolve({ quota: 0, usage: 0 }),
        },
      })
    },
    [STORAGE_KEY, raw, persistence] as const,
  )
}

async function open(page: Page): Promise<void> {
  await page.clock.setFixedTime(FIXED_NOW)
  await page.goto('/')
  await page.getByRole('heading', { name: 'my flat pal', level: 1 }).waitFor()
}

/**
 * The views that exist today.
 *
 * **User Stories 1, 2 and 3 are built.** The schedule list, the add-a-job form,
 * the edit form, a job's detail with its history, the confirmation before a
 * deletion, and the shell's empty / corrupt / read-only / undo states. Four of
 * the five sweeps in `e2e/` iterate this list, so a new entry extends the axe
 * scan, the contrast walk, the layout check and the focus sweep at once. A view
 * missing from this list is a view those four do not cover.
 *
 * The fifth, `colour-independence.spec.ts`, deliberately does not iterate: it
 * asks whether *status* survives colour being removed, and status only exists on
 * the list, whose four seeded rows it compares against each other. Adding a
 * state here does not extend it, and it is not a gap that it does not.
 *
 * US2 is why the list matters more than it sounds. Marking a job done is a
 * text-sized button inside a heading, and the interval dropdown measured 44px
 * in jsdom and 25px in WebKit — the tier below cannot tell you whether a
 * control is big enough to hit, because it lays nothing out.
 */
export interface AppState {
  name: string
  go: (page: Page) => Promise<void>
  /**
   * Set only on a state where rendering **no** interactive control is the
   * requirement — and set to the reason, so the reason travels with the fact
   * instead of living in a comment somewhere else.
   *
   * The touch-target, focus-indicator and Tab-order sweeps each walk this list,
   * collect whatever controls the state rendered, and measure them. A state with
   * nothing to collect would pass all three without measuring anything, which is
   * why each asserts it found at least one control. That assertion is the guard
   * against a view quietly rendering nothing, and it stays.
   *
   * This field is the stated exception to it, and it is deliberately not a
   * skip: see `hasControlsToSweep` below, which turns it into the opposite
   * assertion. "This state has no controls" then has to keep being true.
   */
  noControlsBecause?: string
}

/**
 * Assert what a state claims about its controls, and say whether there is a
 * sweep left to run.
 *
 * Two claims, never both:
 *
 *   - Ordinarily, that the state rendered at least one control. Without this a
 *     view that stopped rendering its controls altogether would sail through
 *     the touch-target, focus-indicator and Tab-order sweeps, all of which
 *     iterate whatever they were handed.
 *   - Where the state declares `noControlsBecause`, that it rendered exactly
 *     none. This is the part that makes the exception safe to grant: it is an
 *     assertion in its own right, so the read-only view growing a button — the
 *     very thing FR-010a forbids — fails here rather than being tolerated. A
 *     blanket `if (controls.length === 0) return` would give up both halves.
 *
 * Returns false when the caller should stop, which happens only on the second
 * branch and only after that branch has asserted something.
 */
export function hasControlsToSweep(state: AppState, controls: string[]): boolean {
  if (state.noControlsBecause !== undefined) {
    expect(
      controls,
      `"${state.name}" must render no interactive control at all — ${state.noControlsBecause}`,
    ).toEqual([])
    return false
  }

  expect(controls.length, `no interactive controls found in "${state.name}"`).toBeGreaterThan(0)
  return true
}

export const APP_STATES: AppState[] = [
  {
    name: 'empty schedule',
    go: async (page) => {
      await seed(page, null)
      await open(page)
      await page.getByRole('heading', { name: 'Nothing recorded yet' }).waitFor()
    },
  },
  {
    name: 'schedule list',
    go: async (page) => {
      await seed(page, JSON.stringify(toDocument(FOUR_STATUSES)))
      await open(page)
      await page.getByRole('heading', { name: '3 needing attention' }).waitFor()
    },
  },
  {
    name: 'the undo offer, after marking a job done',
    /**
     * The undo notice was swept by nothing until now, so its contrast, its
     * 44x44 target and its focus ring were all unverified — on a control that
     * deletes a completion irrecoverably.
     *
     * **Why the fixed clock does not fight this, verified rather than assumed.**
     * `page.clock.setFixedTime` freezes what `Date.now()` and `new Date()`
     * return but leaves timers running on real time. So the completion is
     * recorded at FIXED_NOW, and `isWithinUndoWindow` compares it against
     * FIXED_NOW on every render: elapsed is permanently zero, and the offer
     * never expires however long the sweep takes. The ten-second `setTimeout`
     * in `useSchedule` still fires after ten real seconds — it re-renders, the
     * window is re-checked, the answer is the same, and because the effect's
     * dependencies have not changed no further timer is armed. One harmless
     * wake-up, not a loop.
     *
     * That is convenient here, but it is also the reason this state cannot say
     * anything about *expiry*. The offer withdrawing itself after ten seconds is
     * covered in `tests/ui/` with fake timers, where the clock can be moved.
     */
    go: async (page) => {
      await seed(page, JSON.stringify(toDocument(FOUR_STATUSES)))
      await open(page)
      await page.getByRole('button', { name: 'Mark done — Test the smoke alarms' }).click()
      await page.getByRole('button', { name: /^Undo\b/ }).waitFor()
    },
  },
  {
    name: 'add a job form',
    go: async (page) => {
      await seed(page, null)
      await open(page)
      await page.getByRole('button', { name: 'Add your first job' }).click()
      await page.getByRole('heading', { name: 'Add a job' }).waitFor()
    },
  },
  {
    name: 'add a job form, showing validation errors',
    go: async (page) => {
      await seed(page, null)
      await open(page)
      await page.getByRole('button', { name: 'Add your first job' }).click()
      // The interval count box, by its visible label (T116).
      //
      // `exact` keeps this pinned to the label rather than to the question. The
      // input borrows the fieldset's legend through `aria-labelledby`, so
      // Playwright has two label candidates for it — and it matches if *either*
      // one does, which means a loose "Every" is not ambiguous today: measured
      // in both engines, it resolves to this one element. The anchor is for
      // later. It is what stops a reworded legend from quietly satisfying this
      // lookup, and it matches how the tier below is anchored.
      await page.getByLabel('Every', { exact: true }).fill('0')
      await page.getByRole('button', { name: 'Save job' }).click()
      // Both errors, so the sweeps see error text in two different layouts:
      // a stacked field and the inline interval grid.
      await page.getByText('Give the job a name').waitFor()
      await page.getByText('must be a whole number').waitFor()
    },
  },
  {
    name: 'job detail, with history',
    go: async (page) => {
      await seed(page, JSON.stringify(toDocument(WITH_HISTORY)))
      await open(page)
      // Reached the way a user reaches it — tapping the job's name in the list.
      await page.getByRole('button', { name: 'Service the boiler', exact: true }).click()
      await page.getByRole('heading', { name: 'Service the boiler', level: 2 }).waitFor()
      await page.getByRole('list', { name: 'History' }).waitFor()
    },
  },
  {
    name: 'edit a job form',
    /**
     * US3's other half. The same component as "add a job form" but not the same
     * state: the fields arrive pre-filled, the last-done field is absent, and
     * the submit button says something else — so the layout it produces is a
     * different one, and at 375px that is exactly the sort of difference that
     * has bitten before (T093's interval row).
     */
    go: async (page) => {
      await seed(page, JSON.stringify(toDocument(WITH_HISTORY)))
      await open(page)
      await page.getByRole('button', { name: 'Service the boiler', exact: true }).click()
      await page.getByRole('button', { name: 'Edit job' }).click()
      await page.getByRole('heading', { name: 'Edit job', level: 2 }).waitFor()
    },
  },
  {
    name: 'the confirmation before deleting a job',
    /**
     * The dialog, open, over the job it is asking about.
     *
     * **This state's control list is deliberately just the dialog's two
     * buttons.** While the dialog is open the rest of the page carries `inert`,
     * so `readControlBoxes` excludes it — see the note there. That is the point
     * rather than a gap: the controls behind a modal cannot be tabbed to,
     * focused, or tapped, and the sweeps measure them in "job detail, with
     * history", where they are live.
     *
     * **One thing this state cannot speak to.** `e2e/contrast.spec.ts` walks the
     * text behind the scrim and resolves its colours from the ancestor chain,
     * which does not include a fixed overlay — so the ratios it reports for that
     * text are the undimmed ones, and they are the same ratios already measured
     * in the detail state. Whether dimmed text behind a scrim is legible is not
     * something this tier is measuring here, and it is not a question the app
     * needs answered: the scrim exists to push that text back, not to keep it
     * readable. Recorded so a green run is not read as more than it is.
     */
    go: async (page) => {
      await seed(page, JSON.stringify(toDocument(WITH_HISTORY)))
      await open(page)
      await page.getByRole('button', { name: 'Service the boiler', exact: true }).click()
      await page.getByRole('button', { name: 'Delete job' }).click()
      await page.getByRole('dialog').waitFor()
      await page.getByRole('button', { name: 'Delete permanently' }).waitFor()
    },
  },
  {
    name: 'the confirmation before removing one completion',
    /**
     * The other caller of the same dialog (T103), which had no state of its own
     * until verification pointed out that a view missing from this list is a
     * view four sweeps do not cover.
     *
     * **Worth its own state even though the delete dialog already has one**, for
     * two reasons that are about this dialog rather than about dialogs. Its
     * consequence sentence is roughly twice as long — it names the date the
     * schedule moves to and the status the job will then show — so it is the
     * case that decides whether `.dialog`'s `max-height` and `overflow-y` are
     * doing their job at 375px, and the axe scan has never run over this
     * wording. And the *page behind* it is the history list, whose rows now each
     * carry a destructive control; that page is `inert` here, which is what
     * `readControlBoxes` is asked to skip, so this is also where that exclusion
     * is exercised against a page with many more controls than the delete case
     * has.
     *
     * The newest entry is the one opened, deliberately: removing it is the
     * branch that moves the due date backwards, which produces the longest of
     * the three sentences and is the correction the whole feature exists for.
     */
    go: async (page) => {
      await seed(page, JSON.stringify(toDocument(WITH_HISTORY)))
      await open(page)
      await page.getByRole('button', { name: 'Service the boiler', exact: true }).click()
      await page.getByRole('list', { name: 'History' }).waitFor()
      await page.getByRole('button', { name: 'Remove the completion on 11 May 2025' }).click()
      await page.getByRole('dialog').waitFor()
      await page.getByRole('button', { name: 'Remove permanently' }).waitFor()
    },
  },
  {
    name: 'job detail, never done',
    go: async (page) => {
      await seed(page, JSON.stringify(toDocument([{ ...WITH_HISTORY[0]!, history: [] }])))
      await open(page)
      await page.getByRole('button', { name: 'Service the boiler', exact: true }).click()
      await page.getByText('No completions recorded yet').waitFor()
    },
  },
  {
    name: 'unreadable saved data',
    go: async (page) => {
      await seed(page, '{ this is not json')
      await open(page)
      await page.getByText('Some saved data couldn’t be read').waitFor()
    },
  },
  {
    name: 'data written by a newer version',
    /**
     * The only state in this list with nothing to press, and that is the point
     * of it rather than an oversight.
     *
     * `load()` refuses to parse a document a newer build wrote — half-parsing
     * it and then saving would overwrite the user's records with a downgraded
     * copy — so every write is refused for as long as that document is there.
     * FR-010a: "every control that would change something MUST be hidden or
     * disabled... A control that appears usable but silently does nothing MUST
     * NOT be shown." This screen used to render the ordinary empty state, whose
     * "Add your first job" button threw `ReadOnlyError` into a void, because
     * React does not catch throws from event handlers. `ReadOnlyView` replaced
     * it with a heading and a paragraph and no controls at all.
     *
     * So "this state has zero controls" is a requirement, and stating it here
     * is what lets the sweeps assert it instead of merely tolerating it.
     */
    noControlsBecause:
      'FR-010a — the stored document was written by a newer build, so every write is ' +
      'refused and ReadOnlyView offers nothing to press',
    go: async (page) => {
      await seed(page, JSON.stringify({ schemaVersion: 99, revision: 4, items: [] }))
      await open(page)
      await page.getByText('showing an older version').waitFor()
    },
  },
  {
    name: 'storage durability warning',
    go: async (page) => {
      await seed(page, JSON.stringify(toDocument(FOUR_STATUSES)), 'refused')
      await open(page)
      await page.getByRole('button', { name: 'Got it' }).waitFor()
    },
  },
]
