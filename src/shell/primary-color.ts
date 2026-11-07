import { alphaOver, contrastRatio, oklchToRgb, parseHex, rgbToOklch, toHex, type Rgb } from './color-math'

/**
 * The Primary color (CONTEXT.md): one colour the user picks in Settings, from
 * which a twelve-step scale is built for each theme. `src/color-scales.css`
 * holds the default's scale as `--blue-*`, and `--primary-*` points at it; a
 * different choice is laid over the page as `--primary-*` by
 * `applyPrimaryColorToDocument`.
 *
 * The scale follows Radix Colors' steps: 1–2 backgrounds, 3–5 fills, 6–8
 * lines, 9–10 the solid colour and its hover, 11–12 text. The colour picked is
 * step 9 exactly; the other steps take Radix's lightness for that step and a
 * share of the picked colour's chroma (both averaged over fifteen Radix
 * scales), in the picked hue. Every step also has a see-through twin, `aN`,
 * that shows the same colour over the theme's background.
 */

export interface PrimaryColorPreset { id: string; label: string; hex: string }

/** The swatches Settings offers, in the order macOS lists its accent colours. */
export const PRIMARY_COLOR_PRESETS: readonly PrimaryColorPreset[] = [
  { id: 'blue', label: 'Blue', hex: '#0082fb' },
  { id: 'purple', label: 'Purple', hex: '#8e4ec6' },
  { id: 'pink', label: 'Pink', hex: '#d6409f' },
  { id: 'red', label: 'Red', hex: '#e5484d' },
  { id: 'orange', label: 'Orange', hex: '#f76b15' },
  { id: 'yellow', label: 'Yellow', hex: '#ffc53d' },
  { id: 'green', label: 'Green', hex: '#30a46c' },
  { id: 'graphite', label: 'Graphite', hex: '#5c5c5c' },
]

export const DEFAULT_PRIMARY_COLOR = PRIMARY_COLOR_PRESETS[0].hex

/** A `#rrggbb` colour, lower-cased, or null for anything else. */
export function normalizePrimaryColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return parseHex(value) ? value.trim().toLowerCase() : null
}

export type ScaleTheme = 'light' | 'dark'

/** Radix's lightness for steps 1–12, step 9 and 10 being replaced by the picked colour. */
const LIGHTNESS: Record<ScaleTheme, readonly number[]> = {
  light: [0.993, 0.982, 0.959, 0.931, 0.898, 0.858, 0.804, 0.732, 0, 0, 0.54, 0.329],
  dark: [0.189, 0.211, 0.267, 0.309, 0.351, 0.399, 0.458, 0.533, 0, 0, 0.781, 0.909],
}

/** Each step's chroma as a share of step 9's. */
const CHROMA_SHARE: Record<ScaleTheme, readonly number[]> = {
  light: [0.021, 0.058, 0.144, 0.244, 0.334, 0.433, 0.537, 0.706, 1, 0.98, 0.909, 0.474],
  dark: [0.104, 0.136, 0.321, 0.466, 0.52, 0.551, 0.606, 0.717, 1, 0.969, 0.85, 0.367],
}

/** The page under the see-through steps: white, and the dark theme's gray-1. */
const BACKGROUND: Record<ScaleTheme, Rgb> = {
  light: parseHex('#ffffff') as Rgb,
  dark: parseHex('#111111') as Rgb,
}

/** Above this lightness, white text on step 9 is hard to read, so the text is step 12 instead. */
const LIGHT_SOLID = 0.72

export interface PrimaryScale {
  /** `1`…`12`, `a1`…`a12` and `contrast` (text on step 9), as hex. */
  [step: string]: string
}

export function primaryScale(hex: string, theme: ScaleTheme): PrimaryScale {
  const seed = parseHex(hex) ?? (parseHex(DEFAULT_PRIMARY_COLOR) as Rgb)
  const { l: seedL, c: seedC, h } = rgbToOklch(seed)
  const lightness = [...LIGHTNESS[theme]]
  lightness[8] = seedL
  lightness[9] = theme === 'light' ? seedL - 0.03 : seedL + 0.04
  const steps = lightness.map((l, i) => oklchToRgb({ l, c: seedC * CHROMA_SHARE[theme][i], h }))
  steps[8] = seed

  // Text steps: 11 reads at 4.5:1 on step 2, 12 at 10:1.
  const toward = theme === 'light' ? -0.01 : 0.01
  for (const [index, ratio] of [[10, 4.5], [11, 10]] as const) {
    let l = lightness[index]
    while (contrastRatio(steps[index], steps[1]) < ratio && l > 0.05 && l < 0.99) {
      l += toward
      steps[index] = oklchToRgb({ l, c: seedC * CHROMA_SHARE[theme][index], h })
    }
  }

  const scale: PrimaryScale = {}
  steps.forEach((rgb, i) => {
    scale[String(i + 1)] = toHex(rgb)
    scale[`a${i + 1}`] = alphaOver(parseHex(toHex(rgb)) as Rgb, BACKGROUND[theme])
  })
  scale.contrast = seedL > LIGHT_SOLID ? toHex(steps[11]) : '#ffffff'
  return scale
}

/** The custom properties a scale declares, named `--{name}-{step}`. */
export function scaleDeclarations(name: string, scale: PrimaryScale): string {
  return Object.entries(scale).map(([step, value]) => `--${name}-${step}: ${value};`).join(' ')
}

/**
 * The style sheet that lays a Primary color over the page: `--primary-*` for
 * each theme, on selectors one step more specific than `color-scales.css`'s so
 * it wins wherever the bundle's stylesheet lands. Empty for the default, whose
 * scale the stylesheet already has.
 */
export function primaryColorStyleSheet(hex: string): string {
  const color = normalizePrimaryColor(hex)
  if (!color || color === DEFAULT_PRIMARY_COLOR) return ''
  return [
    `:root[data-theme="light"], :root [data-theme="light"] { ${scaleDeclarations('primary', primaryScale(color, 'light'))} }`,
    `:root[data-theme="dark"], :root [data-theme="dark"] { ${scaleDeclarations('primary', primaryScale(color, 'dark'))} }`,
  ].join('\n')
}
