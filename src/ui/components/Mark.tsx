import { MARK_BOX, MARK_LINECAP, MARK_LINEJOIN, MARK_SCALE, MARK_SHAPES, MARK_STROKE, roundedRectPath } from '../mark'

/**
 * The app's mark, in the header.
 *
 * ## It is the icon, small
 *
 * The same geometry, on the same ground, as `public/icons/*.png` — a teal tile
 * with the mark on it. That is deliberate and it is the point of drawing the
 * tile here rather than setting the shapes loose in the accent colour: the thing
 * beside the wordmark is recognisably the thing on the home screen, which is
 * most of what a mark is for.
 *
 * It also settles a smaller question. Every interactive thing in this app is
 * `--accent` — the Back control, the buttons, a notice's border — so a bare teal
 * glyph next to the title would be wearing the app's one affordance colour while
 * doing nothing. As a tile it reads as a badge instead.
 *
 * ## It says nothing
 *
 * `aria-hidden="true"`, and no `<title>`, no `role`, no label. The `h1` it sits
 * inside already says "my flat pal"; a mark that repeats it makes a screen
 * reader announce the app's name twice, and one that describes itself puts "A
 * flat, from above" in front of the name. Both were tried and both are what
 * `tests/ui/mark.test.tsx` fails on.
 *
 * `focusable="false"` is not decoration either: an `<svg>` is focusable by
 * default in some engines, and a focusable element inside an `aria-hidden`
 * subtree is the `aria-hidden-focus` violation axe reports.
 *
 * ## Where the colours are, and are not
 *
 * Not here. Principle V puts colour in `tokens.css`, so this file names classes
 * and `app.css` paints them. What *is* here is geometry — the transform, the
 * stroke width, the caps — because `scripts/generate-icons.mjs` has to draw the
 * identical shape into a PNG and no stylesheet reaches a PNG.
 */
export function Mark({ size = 28 }: { size?: number }) {
  const scale = (size * MARK_SCALE.header) / MARK_BOX
  const offset = (size - size * MARK_SCALE.header) / 2

  return (
    <svg
      className="mark"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      focusable="false"
    >
      {/* The tile. Rounded here and square in the icon files, because iOS and
          Android round a home-screen icon themselves and this one has nobody to
          round it. 22% of the side is roughly what they apply. */}
      <path className="mark__ground" d={roundedRectPath(0, 0, size, size, size * 0.22)} />
      <g
        className="mark__figure"
        transform={`translate(${offset} ${offset}) scale(${scale})`}
        strokeWidth={MARK_STROKE}
        strokeLinecap={MARK_LINECAP}
        strokeLinejoin={MARK_LINEJOIN}
      >
        {MARK_SHAPES.map((shape) => (
          <path
            key={shape.d}
            className={shape.paint === 'fill' ? 'mark__solid' : 'mark__outline'}
            d={shape.d}
          />
        ))}
      </g>
    </svg>
  )
}
