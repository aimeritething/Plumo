import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EmptyEditor } from './empty-editor'

describe('EmptyEditor', () => {
  it('with no Folder open shows the dim wordmark and the one hint, Open Folder', () => {
    render(<EmptyEditor hasFolder={false} />)

    const empty = screen.getByTestId('editor-empty-state')
    expect(empty).toHaveTextContent('Plumo')
    expect(screen.getAllByTestId('empty-hint').map((hint) => hint.textContent)).toEqual(['⌘OOpen Folder'])
  })

  it('with a Folder open and no Tab shows New document and Quick Open, each key a chip', () => {
    render(<EmptyEditor hasFolder />)

    const hints = screen.getAllByTestId('empty-hint')
    expect(hints.map((hint) => hint.textContent)).toEqual(['⌘NNew document', '⌘PQuick Open'])
    expect(hints.map((hint) => hint.querySelector('kbd')?.textContent)).toEqual(['⌘N', '⌘P'])
  })
})
