import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// The shape of the stylesheet entry, read from the tree as text. Every style
// is a utility class in tsx; what is not sits in one of three files, and only
// main.tsx imports a stylesheet (index.css, which imports the others).

const SRC = join(process.cwd(), 'src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(tsx?|css)$/.test(entry) ? [path] : []
  })
}

const files = sourceFiles(SRC).map((file) => relative(SRC, file))

describe('the stylesheets', () => {
  it('are index.css, its colour scales and the Kernel\'s blocknote.css, nothing else', () => {
    expect(files.filter((path) => path.endsWith('.css')).sort()).toEqual(['color-scales.css', 'index.css', 'kernel/blocknote/blocknote.css'])
  })

  it('are imported once, by main.tsx', () => {
    const cssImport = /\bimport\s*(?:\(\s*)?['"][^'"]*\.css['"]/
    const importers = files.filter((path) => !path.endsWith('.css') && cssImport.test(readFileSync(join(SRC, path), 'utf8')))
    expect(importers).toEqual(['main.tsx'])
  })
})
