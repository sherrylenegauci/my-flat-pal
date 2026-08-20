import { StrictMode } from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { computeAccessibleName } from 'dom-accessibility-api'
import { App } from '../../src/ui/App'
import { expectNoViolations } from './axe-helper'
import { YEARLY, anItem, seed } from './seed'

/**
 * The app's mark, as a screen reader meets it.
 *
 * The header is about to stop being the words "my flat pal" and start being a
 * drawing followed by the words "my flat pal". To someone looking at it that is
 * the whole point of the change. To someone listening to it, the correct
 * outcome is that **nothing happens at all**: the mark is decorative, it says
 * the same thing the words beside it already say, and a decorative graphic that
 * announces itself makes the app's own name harder to hear rather than easier.
 *
 * So every assertion in this file is about the heading's accessible name and
 * about the header announcing no graphic. That is the entire contract this tier
 * can hold, and it is worth holding: the two obvious ways to draw an inline SVG
 * — `role="img"` with an `aria-label`, or a `<title>` element inside the `<svg>`
 * — both produce "my flat pal my flat pal" on the heading, which is what a user
 * would actually hear.
 *
 * ## What this file does not check, and which tier does
 *
 * **Anything about how the mark looks.** Not that it is drawn, not its size, not
 * its colour, not its contrast against the header behind it, not whether it
 * still fits beside the wordmark at 375px. jsdom loads no stylesheet, performs
 * no layout and resolves no cascaded colour: every element there reports a
 * zero-sized box and `getComputedStyle` returns initial values, so an assertion
 * about any of that would pass whatever the mark turned out to look like —
 * including if it were never painted. Writing one is the failure the
 * constitution's Testing Strategy names outright ("an automated check that
 * cannot actually check the thing MUST NOT be written"), and it is the same
 * reason `tests/ui/axe-helper.ts` switches the `color-contrast` rule off rather
 * than leaving it on for the look of the thing.
 *
 * That half lives in `e2e/mark.spec.ts`, which runs in Chromium and WebKit: it
 * measures the mark's painted box and computes the contrast between the mark's
 * ground and its figure from colours the browser resolved.
 *
 * **Anything about the app icons.** The same drawing is rasterised into
 * `public/icons/*.png`, and no test that renders React can see those.
 * `tests/assets/icons.test.ts` reads their pixels.
 *
 * ## Why StrictMode
 *
 * `src/main.tsx` renders the app inside it, so a test that does not is testing a
 * different app from the one that ships — a duplicate-save bug once got past 136
 * green tests on exactly that gap. Nothing here writes to storage, so StrictMode
 * is not load-bearing for these assertions; it is here because opening a job's
 * detail view moves navigation state, and because the cheapest way to keep the
 * whole suite honest is for no file to be the exception.
 */
beforeEach(() => {
  localStorage.clear()
})

const launch = () => ({
  user: userEvent.setup(),
  ...render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
})

/** The app's own name, exactly as it must be announced — once. */
const APP_NAME = 'my flat pal'

const appHeading = () => screen.getByRole('heading', { level: 1 })

/** The `<header>` landmark, found the way assistive technology finds it. */
const header = () => screen.getByRole('banner')

describe('the app’s name in the header', () => {
  it('is announced, once, and is all the heading says', async () => {
    seed([anItem({ name: 'Boiler service', interval: YEARLY })])
    launch()
    await screen.findByRole('heading', { name: 'Boiler service', level: 3 })

    // Exact equality rather than a substring, because both failure modes this
    // is guarding against add words rather than remove them: a labelled mark
    // makes the name "my flat pal my flat pal", and a mark whose `<title>` says
    // something else makes it "Flat plan my flat pal".
    expect(computeAccessibleName(appHeading())).toBe(APP_NAME)
  })

  it('says the same thing on a job’s detail view, where Back shares the header', async () => {
    seed([anItem({ name: 'Boiler service', interval: YEARLY })])
    const { user } = launch()

    await user.click(await screen.findByRole('button', { name: 'Boiler service' }))
    await screen.findByRole('heading', { name: 'Boiler service', level: 2 })

    // The other header state, and the reason it is worth its own test: this is
    // the only view where something else lives in the header beside the mark
    // and the name, so it is where a mark that swallowed its siblings — an
    // `aria-labelledby` pointing at the wrong node, a stray `role="img"` on a
    // wrapper — would show up first.
    expect(within(header()).getByRole('button', { name: /back/i })).toBeTruthy()
    expect(computeAccessibleName(appHeading())).toBe(APP_NAME)
  })

  it('is not read twice', async () => {
    seed([anItem({ name: 'Boiler service', interval: YEARLY })])
    launch()
    await screen.findByRole('heading', { name: 'Boiler service', level: 3 })

    // Named separately from the equality above because it is a different bug
    // with a different cause, and because this is the one a reader recognises:
    // "my flat pal my flat pal" is what you hear when a decorative mark is given
    // the wordmark as its label.
    expect(computeAccessibleName(appHeading())).not.toMatch(/my flat pal.*my flat pal/i)
  })
})

describe('the mark itself', () => {
  it('announces nothing', async () => {
    seed([anItem({ name: 'Boiler service', interval: YEARLY })])
    launch()
    await screen.findByRole('heading', { name: 'Boiler service', level: 3 })

    const banner = within(header())

    // The two roles an inline SVG picks up when it is treated as content rather
    // than as decoration. `graphics-document` is what an `<svg>` maps to when it
    // is exposed at all; `img` is what a well-meaning author writes.
    expect(banner.queryAllByRole('img')).toEqual([])
    expect(banner.queryAllByRole('graphics-document')).toEqual([])

    // And nothing in the header offers a text alternative that describes a
    // picture. All three of these are channels a screen reader reads out, so
    // this is about what is heard, not about the markup that produced it.
    expect(banner.queryAllByLabelText(/image|logo|icon|graphic/i)).toEqual([])
    expect(banner.queryAllByTitle(/image|logo|icon|graphic/i)).toEqual([])
    expect(banner.queryAllByAltText(/image|logo|icon|graphic/i)).toEqual([])
  })
})

describe('accessibility of the shell with the mark in it', () => {
  it('has no violations on the schedule list', async () => {
    seed([anItem({ name: 'Boiler service', interval: YEARLY })])
    const { container } = launch()
    await screen.findByRole('heading', { name: 'Boiler service', level: 3 })

    await expectNoViolations(container)
  })

  it('has no violations on a job’s detail view', async () => {
    seed([anItem({ name: 'Boiler service', interval: YEARLY })])
    const { container, user } = launch()

    await user.click(await screen.findByRole('button', { name: 'Boiler service' }))
    await screen.findByRole('heading', { name: 'Boiler service', level: 2 })

    await expectNoViolations(container)
  })
})
