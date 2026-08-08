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

export interface Navigation {
  view: View
  /** True when there is somewhere to go back to — drives the back control. */
  canGoBack: boolean
  go: (view: View) => void
  back: () => void
}

const ROOT: View = { name: 'schedule' }

export function useNavigation(): Navigation {
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

  return { view, canGoBack: stack.length > 1, go, back }
}
