/**
 * Browser-side probes.
 *
 * Each exported function is passed to `page.evaluate`, which serialises it and
 * runs it inside the page. That has one hard consequence: **every function here
 * must be entirely self-contained.** It cannot reference module-scope helpers,
 * imports, or anything from the enclosing closure, because none of that exists
 * on the other side. Helpers are therefore declared inside each function body,
 * duplicated where necessary, on purpose.
 *
 * These functions read; they never judge. They pull raw resolved values out of
 * the engine — computed styles, geometry, background chains — and hand them back
 * for Node to assert on. Anything a probe cannot resolve is reported as such,
 * so the assertion can fail loudly rather than quietly skipping.
 */

/** A background layer read off one element in an ancestor chain. */
export interface BackgroundLayer {
  colour: string
  /** Non-`none` means the painted colour cannot be derived from colour alone. */
  image: string
  /** Below 1 means the element's whole subtree is blended; unresolvable here. */
  opacity: number
  element: string
}

/** A rectangle in viewport coordinates, the same frame `getBoundingClientRect` uses. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Where an element's background image actually lands — if that can be
 * established at all.
 *
 * The distinction this type exists to make: an element painting an image does
 * not by itself make the colour under some *particular* region unknowable. A
 * 12x8 arrow pinned to the right-hand edge of a dropdown cannot be under a focus
 * ring hugging the left edge, and a check that refused to measure there would be
 * refusing on a fact it has not established.
 *
 * `unbounded` is the honest answer whenever the painted area cannot be derived
 * from the computed values: a gradient (no intrinsic size, fills its whole
 * positioning area), any repeat, `cover` / `contain`, a transform or filter that
 * invalidates the arithmetic. It is not a failure of the probe; it is a fact
 * about the CSS, and the caller must treat it exactly as it treats an image it
 * knows is in the way.
 */
export type ImagePaint =
  | { kind: 'none' }
  | { kind: 'bounded'; rects: Rect[] }
  | { kind: 'unbounded'; why: string }

/** A background layer with the geometry of whatever image it paints. */
export interface FocusBackgroundLayer extends BackgroundLayer {
  paint: ImagePaint
}

export interface TextSample {
  element: string
  text: string
  colour: string
  fontSizePx: number
  fontWeight: number
  /** From the element outwards to `<html>`. */
  background: BackgroundLayer[]
}

export interface FocusReading {
  element: string
  tag: string
  type: string
  /** True when the engine says the element matches `:focus-visible`. */
  focusVisible: boolean
  outlineStyle: string
  outlineWidthPx: number
  outlineColour: string
  outlineOffsetPx: number
  boxShadow: string
  /** The border box, which every indicator's position is measured from. */
  box: Rect
  /** Behind the element itself — what an inset indicator layer touches. */
  ownBackground: FocusBackgroundLayer[]
  /** Behind the parent — what an outset indicator layer touches. */
  outsideBackground: FocusBackgroundLayer[]
}

export interface ControlBox {
  element: string
  tag: string
  type: string
  width: number
  height: number
}

export interface OverflowReading {
  documentScrollWidth: number
  documentClientWidth: number
  bodyScrollWidth: number
  innerWidth: number
  /** Elements whose painted box extends past the viewport's right edge. */
  offenders: { element: string; right: number }[]
}

/**
 * Every control a keyboard or a thumb can reach.
 *
 * `tabindex="-1"` is excluded deliberately: the app moves focus to the heading
 * after a view change, which is a programmatic focus target rather than a
 * control, and neither the 44px rule nor the tab-order sweep applies to it.
 */
export const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[role="button"]:not([aria-disabled="true"])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/** Text that is actually painted, with the colours it is painted in. */
export function readTextSamples(): TextSample[] {
  const describe = (el: Element): string => {
    const classes = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).join('.')}` : ''
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${classes}`
  }

  const chain = (el: Element): BackgroundLayer[] => {
    const layers: BackgroundLayer[] = []
    let node: Element | null = el
    while (node) {
      const s = getComputedStyle(node)
      layers.push({
        colour: s.backgroundColor,
        image: s.backgroundImage,
        opacity: Number(s.opacity),
        element: describe(node),
      })
      node = node.parentElement
    }
    return layers
  }

  const samples: TextSample[] = []

  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    // Native form-control internals (an <option> list, a date input's spinner)
    // are drawn by the platform, not by the author's stylesheet. Their computed
    // colour is not what appears on screen, so measuring it would be a check
    // that cannot check.
    if (el.closest('select') || el.tagName === 'OPTION') continue

    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent ?? '')
      .join('')
      .trim()

    if (own === '') continue

    const style = getComputedStyle(el)
    if (style.visibility === 'hidden' || style.display === 'none') continue
    if ((el as HTMLElement).getClientRects().length === 0) continue

    samples.push({
      element: describe(el),
      text: own.replace(/\s+/g, ' ').slice(0, 80),
      colour: style.color,
      fontSizePx: parseFloat(style.fontSize),
      fontWeight: Number(style.fontWeight) || (style.fontWeight === 'bold' ? 700 : 400),
      background: chain(el),
    })
  }

  return samples
}

