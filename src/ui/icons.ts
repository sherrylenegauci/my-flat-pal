/**
 * The tab icons, as geometry.
 *
 * ## Drawn in the mark's language, deliberately
 *
 * Same 100 x 100 box as `mark.ts`, same butt caps and round joins, same stroke
 * width of 10 — and, like the mark, one glyph drawn as an outline and another
 * filled solid.
 *
 * The mixture is not a lapse. A spanner has to be a *silhouette* to survive
 * 18px: drawn as an outline it is a thin ring on a stick, which reads as a
 * magnifying glass, and every outline version tried at size read as a curl
 * rather than a tool. A sofa is the opposite — filled, it becomes a lozenge on
 * two legs that could be a bench or a car; the internal lines are what make it
 * a sofa, so it has to be an outline. Both were rendered at 18px side by side
 * before this was settled, which is the only size that can settle it.
 *
 * Stroke 10 rather than 8, which is what the outline sofa was first drawn at:
 * against a solid spanner an 8 sofa looks like the pair belongs to a different
 * icon set. 10 makes the two read at the same weight in the bar.
 *
 * No colour here, for the same reason as `mark.ts`: `app.css` paints it, so the
 * icon takes the tab's colour and changes with `aria-current` without this file
 * knowing that current exists.
 *
 * ## Why a spanner and a sofa, and not two of a kind
 *
 * The two must be told apart at a glance and at 18px, which is a stronger
 * constraint than either being individually apt. A tool and a piece of furniture
 * differ in silhouette — one is a thin diagonal, the other a wide low block — so
 * they are distinguishable before either is recognised. Two glyphs from the same
 * family, a spanner and a screwdriver say, or a floor plan and a window, would
 * be a pair of small grey shapes.
 *
 * That rules out the floor plan, which was the obvious idea for rooms: it is a
 * square with lines inside it, and so is the app's own mark sitting in the
 * header directly above it. `mark.ts` also records the floor plan failing at
 * 48px when it was tried as the logo, which is more than twice this size.
 *
 * The icons repeat what the labels already say, which is the point — they are
 * `aria-hidden`, so a screen reader hears "Maintenance" once, and a sighted
 * thumb finds the right tab without reading.
 */

/** The side of the square these shapes are drawn in. Matches `mark.ts`. */
export const ICON_BOX = 100

/** Stroke width in icon-box units, for the shapes that are outlines. */
export const ICON_STROKE = 10

export interface IconShape {
  d: string
  paint: 'stroke' | 'fill'
}

/**
 * Maintenance — an open-ended spanner, lying at 45 degrees.
 *
 * Two filled shapes: a ring with a wedge bitten out of it facing up and to the
 * right, and a handle running down to the bottom-left with a rounded end. They
 * overlap, and the overlap is the join — nothing here draws the seam.
 *
 * ## Why solid, after three outline versions
 *
 * The first three were arcs: a 16-unit jaw across 260 degrees, then 18 across
 * 240, then a chunkier 13 across 230. At 96px each of them is a spanner. At
 * 18px, which is the only size this is ever drawn, all three read as a small
 * curl on a stick — the eye gets a thin ring and a line, and a thin ring on a
 * stick is a magnifying glass. What a spanner needs at that size is mass and a
 * mouth: an unmistakable notch cut out of something solid.
 *
 * The wedge is 80 degrees. Narrower and it closes up at 18px; wider and the
 * head stops reading as a closed ring at all.
 */
const SPANNER: readonly IconShape[] = [
  // The head. Outer arc the long way round, then back along the inner one, so
  // the ring is hollow and the bite is the gap between the two arc ends.
  { d: 'M 85.9 33.1 A 22 22 0 1 1 65.9 13.1 L 65 24 A 11 11 0 1 0 75 34 Z', paint: 'fill' },
  // The handle: a bar of constant width with a half-round cap at the far end.
  { d: 'M 57.3 48.3 L 25.3 80.3 A 7.5 7.5 0 0 1 14.7 69.7 L 46.7 37.7 Z', paint: 'fill' },
]

/**
 * Rooms — a sofa, seen straight on.
 *
 * Three strokes and two legs. The back sits *behind* and narrower than the seat,
 * which is what separates a sofa from a plain box: the two rectangles overlap,
 * and the overlap is what the eye reads as depth. Drawn back-first so the seat's
 * stroke covers the join.
 */
const SOFA: readonly IconShape[] = [
  // The back.
  { d: 'M 26 44 V 30 A 8 8 0 0 1 34 22 H 66 A 8 8 0 0 1 74 30 V 44', paint: 'stroke' },
  // The seat and both arms, as one outline.
  { d: 'M 14 68 V 50 A 8 8 0 0 1 30 50 V 56 H 70 V 50 A 8 8 0 0 1 86 50 V 68 Z', paint: 'stroke' },
  // The legs.
  { d: 'M 24 68 V 78', paint: 'stroke' },
  { d: 'M 76 68 V 78', paint: 'stroke' },
]

/**
 * The icon for each area, keyed by the same ids `navigation.ts` uses.
 *
 * A record rather than a field on `Area`, so that the area list stays a
 * description of the app's structure and does not carry drawings around.
 */
export const AREA_ICONS: Record<string, readonly IconShape[]> = {
  maintenance: SPANNER,
  rooms: SOFA,
}
