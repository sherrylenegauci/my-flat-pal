import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useNavigation } from '../../src/ui/navigation'

/**
 * T036 — getting back.
 *
 * Two mechanisms, because verification (T011) showed neither covers both
 * platforms:
 *
 *   - **An in-app back control.** iOS has no system back button, and whether
 *     the edge-swipe works in a standalone web app is inconsistent across
 *     versions. Without a control the app draws itself, an iOS user who opens
 *     a job's detail can be stranded with no way out but to kill the app.
 *   - **History integration.** Android's back gesture *is* live in an installed
 *     app, and with no history entries it closes the app instead of going back.
 *
 * Asserted through what the user sees, not by inspecting `history.pushState`
 * calls — Principle III forbids tests that assert implementation detail, and an
 * earlier version of this task did exactly that.
 */
function Harness() {
  const nav = useNavigation()

  return (
    <div>
      <p>view: {nav.view.name}</p>
      {nav.canGoBack && (
        <button type="button" onClick={nav.back}>
          Back
        </button>
      )}
      <button type="button" onClick={() => nav.go({ name: 'detail', itemId: 'itm_1' })}>
        Open detail
      </button>
      <button type="button" onClick={() => nav.go({ name: 'new' })}>
        Add job
      </button>
    </div>
  )
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('in-app back control', () => {
  it('is absent on the schedule, which is the root', () => {
    render(<Harness />)
    expect(screen.getByText('view: schedule')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })

  it('appears once you are below the root', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Open detail' }))

    expect(screen.getByText('view: detail')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy()
  })

  it('returns to the schedule when used', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Open detail' }))
    await user.click(screen.getByRole('button', { name: 'Back' }))

    // `findBy`, not `getBy`. `nav.back()` calls `history.back()`, and jsdom
    // delivers `popstate` on a later turn of the event loop than the click
    // `userEvent` awaits — so a synchronous assertion here is a race that
    // happens to be won on a fast module graph and lost on a slower one. It was
    // lost for the first time when the room work was merged in, which changed
    // nothing in `src/ui` and only made the suite bigger.
    expect(await screen.findByText('view: schedule')).toBeTruthy()
  })
})

describe('platform back gesture', () => {
  it('returns to the schedule from a detail view', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Open detail' }))

    // What Android's back gesture produces.
    await act(async () => {
      window.history.back()
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    })

    expect(screen.getByText('view: schedule')).toBeTruthy()
  })

  it('creates one history entry per navigation, so each gesture goes back one step', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Open detail' }))
    await user.click(screen.getByRole('button', { name: 'Add job' }))
    expect(screen.getByText('view: new')).toBeTruthy()

    // Two gestures should walk back two steps, which only holds if each
    // navigation pushed its own entry. Asserting this behaviourally rather
    // than by reading `history.length`: that counter does not simply grow —
    // pushing after a back() truncates the forward entries and leaves it
    // unchanged — so it is a misleading thing to assert against.
    for (const expected of ['detail', 'schedule']) {
      await act(async () => {
        window.history.back()
        window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
      })
      expect(screen.getByText(`view: ${expected}`)).toBeTruthy()
    }
  })

  it('stops at the schedule rather than unwinding past it', async () => {
    // One more gesture at the root is where a real device would leave the app.
    // The app must not end up in a broken state trying to pop an empty stack.
    render(<Harness />)

    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    })

    expect(screen.getByText('view: schedule')).toBeTruthy()
  })
})

describe('navigating between views', () => {
  it('carries the identifier a view needs', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Open detail' }))
    expect(screen.getByText('view: detail')).toBeTruthy()
  })

  it('handles more than one level down', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Open detail' }))
    await user.click(screen.getByRole('button', { name: 'Add job' }))
    expect(screen.getByText('view: new')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Back' }))
    // Async for the same reason as above — `popstate` arrives after the click.
    expect(await screen.findByText('view: detail')).toBeTruthy()
  })
})
