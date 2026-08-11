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
 * **User Stories 1 and 2 are built.** The schedule list, the add-a-job form, a
 * job's detail with its history, and the shell's empty / corrupt / read-only /
 * undo states. As US3 (edit, delete, the confirmation dialog) lands, add its
 * views here — every sweep in `e2e/` iterates this list, so a new entry extends
 * the axe scan, the layout check, the contrast walk and the focus sweep at
 * once. A view missing from this list is a view no browser-tier check covers.
 *
 * US2 is why that matters more than it sounds. Marking a job done is a
 * text-sized button inside a heading, and the interval dropdown measured 44px
 * in jsdom and 25px in WebKit — the tier below cannot tell you whether a
 * control is big enough to hit, because it lays nothing out.
 */
export interface AppState {
  name: string
  go: (page: Page) => Promise<void>
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
      await page.getByLabel('How often — every').fill('0')
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
