import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/ui/App'
import type { Interval } from '../../src/domain/types'
import { YEARLY, aCompletion, anItem, seed } from './seed'

/**
 * The sentence at the top of a job: how often it comes round, and when it was
 * last done.
 *
 * Two changes live here, and the first is the one with teeth.
 *
 * **"Every 1 year" is not English.** The view printed the count unconditionally,
 * so an annual job read "Every 1 year". Dropping the count when it is 1 is easy
 * to get wrong in a way that is worse than the bug it fixes: an implementation
 * that keys off the *unit* — "the unit is year, so say 'Every year'" — turns
 * "Every 3 months" into "Every month" and silently misstates the user's
 * schedule. In an app whose whole job is telling you when something is due, that
 * is a wrong answer rather than a typo. So the rule is checked across every unit
 * at four counts rather than at the annual case that prompted it, and the plural
 * rows carry as much weight as the singular ones: they are what fails if the
 * count is dropped for everybody.
 *
 * **The interval and the last-done fact are one line now**, joined by a middle
 * dot: "Every year · last done 1 June 2024". A job that has never been done gets
 * the interval alone — no dot, no dangling separator, and still no due date
 * (FR-004a), because the app does not invent one from a service that never
 * happened.
 *
 * Asserted as whole lines rather than as fragments. The point of merging two
 * facts is what the sentence reads like end to end, and a pair of substring
 * matches would pass equally against "Every year·last done" and
 * "Every year · · last done".
 *
 * **What this file cannot establish.** That the dot is not announced. The plan
 * is to wrap it in `aria-hidden="true"`, but jsdom has no assistive technology
 * attached to it, so the only thing available here is reading the attribute back
 * — which pins one implementation of "silent" and would reject an equally valid
 * one done in CSS. Whether a VoiceOver user hears "Every year, last done…" or
 * "Every year middle dot last done…" is a real-device question. So is whether
 * the merged line still fits on one line at 375px.
 */
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 7, 8, 9, 0, 0)) // 8 August 2026
})
afterEach(() => vi.useRealTimers())

/** U+00B7 MIDDLE DOT, named so a copy-paste cannot quietly swap it for a bullet. */
const DOT = '·'

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

const normalise = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim()

/**
 * Every complete line of text in `<main>`: for each run of prose on the screen,
 * the innermost element that carries the whole of it.
 *
 * Written by hand rather than with `getByText` because the dot is going inside a
 * nested `<span>`, and `getByText` matches an element's *direct* text children
 * only — it would see "Every year last done 1 June 2024" with the dot missing
 * and report a failure that says nothing about the real state of the screen.
 * Working from `textContent` reads the line the way a person reads it, whatever
 * markup it is made of.
 *
 * Elements that merely wrap a line are dropped (a descendant carries the same
 * text), so what comes back is one entry per visible line, and a failure prints
 * the screen's actual sentences instead of "not found".
 */
function linesInMain(): string[] {
  const all = Array.from(screen.getByRole('main').querySelectorAll<HTMLElement>('*'))
  return all
    .filter((el) => normalise(el.textContent) !== '')
    .filter(
      (el) =>
        !all.some(
          (other) =>
            other !== el &&
            el.contains(other) &&
            normalise(other.textContent) === normalise(el.textContent),
        ),
    )
    .map((el) => normalise(el.textContent))
}

/**
 * The lines that match a pattern, as an array.
 *
 * Compared as an array rather than with `toContain` so a failure prints the
 * sentence that *is* on screen next to the one expected — "expected
 * [ 'Every 1 year' ] to equal [ 'Every year' ]" says what went wrong, where
 * "expected […(14)] to include 'Every year'" says only that something did.
 * Filtering also catches the line appearing twice, which `toContain` would not.
 */
const linesMatching = (pattern: RegExp) => linesInMain().filter((line) => pattern.test(line))

/**
 * Every unit, at a count of one and at three counts that are not one.
 *
 * 1 is the case the change is about; 2, 3 and 10 are the control. Without them,
 * "drop the count" and "drop the count only when it is 1" are indistinguishable
 * — and the first of those describes the user's schedule incorrectly.
 */
