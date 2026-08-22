import { useCallback, useEffect, useState } from 'react'

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

const ROOT: View = { name: 'schedule' }

export function useNavigation(areas: readonly Area[] = AREAS): Navigation {
  const [stack, setStack] = useState<View[]>([ROOT])

  const go = useCallback((view: View) => {
    setStack((current) => [...current, view])
    // The entry is what stops Android's gesture closing the app. The state
    // payload is deliberately trivial — the stack above is the source of truth.
    window.history.pushState({ depth: Date.now() }, '')
  }, [])

  const back = useCallback(() => {
    // Going through the browser rather than popping directly keeps the two
    // routes — the in-app control and the platform gesture — on one path, so
    // they cannot drift apart.
    window.history.back()
  }, [])

  useEffect(() => {
    const onPopState = () => {
      setStack((current) => (current.length > 1 ? current.slice(0, -1) : current))
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const view = stack[stack.length - 1] ?? ROOT

  // STUB (T003–T005 are written against this and must fail here first).
  void areas
  const switchTo = useCallback((_area: AreaId) => {}, [])

  return { view, area: 'maintenance', canGoBack: stack.length > 1, go, back, switchTo }
}
