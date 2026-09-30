import { describe, expect, it } from 'vitest'
import {
  addProperty,
  hasProperty,
  readProperties,
  removeProperty,
  renameProperty,
  setPropertyBoolean,
  setPropertyList,
  setPropertyMultiline,
  setPropertyText,
} from './properties'

const fm = (...lines: string[]) => `---\n${lines.join('\n')}\n---\n`

describe('readProperties', () => {
  it('says there is no Frontmatter for an empty string', () => {
    expect(readProperties('')).toEqual({ state: 'none' })
  })

  it('reads every top-level key in disk order, with its line in the block', () => {
    const result = readProperties(fm('title: Everything', '# a note', 'tags: [a, b]', 'date: 2026-09-19'))
    expect(result).toEqual({
      state: 'readable',
      properties: [
        { key: 'title', value: { kind: 'text', text: 'Everything' }, line: 1 },
        { key: 'tags', value: { kind: 'list', items: ['a', 'b'] }, line: 3 },
        { key: 'date', value: { kind: 'text', text: '2026-09-19' }, line: 4 },
      ],
    })
  })

  it('reads an empty block as no Properties', () => {
    expect(readProperties('---\n---\n')).toEqual({ state: 'readable', properties: [] })
  })

  it('tells each kind of value apart', () => {
    const result = readProperties(fm(
      'draft: false',
      'count: 007',
      'quoted: "yes"',
      'empty:',
      'list:',
      '  - x',
      '  - "y z"',
      'summary: |',
      '  one',
      '  two',
      'author:',
      '  name: Ann',
      '  url: ann.dev',
      'folded: >',
      '  a',
      '  b',
    ))
    if (result.state !== 'readable') throw new Error(result.state)
    expect(Object.fromEntries(result.properties.map((property) => [property.key, property.value]))).toEqual({
      draft: { kind: 'boolean', value: false },
      count: { kind: 'text', text: '007' },
      quoted: { kind: 'text', text: 'yes' },
      empty: { kind: 'text', text: '' },
      list: { kind: 'list', items: ['x', 'y z'] },
      summary: { kind: 'multiline', text: 'one\ntwo' },
      author: { kind: 'readonly', summary: 'name: Ann, url: ann.dev' },
      folded: { kind: 'readonly', summary: 'a b' },
    })
  })

  it('takes only true and false for a checkbox, not yes and no', () => {
    const result = readProperties(fm('a: yes', 'b: true'))
    if (result.state !== 'readable') throw new Error(result.state)
    expect(result.properties.map((property) => property.value.kind)).toEqual(['text', 'boolean'])
  })

  it('calls a block YAML refuses unreadable', () => {
    expect(readProperties(fm('title: a: b', 'tags: [a, b'))).toEqual({ state: 'unreadable' })
    expect(readProperties(fm('a: 1', 'a: 2'))).toEqual({ state: 'unreadable' })
    expect(readProperties(fm('- a', '- b'))).toEqual({ state: 'unreadable' })
  })

  it('reads a CRLF block', () => {
    const result = readProperties('---\r\ntitle: A\r\n---\r\n')
    expect(result).toEqual({ state: 'readable', properties: [{ key: 'title', value: { kind: 'text', text: 'A' }, line: 1 }] })
  })
})

describe('setPropertyText', () => {
  it('changes only the value, keeping every other byte and a trailing comment', () => {
    const before = fm('# heading comment', 'title: Everything   # the title', '', 'date: 2026-09-19')
    expect(setPropertyText(before, 'title', 'Overview')).toBe(fm('# heading comment', 'title: Overview   # the title', '', 'date: 2026-09-19'))
  })

  it('keeps the quote style of a quoted value', () => {
    expect(setPropertyText(fm("q: 'a'"), 'q', "it's")).toBe(fm("q: 'it''s'"))
    expect(setPropertyText(fm('q: "a"'), 'q', 'say "hi"')).toBe(fm('q: "say \\"hi\\""'))
  })

  it('quotes text YAML would read as something else', () => {
    for (const text of ['007', 'yes', 'null', 'true', 'a: b', 'a #b', '[x]', '- x', ' padded']) {
      const next = setPropertyText(fm('t: x'), 't', text)
      expect(next).toBe(fm(`t: ${JSON.stringify(text)}`))
    }
  })

  it('writes plain text bare', () => {
    expect(setPropertyText(fm('t: x'), 't', 'Hello world')).toBe(fm('t: Hello world'))
    expect(setPropertyText(fm('t: x'), 't', '2026-10-01')).toBe(fm('t: 2026-10-01'))
  })

  it('keeps a number a number, and writes a number edited into text as text', () => {
    expect(setPropertyText(fm('n: 3'), 'n', '4.5')).toBe(fm('n: 4.5'))
    expect(setPropertyText(fm('n: 3'), 'n', 'three')).toBe(fm('n: three'))
    expect(setPropertyText(fm('n: 3'), 'n', '0x10')).toBe(fm('n: 0x10'))
  })

  it('fills an empty value and empties a filled one', () => {
    expect(setPropertyText(fm('date:', 'x: 1'), 'date', 'today')).toBe(fm('date: today', 'x: 1'))
    expect(setPropertyText(fm('date: today', 'x: 1'), 'date', '')).toBe(fm('date:', 'x: 1'))
  })

  it('refuses a value that is not text, a missing key, and a line break', () => {
    expect(setPropertyText(fm('b: true'), 'b', 'x')).toBeNull()
    expect(setPropertyText(fm('a: 1'), 'missing', 'x')).toBeNull()
    expect(setPropertyText(fm('a: 1'), 'a', 'x\ny')).toBeNull()
  })

  it('keeps CRLF line endings', () => {
    expect(setPropertyText('---\r\na: 1\r\nb: 2\r\n---\r\n', 'a', 'x')).toBe('---\r\na: x\r\nb: 2\r\n---\r\n')
  })
})

