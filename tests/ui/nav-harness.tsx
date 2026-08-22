import { screen } from '@testing-library/react'
import { AREAS, useNavigation, type Area } from '../../src/ui/navigation'

/**
 * The caller's-eye view of `useNavigation`, shared by the three 005 navigation
 * files (`navigation-areas`, `navigation-reset`, `navigation-history`).
 *
 * Extracted rather than copied three times, on the same rule `seed.ts` and
 * `keyboard.ts` were extracted under: a shared helper appears when a second
 * concrete use exists. The three files are still independent — they share a
 * harness, not state — so they remain the separate `[P]` files tasks.md marks
 * them as.
 *
 * `useNavigation` is a hook, and a hook has no interface until something
 * renders it. This is the smallest something: it renders what the hook returns
 * as text and as controls, and every assertion in the three files goes through
 * that text and those controls. It stands in for the tab bar T007 builds, in
 * the same way `tests/ui/navigation.test.tsx` already stands in for the header.
 */

/**
 * A second area, invented here.
 *
 * **Rooms is not built.** 003 builds it, and `AREAS` in `src/ui/navigation.ts`
 * deliberately holds only maintenance until it is — so anything needing two
 * areas has to supply the second itself. Nothing about that is a workaround:
 * `useNavigation` takes the areas as a parameter and does not care what an
 * area's root view is. It only ever puts that view at the bottom of the area's
 * stack.
 *
 * Its root is borrowed from maintenance's own `new` view purely so that the two
 * areas' first screens are *distinguishable on screen*. Given both roots named
 * `schedule`, "you were taken to the other area's first screen" and "nothing
 * happened" would render identically, and a test that cannot tell those apart
 * is not checking FR-003. It is not a claim that rooms opens on a form.
 */
export const ROOMS: Area = { id: 'rooms', label: 'Rooms', root: { name: 'new' } }

export function Harness({ areas = AREAS }: { areas?: readonly Area[] }) {
  const nav = useNavigation(areas)

  return (
    <main>
      <p>area: {nav.area}</p>
      <p>view: {nav.view.name}</p>

      {/* FR-007 / spec Edge Cases: there is nothing above an area's first
          screen, so the control is not drawn there. `canGoBack` is only ever
          observed through its presence or absence, never read as a value. */}
      {nav.canGoBack && (
        <button type="button" onClick={nav.back}>
          Back
        </button>
      )}

      <button type="button" onClick={() => nav.go({ name: 'detail', itemId: 'itm_1' })}>
        Open a job
      </button>
      <button type="button" onClick={() => nav.go({ name: 'edit', itemId: 'itm_1' })}>
        Edit the job
      </button>

      {/* One control per area, named by the area — which is what a tab is. */}
      {areas.map((area) => (
        <button key={area.id} type="button" onClick={() => nav.switchTo(area.id)}>
          {area.label}
        </button>
      ))}
    </main>
  )
}

/**
 * Where the user is, read off the screen.
 *
 * Returned as one object so a failure reports both halves together —
 * `{ area: 'maintenance', view: 'detail' }` against an expected
 * `{ area: 'rooms', view: 'new' }` says "you are in the wrong area, looking at
 * the wrong screen" in one line, where two separate `getByText` misses would
 * only ever report the first.
 */
export function shown(): { area: string; view: string } {
  const read = (prefix: string) =>
    (screen.getByText(new RegExp(`^${prefix}: `)).textContent ?? '').slice(prefix.length + 2)

  return { area: read('area'), view: read('view') }
}

/** The in-app back control, or null when the app is not offering one. */
export const backControl = () => screen.queryByRole('button', { name: 'Back' })
