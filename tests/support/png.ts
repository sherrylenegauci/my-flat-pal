/**
 * Just enough PNG to read a generated icon's pixels.
 *
 * ## Why this exists at all
 *
 * `public/icons/*.png` were a white house on near-black, drawn in the app's
 * *first* palette, and they stayed that way through two complete design passes.
 * Nothing caught it, and the reason is structural rather than careless: no
 * stylesheet touches a PNG and no test tier opened one. It is the same silent
 * drift that left the manifest's `theme_color` two palettes stale.
 *
 * A test that reads the actual pixels and compares them against
 * `src/ui/tokens.css` is the check that would have caught it, and it is the only
 * kind that can — an assertion about the source SVG would pass while the shipped
 * file said something else entirely, which is precisely the failure this is for.
 *
 * ## Why it is written here rather than installed
 *
 * Principle I: a PNG library would have one call site. Node ships `zlib`, which
 * is the only genuinely hard part of a PNG, so what is left is a chunk walk and
 * five filter types. Roughly ninety lines against a dependency in the bundle's
 * dependency budget was not a close call.
 *
 * ## It refuses rather than guesses
 *
 * Same posture as `e2e/support/colour.ts`: every unsupported case throws. A
 * decoder that quietly returned zeroes for an interlaced file would turn a
 * colour assertion into a check that passes without checking anything, which is
 * the failure mode the constitution's Testing Strategy names outright. The
 * generator is `scripts/generate-icons.mjs` and it produces 8-bit non-interlaced
 * RGB or RGBA; anything else means the generator changed and this should stop.
 */

import { inflateSync } from 'node:zlib'

export interface Pixel {
  r: number
  g: number
  b: number
  /** 0–255. */
  a: number
}

export interface DecodedPng {
  width: number
  height: number
  /** Row-major, `width * height` entries. */
  pixels: Pixel[]
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** Reads the pixel at (x, y). Throws rather than returning a default. */
export function pixelAt(png: DecodedPng, x: number, y: number): Pixel {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) {
    throw new Error(`Pixel (${x}, ${y}) is outside a ${png.width}x${png.height} image`)
  }
  const pixel = png.pixels[y * png.width + x]
  if (pixel === undefined) throw new Error(`No pixel at (${x}, ${y})`)
  return pixel
}

export function describePixel({ r, g, b, a }: Pixel): string {
  return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`
}

export function decodePng(bytes: Uint8Array, context: string): DecodedPng {
  for (const [index, expected] of SIGNATURE.entries()) {
    if (bytes[index] !== expected) {
      throw new Error(`${context} is not a PNG (byte ${index} is not the signature)`)
    }
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = SIGNATURE.length

  let header: { width: number; height: number; channels: number } | null = null
  const data: Uint8Array[] = []

  while (offset + 8 <= bytes.byteLength) {
    const length = view.getUint32(offset)
    const type = String.fromCharCode(
      bytes[offset + 4] ?? 0,
      bytes[offset + 5] ?? 0,
      bytes[offset + 6] ?? 0,
      bytes[offset + 7] ?? 0,
    )
    const body = bytes.subarray(offset + 8, offset + 8 + length)

    if (type === 'IHDR') header = readHeader(view, offset + 8, context)
    if (type === 'IDAT') data.push(body)
    if (type === 'IEND') break

    // 4 length + 4 type + body + 4 CRC. The CRC is not verified: a corrupt file
    // fails the colour assertion anyway, and a check nobody can act on is noise.
    offset += 12 + length
  }

  if (header === null) throw new Error(`${context} has no IHDR chunk`)
  if (data.length === 0) throw new Error(`${context} has no IDAT chunk`)

  const { width, height, channels } = header
  const raw = inflateSync(concat(data))
  const pixels = unfilter(raw, width, height, channels, context)

  return { width, height, pixels }
}

function readHeader(
  view: DataView,
  at: number,
  context: string,
): { width: number; height: number; channels: number } {
  const width = view.getUint32(at)
  const height = view.getUint32(at + 4)
  const bitDepth = view.getUint8(at + 8)
  const colourType = view.getUint8(at + 9)
  const compression = view.getUint8(at + 10)
  const filter = view.getUint8(at + 11)
  const interlace = view.getUint8(at + 12)

  const refuse = (why: string) =>
    new Error(
      `${context}: ${why}. Refusing to guess — a decoder that returned ` +
        'something anyway would make the colour assertions above pass without ' +
        'reading the real pixels.',
    )

  if (bitDepth !== 8) throw refuse(`bit depth is ${bitDepth}, and only 8 is supported`)
  if (colourType !== 2 && colourType !== 6) {
    throw refuse(`colour type is ${colourType}, and only 2 (RGB) and 6 (RGBA) are supported`)
  }
  if (compression !== 0) throw refuse(`compression method is ${compression}`)
  if (filter !== 0) throw refuse(`filter method is ${filter}`)
  if (interlace !== 0) throw refuse('the image is interlaced')

  return { width, height, channels: colourType === 6 ? 4 : 3 }
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.byteLength
  }
  return out
}

/**
 * Reverse the per-scanline filters. Each row is prefixed with one filter byte,
 * and filters 2–4 refer to the row above, so this has to run over the whole
 * image in order even when only a few pixels are wanted.
 */
function unfilter(
  raw: Uint8Array,
  width: number,
  height: number,
  channels: number,
  context: string,
): Pixel[] {
  const stride = width * channels
  const expected = height * (stride + 1)
  if (raw.byteLength < expected) {
    throw new Error(
      `${context}: inflated to ${raw.byteLength} bytes, expected at least ${expected}`,
    )
  }

  const out = new Uint8Array(height * stride)

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)] ?? 0
    const rowStart = y * (stride + 1) + 1
    const outStart = y * stride

    for (let i = 0; i < stride; i += 1) {
      const x = raw[rowStart + i] ?? 0
      const a = i >= channels ? (out[outStart + i - channels] ?? 0) : 0
      const b = y > 0 ? (out[outStart - stride + i] ?? 0) : 0
      const c = y > 0 && i >= channels ? (out[outStart - stride + i - channels] ?? 0) : 0

      let value: number
      switch (filter) {
        case 0:
          value = x
          break
        case 1:
          value = x + a
          break
        case 2:
          value = x + b
          break
        case 3:
          value = x + Math.floor((a + b) / 2)
          break
        case 4:
          value = x + paeth(a, b, c)
          break
        default:
          throw new Error(`${context}: unknown scanline filter ${filter} on row ${y}`)
      }

      out[outStart + i] = value & 0xff
    }
  }

  const pixels: Pixel[] = []
  for (let i = 0; i < width * height; i += 1) {
    const at = i * channels
    pixels.push({
      r: out[at] ?? 0,
      g: out[at + 1] ?? 0,
      b: out[at + 2] ?? 0,
      a: channels === 4 ? (out[at + 3] ?? 0) : 255,
    })
  }
  return pixels
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}
