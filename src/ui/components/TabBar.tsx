import type { Area, AreaId } from '../navigation'

/**
 * The app's top-level structure (005, FR-001) — the row of areas along the
 * bottom edge.
 *
 * STUB. `tests/ui/tab-bar.test.tsx` and `tests/ui/tab-current.test.tsx` are
 * written against this signature and must fail against this body first.
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
  void areas
  void current
  void onSelect
  return null
}