describe('setPropertyBoolean', () => {
  it('writes true or false in place', () => {
    expect(setPropertyBoolean(fm('draft: false  # wip'), 'draft', true)).toBe(fm('draft: true  # wip'))
    expect(setPropertyBoolean(fm('draft: True'), 'draft', false)).toBe(fm('draft: false'))
  })
})

describe('setPropertyList', () => {
  it('keeps an inline list inline, and each untouched item as it was written', () => {
    expect(setPropertyList(fm("tags: ['a', b]"), 'tags', ['a', 'b', 'c d'])).toBe(fm("tags: ['a', b, c d]"))
  })

  it('quotes an item that would break the inline list', () => {
    expect(setPropertyList(fm('tags: [a]'), 'tags', ['a', 'x, y'])).toBe(fm('tags: [a, "x, y"]'))
  })

  it('keeps a block list a block list, at its indent', () => {
    const before = fm('tags:', '    - a', '    - b', 'next: 1')
    expect(setPropertyList(before, 'tags', ['a', 'c'])).toBe(fm('tags:', '    - a', '    - c', 'next: 1'))
  })

  it('writes an emptied list as []', () => {
    expect(setPropertyList(fm('tags:', '  - a', 'next: 1'), 'tags', [])).toBe(fm('tags: []', 'next: 1'))
    expect(setPropertyList(fm('tags: [a]'), 'tags', [])).toBe(fm('tags: []'))
  })

  it('refuses a list with nested items', () => {
    expect(setPropertyList(fm('tags:', '  - a: 1'), 'tags', ['x'])).toBeNull()
  })
})

describe('setPropertyMultiline', () => {
  it('rewrites a | block at its indent, keeping its chomping', () => {
    expect(setPropertyMultiline(fm('s: |-', '    one', '    two', 'n: 1'), 's', 'one\nthree\nfour'))
      .toBe(fm('s: |-', '    one', '    three', '    four', 'n: 1'))
    expect(setPropertyMultiline(fm('s: |', '  one', 'n: 1'), 's', 'a\n\nb')).toBe(fm('s: |', '  a', '', '  b', 'n: 1'))
  })

  it('reads back what it wrote', () => {
    const next = setPropertyMultiline(fm('s: |', '  one'), 's', 'x\n  indented\ny')
    expect(next).not.toBeNull()
    expect(readProperties(next ?? '')).toEqual({
      state: 'readable',
      properties: [{ key: 's', value: { kind: 'multiline', text: 'x\n  indented\ny' }, line: 1 }],
    })
  })

  it('adds an indentation indicator when the first line starts with a space', () => {
    const next = setPropertyMultiline(fm('s: |', '  one'), 's', ' lead\nx')
    expect(next).toBe(fm('s: |2', '   lead', '  x'))
    expect(readProperties(next ?? '')).toMatchObject({ properties: [{ value: { kind: 'multiline', text: ' lead\nx' } }] })
  })
})

describe('renameProperty', () => {
  it('rewrites the key only', () => {
    expect(renameProperty(fm('title: A  # c', 'x: 1'), 'title', 'name')).toBe(fm('name: A  # c', 'x: 1'))
  })

  it('refuses a key that exists or is empty', () => {
    expect(renameProperty(fm('a: 1', 'b: 2'), 'a', 'b')).toBeNull()
    expect(renameProperty(fm('a: 1'), 'a', '  ')).toBeNull()
  })

  it('quotes a key YAML would misread', () => {
    expect(renameProperty(fm('a: 1'), 'a', 'x: y')).toBe(fm('"x: y": 1'))
  })
})

describe('removeProperty', () => {
  it('removes all of the Property lines and nothing else', () => {
    const before = fm('title: A', '# kept', 'tags:', '  - a', '  - b', 'summary: |', '  one', 'last: 1')
    expect(removeProperty(before, 'tags')).toBe(fm('title: A', '# kept', 'summary: |', '  one', 'last: 1'))
    expect(removeProperty(before, 'summary')).toBe(fm('title: A', '# kept', 'tags:', '  - a', '  - b', 'last: 1'))
    expect(removeProperty(before, 'last')).toBe(fm('title: A', '# kept', 'tags:', '  - a', '  - b', 'summary: |', '  one'))
  })

  it('removes the whole block when nothing is left', () => {
    expect(removeProperty(fm('only: 1'), 'only')).toBe('')
  })

  it('keeps the block when a comment is left', () => {
    expect(removeProperty(fm('# for the blog', 'only: 1'), 'only')).toBe(fm('# for the blog'))
  })
})

describe('addProperty', () => {
  it('appends key: as the last Property', () => {
    expect(addProperty(fm('a: 1', '# end'), 'status')).toBe(fm('a: 1', '# end', 'status:'))
  })

  it('creates the Frontmatter when the Document has none', () => {
    expect(addProperty('', 'status')).toBe('---\nstatus:\n---\n')
  })

  it('fills an empty block', () => {
    expect(addProperty('---\n---\n', 'status')).toBe('---\nstatus:\n---\n')
  })

  it('refuses a key that exists, and an unreadable block', () => {
    expect(addProperty(fm('a: 1'), 'a')).toBeNull()
    expect(addProperty(fm('a: [1'), 'b')).toBeNull()
    expect(hasProperty(fm('a: 1'), ' a ')).toBe(true)
  })
})
