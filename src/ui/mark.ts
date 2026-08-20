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
 * `tests/build/icon-assets.test.ts`, which reads the generated pixels and
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
 * the canvas. `tests/build/icon-assets.test.ts` checks the pixels rather than
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
 * Candidate A — **the block**.
 *
 * The building a flat is in, seen straight on: three storeys, and a way in at
 * street level.
 *
 * ## Why this idea rather than a house
 *
 * A house is the obvious mark and the icon this replaces proves how dull it can
 * be. The specific thing a house gets wrong here is that the app is called *my
 * flat pal*, and a flat is precisely the dwelling that is not a house — it is
 * one of several in a shared building. Drawing the building says that in one
 * shape without a caption.
 *
 * It also ages in the right direction. The constitution's Technology Constraints
 * record a 3D room designer as planned, and LLM decor suggestions before that,
 * so maintenance will not stay the whole of this app. A spanner or a calendar
 * would be a mark for the first feature; a building is a mark for the subject.
 *
 * ## Why it survives 48px
 *
 * Four straight strokes, one gap, and nothing smaller than a sixteenth of the
 * box. Rendered at the 48px a home screen uses, the walls are about 3.4px and
 * the doorway about 5px — measured off the generated PNG rather than reasoned
 * about, in `~/Desktop/my-flat-pal-mark/`.
 *
 * ## What was built and rejected
 *
 * A floor plan — outer walls, one internal wall, a doorway gap — was drawn and
 * screenshotted alongside this. It is the best idea of the three for where the
 * app is going, because it is about interiors. It was dropped anyway: at 48px it
 * stops reading as a plan and becomes an abstract glyph, and "simple enough to
 * survive being small" is the constraint that decides this rather than
 * aptness. The screenshot is kept so the judgement can be disagreed with.
 */
export const MARK_SHAPES: readonly MarkShape[] = [
  // The outer walls, drawn as one open path so the entrance is a gap in the
  // line rather than a shape sitting on top of it. Starts at the near side of
  // the doorway, runs anticlockwise all the way round, stops at its far side.
  { d: 'M 42 95 L 15 95 L 15 5 L 85 5 L 85 95 L 58 95', paint: 'stroke' },
  // The two floors. They run to 10 and 90 rather than to the wall centrelines,
  // so they finish flush with the building's silhouette instead of leaving a
  // five-unit nick at each end.
  { d: 'M 10 35 H 90', paint: 'stroke' },
  { d: 'M 10 65 H 90', paint: 'stroke' },
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