/**
 * Everything about how the currently focused element is indicated, including
 * where each ancestor's background image is actually painted.
 *
 * Async because establishing an image's painted size needs its intrinsic size,
 * and the only way to read that is to decode it. The images involved are already
 * decoded — the engine has painted them — so the await resolves immediately and
 * nothing here depends on machine speed. A decode that fails is reported as
 * `unbounded` rather than hanging or being assumed away.
 */
export async function readFocusIndicator(): Promise<FocusReading | null> {
  const el = document.activeElement as HTMLElement | null
  if (!el || el === document.body || el === document.documentElement) return null

  const describe = (node: Element): string => {
    const classes = typeof node.className === 'string' && node.className ? `.${node.className.trim().split(/\s+/).join('.')}` : ''
    const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30)
    return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${classes}${text ? ` "${text}"` : ''}`
  }

  const boxOf = (node: Element): Rect => {
    const r = node.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  }

  /**
   * Split one comma-separated background property into its layers.
   *
   * Commas inside `url("data:...,...")` and inside `rgb(a, b, c)` are not layer
   * separators, so this tracks quotes and parentheses rather than calling
   * `String.split(',')`.
   */
  const splitLayers = (value: string): string[] => {
    const out: string[] = []
    let depth = 0
    let quote: string | null = null
    let current = ''
    for (const ch of value) {
      if (quote !== null) {
        current += ch
        if (ch === quote) quote = null
        continue
      }
      if (ch === '"' || ch === "'") {
        quote = ch
        current += ch
        continue
      }
      if (ch === '(') depth += 1
      if (ch === ')') depth -= 1
      if (ch === ',' && depth === 0) {
        out.push(current.trim())
        current = ''
        continue
      }
      current += ch
    }
    out.push(current.trim())
    return out
  }

  /** Background properties cycle when they have fewer layers than the image list. */
  const at = (list: string[], index: number): string => list[index % list.length] ?? ''

  /**
   * One component of a computed `background-position`, in px from the start
   * edge of the positioning area.
   *
   * Both engines serialise this as a length, a percentage, or a `calc()` sum of
   * the two — `right 12px` computes to `calc(100% - 12px)`. A percentage here is
   * not a percentage of the area: per CSS Backgrounds, P% aligns the P% point of
   * the *image* with the P% point of the area, so it resolves against
   * `area - image`. That is `free` below. Anything this cannot read returns null,
   * which the caller turns into `unbounded`.
   */
  const resolvePosition = (raw: string, free: number): number | null => {
    const keywords: Record<string, string> = {
      left: '0%',
      top: '0%',
      center: '50%',
      right: '100%',
      bottom: '100%',
    }
    const value = raw.trim().toLowerCase()
    const expanded = keywords[value] ?? value
    const calc = /^calc\((.*)\)$/.exec(expanded)
    const expression = calc?.[1] ?? expanded
    // A nested function (min, max, var, a second calc) is not something this
    // arithmetic can claim to reproduce.
    if (expression.includes('(')) return null

    const tokens = expression
      .replace(/\s*([+-])\s*/g, ' $1 ')
      .trim()
      .split(/\s+/)
      .filter((t) => t !== '')

    let total = 0
    let sign = 1
    for (const token of tokens) {
      if (token === '+' || token === '-') {
        sign = token === '-' ? -1 : 1
        continue
      }
      const px = /^(-?[\d.]+)px$/.exec(token)
      const pct = /^(-?[\d.]+)%$/.exec(token)
      if (px?.[1] !== undefined) total += sign * Number(px[1])
      else if (pct?.[1] !== undefined) total += sign * (Number(pct[1]) / 100) * free
      else return null
      sign = 1
    }
    return Number.isFinite(total) ? total : null
  }

  const intrinsic = new Map<string, { width: number; height: number } | null>()
  const intrinsicSize = async (src: string): Promise<{ width: number; height: number } | null> => {
    const cached = intrinsic.get(src)
    if (cached !== undefined) return cached
    let size: { width: number; height: number } | null = null
    try {
      const img = new Image()
      img.src = src
      await img.decode()
      size = img.naturalWidth > 0 && img.naturalHeight > 0
        ? { width: img.naturalWidth, height: img.naturalHeight }
        : null
    } catch {
      size = null
    }
    intrinsic.set(src, size)
    return size
  }

  /**
   * The painted rectangle of every background image on one element.
   *
   * Deliberately a *superset* of what is actually painted: `background-clip`,
   * `border-radius` and the edges of the positioning area can only ever shrink
   * the painted area, so ignoring them can make this report an overlap that is
   * not there — never miss one that is.
   */
  const paintOf = async (node: Element): Promise<ImagePaint> => {
    const s = getComputedStyle(node)
    if (s.backgroundImage === 'none' || s.backgroundImage === '') return { kind: 'none' }

    // Viewport-coordinate arithmetic mixes getBoundingClientRect (post-transform)
    // with border and padding widths (pre-transform). A transform anywhere in
    // the chain makes that mixture wrong, and a filter can move painted pixels
    // outside the box entirely.
    for (let n: Element | null = node; n; n = n.parentElement) {
      const t = getComputedStyle(n)
      if (t.transform !== 'none') {
        return { kind: 'unbounded', why: `${describe(n)} has transform ${t.transform}` }
      }
      if (t.filter !== 'none') {
        return { kind: 'unbounded', why: `${describe(n)} has filter ${t.filter}` }
      }
    }

    const border = node.getBoundingClientRect()
    const px = (v: string): number => parseFloat(v) || 0

    const images = splitLayers(s.backgroundImage)
    const sizes = splitLayers(s.backgroundSize)
    const repeats = splitLayers(s.backgroundRepeat)
    const origins = splitLayers(s.backgroundOrigin)
    const attachments = splitLayers(s.backgroundAttachment)
    // The longhands, not `background-position`, because their serialisation is
    // unambiguously one value per axis. `background-position` may serialise as
    // `right 12px center`, which is four tokens for two axes. An engine that
    // does not support the longhands returns '' — reported, not assumed away.
    const rawX = s.getPropertyValue('background-position-x')
    const rawY = s.getPropertyValue('background-position-y')
    if (rawX === '' || rawY === '') {
      return { kind: 'unbounded', why: 'this engine does not expose background-position-x/y' }
    }
    const xs = splitLayers(rawX)
    const ys = splitLayers(rawY)

    const rects: Rect[] = []

    for (let i = 0; i < images.length; i++) {
      const image = at(images, i)
      if (image === 'none') continue

      const url = /^url\((?:"([^"]*)"|'([^']*)'|([^)]*))\)$/.exec(image)
      const src = url?.[1] ?? url?.[2] ?? url?.[3]
      if (src === undefined) {
        return {
          kind: 'unbounded',
          why: `${describe(node)} paints ${image.slice(0, 40)}…, which has no intrinsic size — a gradient fills its whole positioning area`,
        }
      }

      const attachment = at(attachments, i)
      if (attachment !== 'scroll') {
        return { kind: 'unbounded', why: `background-attachment: ${attachment} on ${describe(node)}` }
      }

      const repeat = at(repeats, i).split(/\s+/)
      const axes =
        repeat[0] === 'repeat-x'
          ? ['repeat', 'no-repeat']
          : repeat[0] === 'repeat-y'
            ? ['no-repeat', 'repeat']
            : [repeat[0] ?? '', repeat[1] ?? repeat[0] ?? '']
      if (axes[0] !== 'no-repeat' || axes[1] !== 'no-repeat') {
        return {
          kind: 'unbounded',
          why: `background-repeat: ${at(repeats, i)} on ${describe(node)} — a tiled image can be anywhere in its area`,
        }
      }

      const origin = at(origins, i)
      let area: Rect
      if (origin === 'border-box') {
        area = { x: border.x, y: border.y, width: border.width, height: border.height }
      } else if (origin === 'padding-box' || origin === 'content-box') {
        const l = px(s.borderLeftWidth) + (origin === 'content-box' ? px(s.paddingLeft) : 0)
        const r = px(s.borderRightWidth) + (origin === 'content-box' ? px(s.paddingRight) : 0)
        const t = px(s.borderTopWidth) + (origin === 'content-box' ? px(s.paddingTop) : 0)
        const b = px(s.borderBottomWidth) + (origin === 'content-box' ? px(s.paddingBottom) : 0)
        area = {
          x: border.x + l,
          y: border.y + t,
          width: border.width - l - r,
          height: border.height - t - b,
        }
      } else {
        return { kind: 'unbounded', why: `background-origin: ${origin} on ${describe(node)}` }
      }

      const natural = await intrinsicSize(src)

      const sizeTokens = at(sizes, i).split(/\s+/)
      const sizeToken = (index: number): string => sizeTokens[index] ?? 'auto'
      if (sizeToken(0) === 'cover' || sizeToken(0) === 'contain') {
        return {
          kind: 'unbounded',
          why: `background-size: ${sizeToken(0)} on ${describe(node)} — the image is scaled to its area, so it is everywhere in it`,
        }
      }

      const lengthOf = (token: string): number | null => {
        if (token === 'auto') return null
        const m = /^([\d.]+)px$/.exec(token)
        return m?.[1] !== undefined ? Number(m[1]) : Number.NaN
      }
      const givenW = lengthOf(sizeToken(0))
      const givenH = lengthOf(sizeToken(1))
      if (Number.isNaN(givenW) || Number.isNaN(givenH)) {
        return {
          kind: 'unbounded',
          why: `background-size: ${at(sizes, i)} on ${describe(node)} is not a pair of pixel lengths`,
        }
      }

      let width: number
      let height: number
      if (givenW !== null && givenH !== null) {
        width = givenW
        height = givenH
      } else if (natural === null) {
        return {
          kind: 'unbounded',
          why: `${describe(node)}'s background image has no intrinsic size, so \`auto\` resolves to the whole positioning area`,
        }
      } else if (givenW !== null) {
        width = givenW
        height = (givenW / natural.width) * natural.height
      } else if (givenH !== null) {
        height = givenH
        width = (givenH / natural.height) * natural.width
      } else {
        width = natural.width
        height = natural.height
      }

      if (width <= 0 || height <= 0) continue

      const offsetX = resolvePosition(at(xs, i), area.width - width)
      const offsetY = resolvePosition(at(ys, i), area.height - height)
      if (offsetX === null || offsetY === null) {
        return {
          kind: 'unbounded',
          why: `background-position ${at(xs, i)} ${at(ys, i)} on ${describe(node)} could not be resolved to pixels`,
        }
      }

      rects.push({ x: area.x + offsetX, y: area.y + offsetY, width, height })
    }

    return rects.length === 0 ? { kind: 'none' } : { kind: 'bounded', rects }
  }

  const chain = async (start: Element | null): Promise<FocusBackgroundLayer[]> => {
    const layers: FocusBackgroundLayer[] = []
    let node: Element | null = start
    while (node) {
      const s = getComputedStyle(node)
      layers.push({
        colour: s.backgroundColor,
        image: s.backgroundImage,
        opacity: Number(s.opacity),
        element: describe(node),
        paint: await paintOf(node),
      })
      node = node.parentElement
    }
    return layers
  }

  const style = getComputedStyle(el)

  let focusVisible = false
  try {
    focusVisible = el.matches(':focus-visible')
  } catch {
    focusVisible = false
  }

  return {
    element: describe(el),
    tag: el.tagName.toLowerCase(),
    type: el.getAttribute('type') ?? '',
    focusVisible,
    outlineStyle: style.outlineStyle,
    outlineWidthPx: parseFloat(style.outlineWidth) || 0,
    outlineColour: style.outlineColor,
    outlineOffsetPx: parseFloat(style.outlineOffset) || 0,
    boxShadow: style.boxShadow,
    box: boxOf(el),
    ownBackground: await chain(el),
    outsideBackground: await chain(el.parentElement),
  }
}