const INTERVALS: ReadonlyArray<[Interval, string]> = [
  [{ count: 1, unit: 'day' }, 'Every day'],
  [{ count: 1, unit: 'week' }, 'Every week'],
  [{ count: 1, unit: 'month' }, 'Every month'],
  [{ count: 1, unit: 'year' }, 'Every year'],
  [{ count: 2, unit: 'day' }, 'Every 2 days'],
  [{ count: 2, unit: 'week' }, 'Every 2 weeks'],
  [{ count: 2, unit: 'month' }, 'Every 2 months'],
  [{ count: 2, unit: 'year' }, 'Every 2 years'],
  [{ count: 3, unit: 'day' }, 'Every 3 days'],
  [{ count: 3, unit: 'week' }, 'Every 3 weeks'],
  [{ count: 3, unit: 'month' }, 'Every 3 months'],
  [{ count: 3, unit: 'year' }, 'Every 3 years'],
  [{ count: 10, unit: 'day' }, 'Every 10 days'],
  [{ count: 10, unit: 'week' }, 'Every 10 weeks'],
  [{ count: 10, unit: 'month' }, 'Every 10 months'],
  [{ count: 10, unit: 'year' }, 'Every 10 years'],
]

describe('how often the job comes round', () => {
  it.each(INTERVALS)('says %o as "%s"', async (interval, expected) => {
    // Never done on purpose: with no completion the line is the interval and
    // nothing else, so matching it whole also pins that a job with nothing to
    // join on carries no dot and no trailing separator.
    seed([anItem({ name: 'Boiler service', interval })])
    const { user } = launch()
    await openDetail(user, 'Boiler service')

    expect(linesMatching(/^Every\b/)).toEqual([expected])
  })

  it('says nothing else about a job that has never been done', async () => {
    seed([anItem({ name: 'Boiler service', interval: YEARLY })])
    const { user } = launch()
    await openDetail(user, 'Boiler service')

    expect(linesMatching(/^Every\b/)).toEqual(['Every year'])
    // Nothing to join to, so no "last done" half, and no due date invented from
    // a service that never happened (FR-004a).
    expect(linesMatching(/last done/i)).toEqual([])
    expect(linesMatching(/^Next due/)).toEqual([])
  })
})

describe('the interval and the last-done fact, on one line', () => {
  it('joins them with a middle dot', async () => {
    seed([
      anItem({ name: 'Boiler service', interval: YEARLY, completions: [aCompletion('2024-06-01')] }),
    ])
    const { user } = launch()
    await openDetail(user, 'Boiler service')

    expect(linesMatching(/^Every\b/)).toEqual([`Every year ${DOT} last done 1 June 2024`])
  })

  it('leaves the due date on its own line', async () => {
    // The merge is of two facts, not three. "Next due" is what the user opened
    // the app to find out, and it keeps a line to itself.
    seed([
      anItem({ name: 'Boiler service', interval: YEARLY, completions: [aCompletion('2024-06-01')] }),
    ])
    const { user } = launch()
    await openDetail(user, 'Boiler service')

    expect(linesMatching(/^Next due/)).toEqual(['Next due 1 June 2025'])
  })

  it('no longer states the last-done date as a sentence of its own', async () => {
    // The old line, capital L, standing alone. Its absence is the whole of the
    // change: an implementation that added the merged line and left this one
    // where it was would satisfy every assertion above.
    seed([
      anItem({ name: 'Boiler service', interval: YEARLY, completions: [aCompletion('2024-06-01')] }),
    ])
    const { user } = launch()
    await openDetail(user, 'Boiler service')

    expect(linesMatching(/^Last done/)).toEqual([])
  })

  it('keeps the count in the merged line when it is not 1', async () => {
    // The plural case of the merge. Both halves of the sentence change at once
    // here, which is where an implementation that special-cased the annual job
    // shows itself.
    seed([
      anItem({
        name: 'Bleed the radiators',
        interval: { count: 6, unit: 'month' },
        completions: [aCompletion('2025-06-01')],
      }),
    ])
    const { user } = launch()
    await openDetail(user, 'Bleed the radiators')

    expect(linesMatching(/^Every\b/)).toEqual([`Every 6 months ${DOT} last done 1 June 2025`])
  })
})
