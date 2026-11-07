/**
 * The colour arithmetic the Primary color scale is built with: sRGB hex in and
 * out, OKLCH in between, WCAG contrast, and the see-through colour that lands
 * on a given solid one over a known background. No DOM, no dependencies.
 */

export interface Rgb { r: number; g: number; b: number }
export interface Oklch { l: number; c: number; h: number }

const HEX = /^#([0-9a-f]{6})$/i

export function parseHex(hex: string): Rgb | null {
  const match = HEX.exec(hex.trim())
  if (!match) return null
  const value = Number.parseInt(match[1], 16)
  return { r: (value >> 16) / 255, g: ((value >> 8) & 0xff) / 255, b: (value & 0xff) / 255 }
}

const channelToHex = (channel: number) => Math.round(Math.min(1, Math.max(0, channel)) * 255).toString(16).padStart(2, '0')

export function toHex({ r, g, b }: Rgb): string {
  return `#${channelToHex(r)}${channelToHex(g)}${channelToHex(b)}`
}

const toLinear = (channel: number) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
const fromLinear = (channel: number) => (channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055)

export function rgbToOklch({ r, g, b }: Rgb): Oklch {
  const lr = toLinear(r)
  const lg = toLinear(g)
  const lb = toLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const c = Math.hypot(A, B)
  const h = c < 1e-4 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360
  return { l: L, c, h }
}

/** OKLCH to sRGB, channels unclamped: a channel outside 0–1 is out of gamut. */
function oklchToRawRgb({ l: L, c, h }: Oklch): Rgb {
  const A = c * Math.cos((h * Math.PI) / 180)
  const B = c * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  return {
    r: fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  }
}

const inGamut = ({ r, g, b }: Rgb) => [r, g, b].every((channel) => channel >= -1e-4 && channel <= 1 + 1e-4)

/** The colour at this lightness and hue, its chroma lowered until sRGB can show it. */
export function oklchToRgb(color: Oklch): Rgb {
  const rgb = oklchToRawRgb(color)
  if (inGamut(rgb)) return rgb
  let low = 0
  let high = color.c
  for (let i = 0; i < 24; i += 1) {
    const mid = (low + high) / 2
    if (inGamut(oklchToRawRgb({ ...color, c: mid }))) low = mid
    else high = mid
  }
  return oklchToRawRgb({ ...color, c: low })
}

export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

/**
 * The see-through colour that, laid over `background`, shows `target`: the
 * lowest opacity any channel needs, then the channels that opacity requires.
 * Written as #rrggbbaa.
 */
export function alphaOver(target: Rgb, background: Rgb): string {
  const channels = ['r', 'g', 'b'] as const
  let alpha = 0
  for (const channel of channels) {
    const t = target[channel]
    const bg = background[channel]
    if (t < bg) alpha = Math.max(alpha, (bg - t) / bg)
    else if (t > bg) alpha = Math.max(alpha, (t - bg) / (1 - bg))
  }
  alpha = Math.min(1, Math.ceil(alpha * 255) / 255)
  if (alpha === 0) return `${toHex(background)}00`
  const color = Object.fromEntries(
    channels.map((channel) => [channel, (target[channel] - background[channel] * (1 - alpha)) / alpha]),
  ) as unknown as Rgb
  return `${toHex(color)}${channelToHex(alpha)}`
}