/**
 * The painted size of every interactive control. Real layout, not jsdom zeros.
 *
 * **Controls inside an `inert` subtree are excluded**, and that is a statement
 * about what a control *is* rather than a convenience. `inert` removes an
 * element from the focus order and from the accessibility tree, so while a
 * modal dialog is open the page behind it is not reachable by Tab, by a
 * VoiceOver swipe, or by a tap. Collecting those controls would break the two
 * sweeps that use this list in opposite directions: the tab-order sweep would
 * demand Tab reach something the engine will not focus, and the focus-indicator
 * sweep would measure a ring on a control nobody can put focus on. They are
 * measured in the states where they are live, which is where the measurement
 * means something.
 *
 * Filtered here in JavaScript rather than added to `INTERACTIVE_SELECTOR`,
 * because `:not([inert] *)` needs complex-selector support in `:not()` and this
 * has to answer the same way on both engines.
 */
export function readControlBoxes(selector: string): ControlBox[] {
  const describe = (node: Element): string => {
    const classes = typeof node.className === 'string' && node.className ? `.${node.className.trim().split(/\s+/).join('.')}` : ''
    const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30)
    return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${classes}${text ? ` "${text}"` : ''}`
  }

  return Array.from(document.querySelectorAll(selector))
    .filter((el) => {
      if (el.closest('[inert]') !== null) return false
      const s = getComputedStyle(el)
      if (s.visibility === 'hidden' || s.display === 'none') return false
      return (el as HTMLElement).getClientRects().length > 0
    })
    .map((el) => {
      const rect = el.getBoundingClientRect()
      return {
        element: describe(el),
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') ?? '',
        width: rect.width,
        height: rect.height,
      }
    })
}

/**
 * Move focus to the nth visible interactive control.
 *
 * Used where tabbing cannot reach it: Playwright's WebKit does not move focus
 * to buttons with Tab (macOS Safari's "Full Keyboard Access" default), so a
 * tab-only sweep would silently check nothing on the engine the iPhone runs.
 * Both engines apply `:focus-visible` to a programmatic focus that follows a
 * key press, which is why the caller presses a key first — and the specs assert
 * `:focus-visible` matched rather than assuming it did.
 */
export function focusNthControl(payload: { selector: string; index: number }): boolean {
  const visible = Array.from(document.querySelectorAll(payload.selector)).filter((el) => {
    // Must match `readControlBoxes` exactly, including the `inert` exclusion —
    // the caller indexes into one list and focuses out of the other, so a
    // difference between the two filters silently focuses the wrong control.
    if (el.closest('[inert]') !== null) return false
    const s = getComputedStyle(el)
    if (s.visibility === 'hidden' || s.display === 'none') return false
    return (el as HTMLElement).getClientRects().length > 0
  })

  const target = visible[payload.index] as HTMLElement | undefined
  if (!target) return false
  target.focus()
  return document.activeElement === target
}

/** Horizontal overflow of the page, and which elements cause it. */
export function readOverflow(): OverflowReading {
  const describe = (node: Element): string => {
    const classes = typeof node.className === 'string' && node.className ? `.${node.className.trim().split(/\s+/).join('.')}` : ''
    return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${classes}`
  }

  const offenders: { element: string; right: number }[] = []
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) continue
    // A one-pixel tolerance: sub-pixel layout rounding is not a scroll bar.
    if (rect.right > window.innerWidth + 1) {
      offenders.push({ element: describe(el), right: Math.round(rect.right * 100) / 100 })
    }
  }

  return {
    documentScrollWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    innerWidth: window.innerWidth,
    offenders,
  }
}

