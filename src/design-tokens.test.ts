import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// The shape of the two token levels (index.css, color-scales.css), read from
// the stylesheets as text: scales at the bottom, roles over them, the
// Tailwind bridge over the roles, and components on the roles only.

const SRC = join(process.cwd(), 'src')
const appCss = readFileSync(join(SRC, 'index.css'), 'utf8')
const scalesCss = readFileSync(join(SRC, 'color-scales.css'), 'utf8')

function declarations(block: string): Record<string, string> {
  return Object.fromEntries(
    Array.from(block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g), (match) => [match[1], match[2].trim()]),
  )
}

/** The text between the braces that follow `selector`, brace depth respected. */
function blockAfter(css: string, selector: string, from = 0): { body: string; start: number; end: number } {
  const start = css.indexOf(selector, from)
  expect(start, `${selector} block`).toBeGreaterThan(-1)
  const open = css.indexOf('{', start)
  let depth = 0
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    if (css[i] === '}') depth -= 1
    if (depth === 0) return { body: css.slice(open + 1, i), start, end: i + 1 }
  }
  throw new Error(`unterminated ${selector} block`)
}

const scalesLight = blockAfter(scalesCss, ':root,\n[data-theme="light"]')
const scalesDark = blockAfter(scalesCss, '[data-theme="dark"] {')
const scalesPrimary = blockAfter(scalesCss, ':root,\n[data-theme] {')
const themeLight = blockAfter(appCss, ':root,\n[data-theme="light"]')
const themeDark = blockAfter(appCss, '[data-theme="dark"] {')
const roleBlock = blockAfter(appCss, ':root,\n[data-theme] {', themeDark.end)
const bridgeBlock = blockAfter(appCss, '@theme inline')

const scales = declarations(scalesLight.body)
const theme = declarations(themeLight.body)
const roles = declarations(roleBlock.body)
const bridge = declarations(bridgeBlock.body)
const SCALE_NAMES = ['gray', 'red', 'orange', 'yellow', 'green', 'teal', 'purple', 'blue']
const SCALE_STEP = new RegExp(`--(?:${[...SCALE_NAMES, 'primary'].join('|')})-(?:a?\\d+|contrast)\\b`)

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(tsx?|css)$/.test(entry) ? [path] : []
  })
}

describe('the scales', () => {
  it('are twelve solid steps and twelve see-through ones each, the same names in light and dark', () => {
    for (const name of SCALE_NAMES) {
      for (let step = 1; step <= 12; step += 1) {
        expect(scales, `--${name}-${step}`).toHaveProperty(`--${name}-${step}`)
        expect(scales, `--${name}-a${step}`).toHaveProperty(`--${name}-a${step}`)
      }
    }
    expect(Object.keys(declarations(scalesDark.body)).sort()).toEqual(Object.keys(scales).sort())
  })

  it('give the Primary color the default blue, step by step', () => {
    for (const [name, value] of Object.entries(declarations(scalesPrimary.body))) {
      expect(value).toBe(`var(${name.replace('--primary-', '--blue-')})`)
    }
  })
})

describe('the roles', () => {
  it('declare the same names in the light and the dark theme block', () => {
    expect(Object.keys(declarations(themeDark.body)).sort()).toEqual(Object.keys(theme).sort())
  })

  it('are written without a literal colour, on scale steps and other roles', () => {
    for (const [name, value] of Object.entries(roles)) {
      expect(value, name).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|oklch\(/i)
      for (const [, used] of value.matchAll(/var\((--[\w-]+)\)/g)) {
        expect(SCALE_STEP.test(used) || used in roles || used in theme, `${name} reads ${used}`).toBe(true)
      }
    }
  })

  it('are each bridged to Tailwind as --color-*, and the bridge names nothing else but white and black', () => {
    const colorRoles = [...Object.keys(roles), ...Object.keys(theme).filter((name) => !name.startsWith('--elevation-'))]
    for (const name of colorRoles) expect(bridge[`--color-${name.slice(2)}`], name).toBe(`var(${name})`)
    const bridged = Object.keys(bridge).filter((name) => name.startsWith('--color-') && name !== '--color-*')
    expect(bridged.filter((name) => !colorRoles.includes(`--${name.slice('--color-'.length)}`)).sort())
      .toEqual(['--color-black', '--color-white'])
    expect(bridgeBlock.body).toContain('--color-*: initial;')
  })

  it('give the Primary color its four jobs: the solid, focus, links and the selection', () => {
    expect(roles['--primary']).toBe('var(--primary-9)')
    expect(roles['--ring']).toBe('var(--primary-8)')
    expect(roles['--link']).toBe('var(--primary-11)')
    expect(roles['--selection']).toBe('var(--primary-a5)')
  })
})

