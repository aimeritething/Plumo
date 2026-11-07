import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio, parseHex, type Rgb } from './color-math'
import {
  DEFAULT_PRIMARY_COLOR,
  normalizePrimaryColor,
  PRIMARY_COLOR_PRESETS,
  primaryColorStyleSheet,
  primaryScale,
  type ScaleTheme,
} from './primary-color'

const rgb = (hex: string) => parseHex(hex.slice(0, 7)) as Rgb
const STEPS = Array.from({ length: 12 }, (_, i) => String(i + 1))
const scalesCss = readFileSync(join(process.cwd(), 'src', 'color-scales.css'), 'utf8')

function stylesheetScale(name: string, theme: ScaleTheme): Record<string, string> {
  const blocks = scalesCss.split('[data-theme="dark"] {')
  const block = theme === 'light' ? blocks[0] : blocks[1]
  return Object.fromEntries(
    Array.from(block.matchAll(new RegExp(`--${name}-([a-z0-9]+):\\s*([^;]+);`, 'g')), (match) => [match[1], match[2]]),
  )
}

describe('normalizePrimaryColor', () => {
  it('takes #rrggbb in any case and nothing else', () => {
    expect(normalizePrimaryColor('#0082FB')).toBe('#0082fb')
    expect(normalizePrimaryColor('#fff')).toBeNull()
    expect(normalizePrimaryColor('blue')).toBeNull()
    expect(normalizePrimaryColor(42)).toBeNull()
  })
})

describe('primaryScale', () => {
  it('is the stylesheet\'s blue for the default, in both themes', () => {
    for (const theme of ['light', 'dark'] as const) {
      expect(stylesheetScale('blue', theme)).toEqual(primaryScale(DEFAULT_PRIMARY_COLOR, theme))
    }
  })

  it('keeps the colour picked as step 9', () => {
    for (const { hex } of PRIMARY_COLOR_PRESETS) {
      expect(primaryScale(hex, 'light')['9']).toBe(hex)
      expect(primaryScale(hex, 'dark')['9']).toBe(hex)
    }
  })

  it('runs light to dark in the light theme and dark to light in the dark one, through steps 1–8', () => {
    for (const { hex } of PRIMARY_COLOR_PRESETS) {
      const light = primaryScale(hex, 'light')
      const dark = primaryScale(hex, 'dark')
      for (let i = 1; i < 8; i += 1) {
        expect(contrastRatio(rgb(light[String(i + 1)]), rgb('#ffffff'))).toBeGreaterThan(contrastRatio(rgb(light[String(i)]), rgb('#ffffff')))
        expect(contrastRatio(rgb(dark[String(i + 1)]), rgb('#111111'))).toBeGreaterThan(contrastRatio(rgb(dark[String(i)]), rgb('#111111')))
      }
    }
  })

  it('makes step 11 readable as text on step 2, and step 12 more so, for every preset', () => {
    for (const { hex } of PRIMARY_COLOR_PRESETS) {
      for (const theme of ['light', 'dark'] as const) {
        const scale = primaryScale(hex, theme)
        expect(contrastRatio(rgb(scale['11']), rgb(scale['2']))).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(rgb(scale['12']), rgb(scale['2']))).toBeGreaterThanOrEqual(10)
      }
    }
  })

  it('puts white text on a dark step 9 and dark text on a light one', () => {
    expect(primaryScale('#0082fb', 'light').contrast).toBe('#ffffff')
    const yellow = primaryScale('#ffc53d', 'light')
    expect(yellow.contrast).toBe(yellow['12'])
  })

  it('gives every step a see-through twin', () => {
    const scale = primaryScale('#8e4ec6', 'light')
    for (const step of STEPS) expect(scale[`a${step}`]).toMatch(/^#[0-9a-f]{8}$/)
  })
})

describe('primaryColorStyleSheet', () => {
  it('is empty for the default, which the stylesheet already carries', () => {
    expect(primaryColorStyleSheet(DEFAULT_PRIMARY_COLOR)).toBe('')
    expect(primaryColorStyleSheet('not a colour')).toBe('')
  })

  it('declares the scale for each theme, on <html> and on any themed element under it', () => {
    const css = primaryColorStyleSheet('#30a46c')
    expect(css).toContain(':root[data-theme="light"], :root [data-theme="light"] {')
    expect(css).toContain(':root[data-theme="dark"], :root [data-theme="dark"] {')
    expect(css).toContain('--primary-9: #30a46c;')
  })
})
