import { describe, expect, it } from 'vitest'
import { parseReleaseNotes } from './release-notes'

describe('parseReleaseNotes', () => {
  it('groups the changes under the changelog headings', () => {
    expect(parseReleaseNotes('### Added\n\n- Plumo updates itself.\n- A second thing.\n\n### Fixed\n\n- A crash.\n')).toEqual([
      { heading: 'Added', items: ['Plumo updates itself.', 'A second thing.'] },
      { heading: 'Fixed', items: ['A crash.'] },
    ])
  })

  it('shows inline Markdown as plain text, and joins a wrapped change', () => {
    expect(parseReleaseNotes('### Fixed\n- `Raw mode` keeps **its** scroll, see [the issue](https://example.com/1)\n  across Tab switches.')).toEqual([
      { heading: 'Fixed', items: ['Raw mode keeps its scroll, see the issue across Tab switches.'] },
    ])
  })

  it('keeps changes written before any heading, and drops a heading with nothing under it', () => {
    expect(parseReleaseNotes('First release.\n\n### Added\n\n### Fixed\n- One.')).toEqual([
      { heading: null, items: ['First release.'] },
      { heading: 'Fixed', items: ['One.'] },
    ])
  })

  it('has no groups for empty notes', () => {
    expect(parseReleaseNotes('')).toEqual([])
  })
})
