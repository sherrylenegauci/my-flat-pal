/**
 * The app's mark, as geometry.
 *
 * ## Why this is data rather than a drawing
 *
 * The mark appears in two places that no stylesheet spans: the header, drawn as
 * inline SVG by `components/Mark.tsx`, and `public/icons/*.png`, rasterised by
 * `scripts/generate-icons.mjs`. Those two used to have nothing in common at all
 * — the icons were a white house on near-black, drawn in the *first* palette and
 * left there through two complete design passes, because no stylesheet touches a
 * PNG and no test tier read one. That is the same drift that left the manifest's
 * `theme_color` two palettes stale.
 *
 * One geometry, imported by both, is the fix for half of that. The other half is
 * `tests/assets/icons.test.ts`, which reads the generated pixels and
 * compares them against `tokens.css` — so a palette change that is not followed
 * by a re-run of the script turns the suite red instead of shipping.
 *
 * The script imports this file directly: Node 24 strips the types, so there is
 * no build step and no second copy of these numbers.
 *
 * ## The coordinate system
 *
 * Everything is expressed in a 100 x 100 box. Strokes are centred on the path,
 * so a path drawn at 5 with `MARK_STROKE` of 10 has its outer edge exactly on 0
 * — which is why nothing here goes outside 5..95.
 *
 * Consumers scale that box into whatever canvas they have. They do not all use
 * the same fraction of it, and the reason is Android: a maskable icon is cropped
 * to an arbitrary shape and only the inner 80% is guaranteed to survive. A
 * centred square of side s has its corners at s x root(2) / 2 from the centre,
 * so it fits inside that 80%-diameter circle only while s stays under 56.6% of
 * the canvas. `tests/assets/icons.test.ts` checks the pixels rather than
 * trusting this paragraph.
 *
 * ## No colour lives here
 *
 * Principle V puts colour in `tokens.css` and nowhere else. The component paints
 * these shapes through classes in `app.css`; the icon script reads the same two
 * custom properties out of `tokens.css` by name. Neither carries a literal.
 */

/** The side of the square these shapes are drawn in. */
export const MARK_BOX = 100

/** Stroke width for `paint: 'stroke'` shapes, in mark-box units. */
export const MARK_STROKE = 10

/**
 * Butt caps, not square ones.
 *
 * The outer wall is drawn as one open path so that the front door is a *gap in
 * the line*. A square cap extends each end by half the stroke, which would eat
 * ten units out of a thirty-unit doorway and leave it barely visible at 48px.
 * Geometry rather than colour, so it lives here with the rest of the shape and
 * not in `app.css` — both consumers need the same answer.
 */
export const MARK_LINECAP = 'butt'
export const MARK_LINEJOIN = 'round'

export interface MarkShape {
  /** SVG path data, in mark-box units. */
  d: string
  /**
   * `stroke` draws the path as a line of `MARK_STROKE`; `fill` fills it solid.
   * Both use the same single colour — the mark is one colour on one ground, so
   * that it survives being small and cannot fall out of step with itself.
   */
  paint: 'stroke' | 'fill'
}

/**
 * Candidate B — **the window**.
 *
 * A four-pane window sitting on its sill.
 *
 * ## Why this idea rather than a house
 *
 * A house is the obvious mark and the icon this replaces proves how dull it can
 * be. A window is the one piece of a home that is unmistakably domestic without
 * being a whole dwelling — it says *inside* and *outside* at once, and it is the
 * same object whether the flat is a Victorian conversion or a new-build, which
 * a roofline is not.
 *
 * It also ages in the right direction. The constitution's Technology Constraints
 * record a 3D room designer as planned, and LLM decor suggestions before that,
 * so maintenance will not stay the whole of this app. A spanner or a calendar
 * would be a mark for the first feature; a window belongs to the room the
 * designer will eventually draw as much as to the sash that needs painting.
 *
 * ## Why it survives 48px
 *
 * Four shapes, all of them large, arranged symmetrically — the arrangement that
 * degrades most gracefully, because losing detail leaves a smaller version of
 * the same thing rather than a lopsided one. The sill is what stops it reading
 * as a grid or a table at the smallest size, and it costs one flat bar.
 *
 * ## What was built and rejected
 *
 * A version with the top-left pane filled solid — the light on in one room — was
 * drawn and screenshotted. It is a warmer idea and at 512px it works. It was
 * dropped because at 48px the filled pane merges into the frame beside it and
 * the window stops looking symmetrical without looking like anything else, and
 * because a highlighted cell in a grid is what a spreadsheet does.
 *
 * A floor plan was also drawn: the best of the ideas for where the app is going,
 * since it is about interiors, and the worst small — at 48px it stops reading as
 * a plan and becomes an abstract glyph. The screenshots are kept so both
 * judgements can be disagreed with.
 */
export const MARK_SHAPES: readonly MarkShape[] = [
  // The frame.
  { d: 'M 12 10 H 88 V 74 H 12 Z', paint: 'stroke' },
  // The mullion and the transom, drawn as two separate strokes rather than one
  // cross, so each meets the frame at both ends.
  { d: 'M 50 10 V 74', paint: 'stroke' },
  { d: 'M 12 42 H 88', paint: 'stroke' },
  // The sill. Wider than the frame, because a sill that stopped at the reveal
  // would read as a fifth pane; rounded, because it is the one shape here that
  // is a solid object rather than a line.
  { d: roundedRectPath(4, 84, 92, 10, 3), paint: 'fill' },
]

/**
 * A rounded-rectangle path, for consumers that want the mark's ground drawn as
 * a tile rather than full-bleed.
 *
 * The header draws the tile; the icons do not, because iOS and Android round
 * the corners of a home-screen icon themselves and a second radius inside
 * theirs reads as a mistake.
 */
export function roundedRectPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): string {
  const r = Math.min(radius, width / 2, height / 2)
  return [
    `M ${x + r} ${y}`,
    `H ${x + width - r}`,
    `A ${r} ${r} 0 0 1 ${x + width} ${y + r}`,
    `V ${y + height - r}`,
    `A ${r} ${r} 0 0 1 ${x + width - r} ${y + height}`,
    `H ${x + r}`,
    `A ${r} ${r} 0 0 1 ${x} ${y + height - r}`,
    `V ${y + r}`,
    `A ${r} ${r} 0 0 1 ${x + r} ${y}`,
    'Z',
  ].join(' ')
}

/**
 * How much of a canvas the mark box occupies, per surface.
 *
 * `maskable` is the load-bearing one and it is under the 56.6% ceiling the
 * header comment derives. The other two are chosen to look right rather than to
 * satisfy a constraint.
 */
export const MARK_SCALE = {
  header: 0.66,
  icon: 0.7,
  maskable: 0.52,
} as const