export interface RowReading {
  /** Rendered text only — `innerText` respects layout, `textContent` does not. */
  text: string
  /** Every colour painted anywhere in the row: text, background, all borders. */
  colours: string[]
  /**
   * Images, icons and canvases in the row. A colour-suppressing stylesheet
   * cannot claim to have removed colour from any of these, so their presence
   * has to invalidate the claim rather than be ignored.
   */
  media: string[]
}

/**
 * Each job in the list, as text and as colour, kept apart.
 *
 * Identified through the list/listitem roles the user's screen reader uses, not
 * through the class names the stylesheet happens to use — a status conveyed
 * only by a class name is not conveyed to anybody.
 */
export function readRows(): RowReading[] {
  const rows = Array.from(document.querySelectorAll('ul li, [role="list"] [role="listitem"]'))

  return rows.map((row) => {
    const colours = new Set<string>()
    for (const el of [row, ...Array.from(row.querySelectorAll('*'))]) {
      const s = getComputedStyle(el)
      colours.add(s.color)
      colours.add(s.backgroundColor)
      colours.add(s.borderLeftColor)
      colours.add(s.borderRightColor)
      colours.add(s.borderTopColor)
      colours.add(s.borderBottomColor)
    }

    const media = Array.from(row.querySelectorAll('img, svg, canvas, video, picture')).map((el) =>
      el.tagName.toLowerCase(),
    )
    for (const el of [row, ...Array.from(row.querySelectorAll('*'))]) {
      if (getComputedStyle(el).backgroundImage !== 'none') media.push('background-image')
    }

    return {
      text: ((row as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim(),
      colours: Array.from(colours).sort(),
      media,
    }
  })
}
