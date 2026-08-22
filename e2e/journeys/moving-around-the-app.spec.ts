import { test, expect } from '@playwright/test'
import { AREAS } from '../../src/ui/navigation'
import { APP_STATES, openScheduleList } from '../support/app'

/**
 * T018 — User Story 1, driven in a real browser.
 *
 * ## Why this is not a `.feature` file
 *
 * Constitution v1.7.0 records `playwright-bdd` as the tool for journeys and says
 * in the same sentence that recording it does not discharge Principle I. The
 * plan took that up and rejected it — see `specs/005-app-shell/plan.md` § D5 for
 * the measurements, which come to 36 packages and a code-generation step whose
 * stale output would run scenarios that no longer exist, to express one journey.
 *
 * The requirement the tool was chosen to satisfy is still met here: each test is
 * named for the acceptance scenario it covers, and the Given / When / Then is
 * carried by `test.step`, which puts the same steps in the HTML report and the
 * trace that Gherkin would have.
 *
 * **What is honestly weaker.** The link to `spec.md` is a string in a title, so
 * it is greppable but nothing checks it: rewrite acceptance scenario US1/AC3 and
 * nothing here goes red until a person changes it. That is worth stating plainly
 * — and it would have been just as true of a `.feature` file, because no tool
 * available here reads `spec.md`. Nothing was given up by not adopting one.
 *
 * ## Why two of these are skipped
 *
 * FR-008 hides the structure while only one area exists, and one area is what
 * the app ships until 003 builds rooms. There is no tab bar in a real browser to
 * tap, so the two scenarios that are *about* switching areas cannot run yet —
 * and they say so, rather than being written in a way that passes without
 * switching anything. They begin running by themselves the day `AREAS` gains an
 * entry.
 *
 * US1/AC5 runs today. It is the half of User Story 1 about *not* moving
 * sideways, and the in-app back control exists with one area.
 */
const onlyOneArea = AREAS.length < 2
const noBarYet =
  'FR-008: with one area the app renders no tab bar, so there is nothing to tap. ' +
  'This scenario starts running when 003 adds rooms.'

test('US1/AC5 — the in-app back control moves up one screen within the area', async ({ page }) => {
  await test.step('Given I am several screens deep in an area', async () => {
    const state = APP_STATES.find((s) => s.name === 'edit a job form')
    if (!state) throw new Error('The "edit a job form" state has been renamed or removed')
    await state.go(page)
    await expect(page.getByRole('heading', { name: 'Edit job', level: 2 })).toBeVisible()
  })

  await test.step('When I use the in-app back control', async () => {
    await page.getByRole('button', { name: 'Back' }).click()
  })

  await test.step('Then I move up one screen, still inside maintenance', async () => {
    // Up from the edit form is the job, not the list: one screen, not all of
    // them. The job's own heading is what says which.
    await expect(page.getByRole('heading', { name: 'Service the boiler', level: 2 })).toBeVisible()
    await expect(page.getByRole('list', { name: 'History' })).toBeVisible()
  })

  await test.step('And going back again reaches the area’s first screen, where there is no back control', async () => {
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByRole('heading', { name: /needing attention|Nothing due/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0)
  })
})

test('US1/AC2 — I am taken to another area in one tap', async ({ page }) => {
  test.skip(onlyOneArea, noBarYet)

  await test.step('Given I am anywhere in the app', async () => {
    await openScheduleList(page)
  })

  const otherArea = AREAS.find((area) => area.id !== AREAS[0]?.id)

  await test.step('When I tap another area', async () => {
    await page.getByRole('navigation', { name: 'Areas' }).getByRole('button', { name: otherArea?.label ?? '' }).click()
  })

  await test.step('Then I am in it, and it is marked as the one I am in', async () => {
    const tab = page.getByRole('navigation', { name: 'Areas' }).getByRole('button', { name: otherArea?.label ?? '' })
    await expect(tab).toHaveAttribute('aria-current', 'page')
  })
})

test('US1/AC3 — coming back to an area shows its first screen, not where I left off', async ({
  page,
}) => {
  test.skip(onlyOneArea, noBarYet)

  const bar = () => page.getByRole('navigation', { name: 'Areas' })
  const otherArea = AREAS.find((area) => area.id !== AREAS[0]?.id)

  await test.step('Given I have gone several screens deep into an area', async () => {
    const state = APP_STATES.find((s) => s.name === 'edit a job form')
    if (!state) throw new Error('The "edit a job form" state has been renamed or removed')
    await state.go(page)
  })

  await test.step('When I switch away and come back', async () => {
    await bar().getByRole('button', { name: otherArea?.label ?? '' }).click()
    await bar().getByRole('button', { name: 'Maintenance' }).click()
  })

  await test.step('Then I am at that area’s first screen', async () => {
    await expect(page.getByRole('heading', { name: /needing attention|Nothing due/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0)
  })
})
