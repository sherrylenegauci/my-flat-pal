import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * In-app navigation, backed by the History API.
 *
 * No routing library: three views, no deep-linking, and nobody shares a URL
 * into a personal app. But history integration is not optional, for two
 * platform reasons that verification (T011) pinned down:
 *
 *   - **Android**: the system back gesture is live in an installed standalone
 *     app. With no history entries it closes the app, so a user who opens a
 *     job and swipes back gets ejected rather than returned.
 *   - **iOS**: there is no system back button, and the edge-swipe is
 *     inconsistent in standalone web apps across versions. So the app must
 *     also draw its own back control — `canGoBack` is what tells a view to
 *     render one.
 *
 * The stack lives in React state rather than being read back out of
 * `history.state`, so the app never depends on the browser preserving anything
 * for it.
 */
export type View =
  | { name: 'schedule' }
  | { name: 'detail'; itemId: string }
  | { name: 'new' }
  | { name: 'edit'; itemId: string }

/**
 * A top-level part of the app (005, FR-001).
 *
 * `rooms` is named here and is deliberately **not** in `AREAS` below: the type
 * says what the app is going to be, the list says what it is. 003 builds rooms
 * and adds it to the list, and that single line is what turns the tab bar on.
 */
export type AreaId = 'maintenance' | 'rooms'

export interface Area {
  readonly id: AreaId
  /** What the tab says, and what a screen reader announces. */
  readonly label: string
  /** The screen an area opens at, every time it is entered (FR-003). */
  readonly root: View
}

export const MAINTENANCE: Area = {
  id: 'maintenance',
  label: 'Maintenance',
  root: { name: 'schedule' },
}

/**
 * The areas that exist today. One.
 *
 * FR-008 hides the structure while this has a single entry, so adding rooms to
 * it before there is a rooms screen would put a tab on the screen that leads
 * nowhere. `tests/ui/tab-bar-hidden.test.tsx` fails the moment a second entry
 * appears here without a screen behind it.
 */
export const AREAS: readonly Area[] = [MAINTENANCE]

export interface Navigation {
  view: View
  /** Which area the user is in — what the bar marks as current (FR-004). */
  area: AreaId
  /** True when there is somewhere to go back to — drives the back control. */
  canGoBack: boolean
  go: (view: View) => void
  back: () => void
  /** Move to another area, at that area's first screen (FR-002, FR-003). */
  switchTo: (area: AreaId) => void
}

/**
 * What each `pushState` records.
 *
 * `area` is the honest part: the entry belongs to whichever area the user was
 * in when it was made, and `popstate` hands the app the *destination* entry's
 * payload, so this is how a gesture can be told to be walking off the bottom of
 * the current area's entries rather than up within them.
 */
interface HistoryEntry {
  area: AreaId
}

function entryArea(state: unknown): AreaId | undefined {
  if (typeof state !== 'object' || state === null) return undefined
  const area = (state as Partial<HistoryEntry>).area
  return area === 'maintenance' || area === 'rooms' ? area : undefined
}

interface NavigationState {
  area: AreaId
  /** One stack per area, keyed by id (005 plan § D2). */
  stacks: Record<string, View[]>
}

export function useNavigation(areas: readonly Area[] = AREAS): Navigation {
  const first = areas[0] ?? MAINTENANCE

  const [state, setState] = useState<NavigationState>(() => ({
    area: first.id,
    stacks: Object.fromEntries(areas.map((area) => [area.id, [area.root]])),
  }))

  /**
   * The current area, readable from an event handler without making every
   * handler depend on it.
   *
   * Kept in step by an effect rather than written during render: an effect runs
   * after commit, so by the time anyone can tap anything this holds what is on
   * screen, and StrictMode's double render cannot make it disagree with itself.
   */
  const areaRef = useRef(state.area)
  useEffect(() => {
    areaRef.current = state.area
  }, [state.area])

  const go = useCallback((view: View) => {
    // The entry is what stops Android's gesture closing the app. The payload is
    // still deliberately thin — the stacks above are the source of truth — but
    // it now carries the area, for the reason on `HistoryEntry`.
    //
    // Outside the updater, deliberately. A `pushState` inside one would fire
    // twice under StrictMode, which double-invokes updaters to smoke out
    // exactly this: 001 shipped a bug that added every job twice because a
    // side effect sat where a pure function was expected.
    window.history.pushState({ area: areaRef.current } satisfies HistoryEntry, '')
    setState((current) => {
      const stack = current.stacks[current.area] ?? []
      return { ...current, stacks: { ...current.stacks, [current.area]: [...stack, view] } }
    })
  }, [])

  const back = useCallback(() => {
    // Going through the browser rather than popping directly keeps the two
    // routes — the in-app control and the platform gesture — on one path, so
    // they cannot drift apart.
    window.history.back()
  }, [])

  /**
   * Sideways (FR-002), and always to that area's first screen (FR-003).
   *
   * The reset is what the spec asked for over remembering a position per area:
   * simpler, and it means a user cannot return to a screen whose underlying
   * data has since been deleted.
   *
   * **No history entry is pushed here, and that is a decision.** Tabs go
   * sideways and back goes up (FR-007), so a switch is not something to go back
   * *from*: at an area's first screen the gesture does what it does at the
   * schedule today, which on Android is to leave the app (001, T011). The cost
   * is that entries left behind by a deep screen the reset discarded are stale,
   * and each swallows one gesture before the app closes. Clearing them would
   * mean `history.go(-n)`, which is asynchronous and fires its own `popstate` —
   * a race in exchange for a wart.
   */
  const switchTo = useCallback(
    (id: AreaId) => {
      setState((current) => {
        const target = areas.find((area) => area.id === id)
        if (target === undefined) return current

        const stack = current.stacks[id] ?? [target.root]
        // Already there, already at the top: no new state, so nothing
        // re-renders and nothing is torn down (US1 acceptance scenario 4).
        if (current.area === id && stack.length <= 1) return current

        return { area: id, stacks: { ...current.stacks, [id]: [target.root] } }
      })
    },
    [areas],
  )

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const destination = entryArea(event.state)

      setState((current) => {
        const stack = current.stacks[current.area] ?? []
        if (stack.length <= 1) return current

        /**
         * Landing on another area's entry means this area's own entries are
         * spent, so there is nothing above its first screen to return to — the
         * user must not be handed the screen that entry belonged to (FR-007).
         *
         * **Belt and braces, and worth saying so.** An area's entries are
         * contiguous at the top of the history, because only `go` pushes and
         * only ever in the current area, so this branch can be reached only
         * when the stack is already at its root and the guard above has
         * returned. It is kept because the invariant it defends is one line
         * away from being broken — by `switchTo` pushing an entry, or by stacks
         * being preserved across a switch instead of reset — and neither change
         * would look like it was about the back gesture.
         */
        const next =
          destination !== undefined && destination !== current.area
            ? stack.slice(0, 1)
            : stack.slice(0, -1)

        return { ...current, stacks: { ...current.stacks, [current.area]: next } }
      })
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const stack = state.stacks[state.area] ?? [first.root]
  const view = stack[stack.length - 1] ?? first.root

  return {
    view,
    area: state.area,
    canGoBack: stack.length > 1,
    go,
    back,
    switchTo,
  }
}
