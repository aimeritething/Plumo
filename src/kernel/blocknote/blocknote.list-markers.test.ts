import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const blocknoteCss = readFileSync('src/kernel/blocknote/blocknote.css', 'utf8')
const normalizedCss = blocknoteCss.replace(/\s+/g, ' ')

describe('editor list marker typography', () => {
  it('derives marker size from editor text so it scales with zoom', () => {
    expect(blocknoteCss).toMatch(
      /\.bn-block-outer\s*\{[^}]*--_lists-marker-radius:\s*calc\(var\(--editor-font-size\)\s*\*\s*0\.2\)\s*;[^}]*--_lists-marker-size:\s*calc\(var\(--editor-font-size\)\s*\*\s*0\.4\)\s*;/s,
    )
    expect(normalizedCss).toContain(
      '[data-content-type="bulletListItem"]::before { background: var(--_lists-marker, radial-gradient( circle, var(--text-document) 0 var(--_lists-marker-radius), transparent var(--_lists-marker-fade-radius) ));',
    )
  })

  it('uses distinct hollow-circle and square markers for nested bullets', () => {
    expect(normalizedCss).toContain(
      '.bn-block-group .bn-block-group { margin-inline-start: var(--lists-indent-size); --_lists-marker: radial-gradient( circle, transparent 0 var(--_lists-marker-inner-radius), var(--text-document) var(--_lists-marker-inner-radius) var(--_lists-marker-radius), transparent var(--_lists-marker-fade-radius) );',
    )
    expect(normalizedCss).toContain(
      '.bn-block-group .bn-block-group .bn-block-group { --_lists-marker: linear-gradient(var(--text-document), var(--text-document)) center / var(--_lists-marker-size) var(--_lists-marker-size) no-repeat;',
    )
  })
})