describe('components', () => {
  it('read roles, never a scale step', () => {
    const allowed = new Set(['index.css', 'color-scales.css'])
    const offenders = sourceFiles(SRC)
      .map((file) => relative(SRC, file))
      .filter((path) => !allowed.has(path) && !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'))
      .flatMap((path) => {
        const hit = readFileSync(join(SRC, path), 'utf8').match(SCALE_STEP)
        return hit && !path.startsWith('shell/primary-color') ? [`${path}: ${hit[0]}`] : []
      })
    expect(offenders).toEqual([])
  })

  it('use none of the retired names', () => {
    const names = 'surface-(?:app|card|popover|shade|overlay)|text-(?:heading|primary|secondary|tertiary|muted|inverse|link|document|document-heading)|state-(?:hover|hover-subtle|selected|focus-ring|drag-target|selection)|accent-(?:base|hover|bg)|control-(?:secondary|secondary-hover|secondary-selected|tertiary-hover)|sidebar-row-(?:hover|active)|tab-(?:hover|active)|menu-(?:item-hover|shortcut)|chroma-[a-z]+(?:-text|-bg)?|feedback-[a-z]+-(?:text|bg)|inline-code-(?:bg|border)|border-(?:default|strong|popover)|shadow-(?:card|menu|dialog|raised)'
    const prefixes = 'bg|text|border|ring|outline|fill|stroke|divide|placeholder|decoration|caret|from|to|via|accent'
    const retired = new RegExp(`(?:--|\\b(?:${prefixes})-)(?:${names})(?![\\w-])|\\bshadow-(?:card|menu|dialog|raised)(?![\\w-])`)
    const offenders = sourceFiles(SRC)
      .map((file) => relative(SRC, file))
      .filter((path) => path !== 'design-tokens.test.ts')
      .flatMap((path) => {
        const hit = readFileSync(join(SRC, path), 'utf8').match(retired)
        return hit ? [`${path}: ${hit[0].trim()}`] : []
      })
    expect(offenders).toEqual([])
  })
})

describe('literal colours', () => {
  it('appear only in the scales and the two theme blocks', () => {
    const literal = /#[0-9a-f]{3,8}\b|rgba?\(/i
    const bridgeWithoutWhiteAndBlack = appCss.slice(bridgeBlock.start, bridgeBlock.end).replace(/--color-(?:white|black): #[0-9a-f]+;/g, '')
    const checks: Array<[string, string]> = [
      ['index.css', appCss.slice(0, themeLight.start) + appCss.slice(themeLight.end, themeDark.start) + appCss.slice(themeDark.end, bridgeBlock.start) + bridgeWithoutWhiteAndBlack + appCss.slice(bridgeBlock.end)],
      ['kernel/blocknote/blocknote.css', readFileSync(join(SRC, 'kernel', 'blocknote', 'blocknote.css'), 'utf8')],
    ]
    for (const [name, text] of checks) {
      const hit = text.match(literal)
      expect(hit ? `${name}: ${hit[0]}` : null).toBeNull()
    }
  })
})

describe('the faces', () => {
  it('set the UI, the Document and code in the system faces, with no bundled font', () => {
    expect(bridge['--font-sans']).toMatch(/^system-ui,/)
    expect(bridge['--font-mono']).toMatch(/^ui-monospace,/)
    expect(appCss).toMatch(/--editor-font-family:\s*var\(--font-sans\);/)
    expect(appCss).not.toMatch(/'Inter|JetBrains|@fontsource/)
  })
})
