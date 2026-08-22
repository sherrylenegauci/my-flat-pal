import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { TODAY, openScheduleList } from '../support/app'
import { STORAGE_KEY } from '../../src/storage/schema'
import type { StoredDocument } from '../../src/storage/schema'
import type { Completion } from '../../src/domain/types'

/**
 * Where a tap on a job card actually lands.
 *
 * Sherrylene asked for the whole card to open the job, so the name no longer
 * has to be underlined to say it is tappable. The card cannot become a button —
 * it contains "Mark done", and a button inside a button is invalid HTML that
 * assistive technology reads unpredictably — so the name stays the button and
 * its hit area is stretched over the card behind everything else.
 *
 * **That is a stacking-order change, and stacking order is exactly what jsdom
 * cannot see.** It performs no layout and does no hit-testing: every element
 * there reports a zero-sized box at 0,0, and a click dispatched at an element is
 * delivered to that element whatever is drawn on top of it. A test written in
 * the tier below would report that "Mark done" works while a real thumb opened
 * the job instead. There is no version of these two tests that belongs anywhere
 * but here.
 *
 * **Why the clicks are coordinates rather than `locator.click()`.** Playwright's
 * own actionability check refuses to click an element that something else
 * covers, and reports it as a timeout naming the covering element. That is a
 * red run, but it is a red run about Playwright rather than about the app, and
 * it stops before any assertion about what the app *did*. `page.mouse.click(x,
 * y)` skips the check and lets the engine hit-test the point the way it does for
 * a finger, so the app gets to be wrong and the assertions get to say how.
 *
 * **What this file therefore does not establish.** That a *finger* behaves like
 * the pointer: `touch-action`, the tap highlight, whether an accidental drag
 * cancels the tap, and how the card responds to a long press are all real-device
 * questions, and the constitution puts them on the manual checklist (T078). What
 * is checked here is hit-testing — which control receives the event — and that
 * is the half the bug lives in.
 */

/** The job used for "tapping the card opens it": overdue, so it carries a due-date line. */
const OPENS = 'Bleed the radiators'
/** The job used for "Mark done still records": seeded with exactly one completion. */
const TICKED_OFF = 'Test the smoke alarms'

/**
 * The document as it is actually stored, parsed from the app's own key.
 *
 * The screen is not enough here and the reason is recorded across
 * `tests/ui/complete.test.tsx`: a mutation bug once showed one job on screen
 * while storage held two, and with no export path what is stored is the part
 * that survives. A completion that never reached localStorage is a completion
 * the user loses on the next launch.
 */
async function storedDocument(page: Page): Promise<StoredDocument> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)
  expect(raw, 'nothing is stored under the app’s key, so there is no document to inspect').not.toBeNull()
  return JSON.parse(raw as string) as StoredDocument
}

function completionsOf(document: StoredDocument, name: string): Completion[] {
  const items = document.items.filter((item) => item.name === name)
  expect(items, `the stored document holds ${items.length} jobs named "${name}", not one`).toHaveLength(1)
  return items[0]?.completions ?? []
}

test('tapping a card away from its buttons opens the job', async ({ page }) => {
  await openScheduleList(page)

  const card = page.getByRole('listitem').filter({ hasText: OPENS })
  // The due-date line: on the card, not a control, and the point a thumb lands
  // on when someone reaches for "the row" rather than for the name.
  const dueDate = card.getByText(/^Was /)
  const markDone = page.getByRole('button', { name: `Mark done — ${OPENS}` })

  const cardBox = await card.boundingBox()
  const dueDateBox = await dueDate.boundingBox()
  const markDoneBox = await markDone.boundingBox()

  expect(
    { card: cardBox !== null, dueDate: dueDateBox !== null, markDone: markDoneBox !== null },
    'the card, its due-date line or its Mark done button is not laid out at all',
  ).toEqual({ card: true, dueDate: true, markDone: true })
  if (!cardBox || !dueDateBox || !markDoneBox) return

  const point = { x: dueDateBox.x + dueDateBox.width / 2, y: dueDateBox.y + dueDateBox.height / 2 }

  // Stated rather than assumed, because the whole test turns on it: the point
  // is inside the card and it is not on the one control that must keep its own
  // behaviour. It is deliberately *not* asserted to be off the name button —
  // whether the name's box or a pseudo-element covers the card is an
  // implementation choice, and pinning it would reject a valid one.
  const inTheCard =
    point.x > cardBox.x &&
    point.x < cardBox.x + cardBox.width &&
    point.y > cardBox.y &&
    point.y < cardBox.y + cardBox.height
  const clearOfMarkDone =
    point.x < markDoneBox.x ||
    point.x > markDoneBox.x + markDoneBox.width ||
    point.y < markDoneBox.y ||
    point.y > markDoneBox.y + markDoneBox.height

  expect(
    { inTheCard, clearOfMarkDone },
    `the point being tapped (${point.x.toFixed(1)}, ${point.y.toFixed(1)}) is not where this ` +
      'test thinks it is, so whatever it goes on to prove is not what it claims',
  ).toEqual({ inTheCard: true, clearOfMarkDone: true })

  await page.mouse.click(point.x, point.y)

  // The detail view for *that* job — the heading names it, so a card that
  // opened the wrong job fails here rather than passing as "something opened".
  await expect(
    page.getByRole('heading', { name: OPENS, level: 2 }),
    'tapping the card’s due-date line did not open the job',
  ).toBeVisible()
})

