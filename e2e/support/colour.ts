/**
 * WCAG contrast maths, done in Node against colours the *browser* resolved.
 *
 * The split matters. The browser does the only part it can do and Node cannot:
 * resolving the cascade, custom properties, inheritance and `currentColor` into
 * concrete `rgb()` strings. Node then does the arithmetic, where it is readable
 * and where a wrong answer shows up as a wrong number rather than as a silently
 * skipped check.
 *
 * Everything here **throws rather than returns a default**. A colour this module
 * cannot resolve is not a colour that passes — it is a check that did not run,
 * and a check that did not run must never read as a check that passed. That is
 * the failure mode `tests/ui/axe-helper.ts` was written to avoid in jsdom, and
 * it applies just as much here.
 */

export interface Rgba {
  r: number
  g: number
  b: number
  /** 0–1. */
  a: number
}

/**
 * Parse a computed colour string.
 *
 * Computed styles serialise to `rgb()` / `rgba()` in both engines we run, but
 * the modern space-separated form and `color(srgb ...)` are accepted too so a
 * browser update cannot turn this into a silent skip. Anything else throws.
 */
export function parseCssColour(input: string, context: string): Rgba {
  const value = input.trim().toLowerCase()

  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }

  const rgbMatch = /^rgba?\((.+)\)$/.exec(value)
  if (rgbMatch?.[1]) {
    const parts = rgbMatch[1].split(/[\s,/]+/).filter((p) => p !== '')
    const channels = parts.slice(0, 3).map((p) => channelToByte(p, context))
    const alphaPart = parts[3]
    const alpha = alphaPart === undefined ? 1 : toAlpha(alphaPart, context)
    const [r, g, b] = channels
    if (r === undefined || g === undefined || b === undefined) {
      throw new Error(`Cannot parse colour "${input}" (${context})`)
    }
    return { r, g, b, a: alpha }
  }

  const srgbMatch = /^color\(srgb (.+)\)$/.exec(value)
  if (srgbMatch?.[1]) {
    const parts = srgbMatch[1].split(/[\s/]+/).filter((p) => p !== '')
    const channels = parts.slice(0, 3).map((p) => Math.round(Number(p) * 255))
    const alphaPart = parts[3]
    const alpha = alphaPart === undefined ? 1 : toAlpha(alphaPart, context)
    const [r, g, b] = channels
    if (r === undefined || g === undefined || b === undefined || channels.some(Number.isNaN)) {
      throw new Error(`Cannot parse colour "${input}" (${context})`)
    }
    return { r, g, b, a: alpha }
  }

  throw new Error(
    `Cannot parse the computed colour "${input}" (${context}). ` +
      'Refusing to guess: an unparsed colour would make this contrast check ' +
      'pass without checking anything.',
  )
}

function channelToByte(part: string, context: string): number {
  const asPercent = /^([\d.]+)%$/.exec(part)
  const n = asPercent?.[1] !== undefined ? (Number(asPercent[1]) / 100) * 255 : Number(part)
  if (Number.isNaN(n)) throw new Error(`Cannot parse colour channel "${part}" (${context})`)
  return Math.round(n)
}

function toAlpha(part: string, context: string): number {
  const asPercent = /^([\d.]+)%$/.exec(part)
  const n = asPercent?.[1] !== undefined ? Number(asPercent[1]) / 100 : Number(part)
  if (Number.isNaN(n)) throw new Error(`Cannot parse colour alpha "${part}" (${context})`)
  return n
}

/** Paint `top` over `bottom`. `bottom` is assumed opaque enough to matter. */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a + bottom.a * (1 - top.a)
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 }
  const mix = (t: number, b: number) => (t * top.a + b * bottom.a * (1 - top.a)) / a
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a }
}

/**
 * Flatten a stack of background layers into one opaque colour.
 *
 * `layers` runs from the element outwards to `<html>`, which is the order the
 * DOM walk produces; painting order is the reverse, so the fold starts at the
 * root. Throws if the result is still translucent — that means nothing in the
 * ancestor chain is opaque and the real on-screen colour is unknown.
 */
export function flattenBackground(layers: Rgba[], context: string): Rgba {
  let result: Rgba = { r: 0, g: 0, b: 0, a: 0 }
  for (const layer of [...layers].reverse()) {
    result = composite(layer, result)
  }

  if (result.a < 0.999) {
    throw new Error(
      `Could not resolve an opaque background behind ${context} ` +
        `(composited alpha ${result.a.toFixed(3)}). ` +
        'Failing loudly rather than assuming white.',
    )
  }

  return { ...result, a: 1 }
}

/** WCAG 2.1 relative luminance. */
export function relativeLuminance({ r, g, b }: Rgba): number {
  const channel = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/**
 * WCAG 2.1 contrast ratio. Both arguments must already be opaque — a
 * translucent foreground is composited by the caller, which knows what it sits
 * on.
 */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [light, dark] = la > lb ? [la, lb] : [lb, la]
  return (light + 0.05) / (dark + 0.05)
}

export function describeColour({ r, g, b, a }: Rgba): string {
  const round = (n: number) => Math.round(n)
  return a >= 0.999
    ? `rgb(${round(r)}, ${round(g)}, ${round(b)})`
    : `rgba(${round(r)}, ${round(g)}, ${round(b)}, ${a.toFixed(2)})`
}

/**
 * WCAG 1.4.3's large-text threshold: 18pt (24px), or 14pt (18.66px) bold.
 * Large text needs 3:1; everything else needs 4.5:1.
 */
export function requiredTextRatio(fontSizePx: number, fontWeight: number): number {
  const isLarge = fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700)
  return isLarge ? 3 : 4.5
}
