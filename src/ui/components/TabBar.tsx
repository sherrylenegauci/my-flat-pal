import type { Area, AreaId } from '../navigation'

/**
 * The app's top-level structure (005): a row of areas along the bottom edge.
 *
 * Constitution IV requires a single structure every feature is reachable from,
 * and this is it. The only new component the feature adds.
 *
 * ## Nothing at all when there is one area (FR-008)
 *
 * Not an empty bar, not a bar of one. A tab bar with a single tab is a
 * permanent strip of a small screen spent on a choice that does not exist, and
 * the list it sits under has about 44px of headroom on the promise SC-002
 * makes. It is also what lets this ship before rooms exists without changing
 * anything a user sees.
 *
 * ## A navigation landmark of buttons, not `role="tablist"`
 *
 * The word "tab" in the specification is about what it looks like, and the ARIA
 * tab pattern is a different contract: it implies a tabpanel for each tab and
 * arrow-key navigation with a roving `tabindex`, and a half-implemented version
 * of it announces a promise the app does not keep. What is here instead is a
 * named landmark holding real buttons, each reachable by Tab and by a VoiceOver
 * swipe with no extra machinery, and `aria-current="page"` on the one you are
 * in — which is announced as current without claiming anything about panels.
 *
 * Whether VoiceOver's announcement is *good* is not something any tier here can
 * hear. That is T022, on a real iPhone.
 *
 * ## Current is marked by more than colour (FR-004)
 *
 * Weight and an indicator edge, both in `app.css`, keyed off the same
 * `aria-current` this sets — so the visible marking and the announced one
 * cannot drift apart. The edge is a border rather than a shadow deliberately:
 * `e2e/rendering/colour-independence.spec.ts` flattens colour by forcing
 * `box-shadow: none`, so an indicator drawn as a shadow would vanish under
 * exactly the check that is supposed to prove it survives.
 */
export function TabBar({
  areas,
  current,
  onSelect,
}: {
  areas: readonly Area[]
  current: AreaId
  onSelect: (area: AreaId) => void
}) {
  if (areas.length < 2) return null

  return (
    <nav className="tab-bar" aria-label="Areas">
      {areas.map((area) => (
        <button
          key={area.id}
          type="button"
          className="tab-bar__tab"
          aria-current={area.id === current ? 'page' : undefined}
          onClick={() => onSelect(area.id)}
        >
          {area.label}
        </button>
      ))}
    </nav>
  )
}