test('tapping a card’s empty space, beside Mark done, opens the job', async ({ page }) => {
  await openScheduleList(page)

  const card = page.getByRole('listitem').filter({ hasText: OPENS })
  const markDone = page.getByRole('button', { name: `Mark done — ${OPENS}` })

  const cardBox = await card.boundingBox()
  const markDoneBox = await markDone.boundingBox()

  expect(
    { card: cardBox !== null, markDone: markDoneBox !== null },
    'the card or its Mark done button is not laid out at all',
  ).toEqual({ card: true, markDone: true })
  if (!cardBox || !markDoneBox) return

  // The bare strip to the left of "Mark done", on the same line as it. A
  // stricter point than the one above on purpose: it is the part of the card
  // nearest the control that must *not* be covered, so it is where a hit area
  // stopped one row short — or raised one layer too far — shows itself.
  const point = {
    x: (cardBox.x + markDoneBox.x) / 2,
    y: markDoneBox.y + markDoneBox.height / 2,
  }

  expect(
    {
      insideTheCard: point.x > cardBox.x && point.y < cardBox.y + cardBox.height,
      leftOfMarkDone: point.x < markDoneBox.x,
    },
    `the point being tapped (${point.x.toFixed(1)}, ${point.y.toFixed(1)}) is not in the card’s ` +
      'empty space, so this test would not be checking what it says',
  ).toEqual({ insideTheCard: true, leftOfMarkDone: true })

  await page.mouse.click(point.x, point.y)

  await expect(
    page.getByRole('heading', { name: OPENS, level: 2 }),
    'tapping the empty part of the card, beside Mark done, did not open the job',
  ).toBeVisible()
})

/**
 * The failure this whole file exists for.
 *
 * If the stretched hit area covers "Mark done", tapping it opens the job instead
 * of recording a completion — silently, with no error and nothing on screen that
 * looks wrong, and strictly worse than the underline being replaced. A test that
 * clicked the button and checked nothing threw would pass through that.
 *
 * So both halves are asserted, and the first is the one with teeth: a completion
 * was recorded, on the day the clock is pinned to, exactly one of it, and it is
 * in storage rather than only on screen. "The app did not navigate" alone would
 * be satisfied by a button that did nothing at all.
 */
test('tapping Mark done records the completion and stays on the list', async ({ page }) => {
  await openScheduleList(page)

  const before = completionsOf(await storedDocument(page), TICKED_OFF)
  // The seed's precondition, asserted rather than trusted: without a known
  // starting count, "exactly one more" below proves nothing.
  expect(before, `"${TICKED_OFF}" is meant to be seeded with one completion`).toHaveLength(1)

  const markDone = page.getByRole('button', { name: `Mark done — ${TICKED_OFF}` })
  const box = await markDone.boundingBox()
  expect(box, 'the Mark done button is not laid out at all').not.toBeNull()
  if (!box) return

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

  // What the user sees. The undo offer names the job it recorded, so an offer
  // naming something else is a failure rather than a pass.
  await expect(
    page.getByRole('status'),
    'no undo offer naming the job appeared, so nothing was recorded where the user could see it',
  ).toContainText(TICKED_OFF)

  // The job was due today and is now scheduled, and the group heading counts one
  // fewer. Together these say the list is still on screen and it has moved on.
  await expect(page.getByRole('listitem').filter({ hasText: TICKED_OFF })).toContainText('Scheduled')
  await expect(page.getByRole('heading', { name: '2 needing attention' })).toBeVisible()

  // And the detail view did not open. This is the assertion that goes red when
  // the stretched hit area swallows the button.
  await expect(
    page.getByRole('heading', { name: TICKED_OFF, level: 2 }),
    'tapping Mark done opened the job instead of recording it',
  ).toHaveCount(0)

  const after = completionsOf(await storedDocument(page), TICKED_OFF)
  const added = after.filter((completion) => !before.some((old) => old.id === completion.id))

  expect(
    { total: after.length, added: added.map((completion) => completion.completedOn) },
    'the stored document does not hold exactly one new completion dated today. ' +
      `Before: ${before.map((c) => c.completedOn).join(', ')}. ` +
      `After: ${after.map((c) => c.completedOn).join(', ')}.`,
  ).toEqual({ total: before.length + 1, added: [TODAY] })
})
