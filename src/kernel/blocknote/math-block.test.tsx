import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MathBlockEditor } from './math-block'
import { subscribeRichEditorExternalChange } from './editor-external-change-events'

function renderMathBlockEditor(latex = '\\sqrt{x}') {
  const editor = {
    focus: vi.fn(),
    updateBlock: vi.fn(),
  }
  const block = {
    id: 'math-block',
    props: { latex },
  }

  render(<MathBlockEditor block={block} editor={editor} />)

  return { block, editor }
}

describe('MathBlockEditor', () => {
  it('renders display math without exposing Markdown delimiters as editor content', () => {
    renderMathBlockEditor()

    expect(screen.getByRole('img')).toHaveAttribute('data-latex', '\\sqrt{x}')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('lets tall display math expand beyond the default button height', () => {
    renderMathBlockEditor('\\frac{\\partial L}{\\partial z_t}')

    const shell = screen.getByRole('button')
    expect(shell).toHaveClass('h-auto', 'min-h-9')
    expect(shell).not.toHaveClass('h-9')
  })

  it('edits the math block latex prop instead of inserting Markdown source', () => {
    const { editor } = renderMathBlockEditor()
    const onExternalChange = vi.fn()
    const unsubscribe = subscribeRichEditorExternalChange(editor, onExternalChange)

    fireEvent.doubleClick(screen.getByRole('img'))
    const source = screen.getByRole('textbox')
    fireEvent.change(source, { target: { value: '\\frac{1}{2}' } })
    fireEvent.blur(source)

    expect(editor.updateBlock).toHaveBeenCalledWith('math-block', {
      props: { latex: '\\frac{1}{2}' },
    })
    expect(editor.updateBlock).not.toHaveBeenCalledWith('math-block', {
      props: { latex: '$$\\frac{1}{2}$$' },
    })
    expect(onExternalChange).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('ignores stale math block updates after the owning block disappears', () => {
    const { editor } = renderMathBlockEditor()
    const onExternalChange = vi.fn()
    const unsubscribe = subscribeRichEditorExternalChange(editor, onExternalChange)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    editor.updateBlock.mockImplementation(() => {
      throw new Error('Block with ID math-block not found')
    })

    fireEvent.doubleClick(screen.getByRole('img'))
    const source = screen.getByRole('textbox')
    fireEvent.change(source, { target: { value: '\\frac{1}{2}' } })

    expect(() => fireEvent.blur(source)).not.toThrow()
    expect(editor.updateBlock).toHaveBeenCalledWith('math-block', {
      props: { latex: '\\frac{1}{2}' },
    })
    expect(onExternalChange).not.toHaveBeenCalled()
    expect(editor.focus).toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(
      '[editor] Recovered rich-editor transform error:',
      expect.any(Error),
    )
    unsubscribe()
    warnSpy.mockRestore()
  })

  it('cancels math block editing without changing the block', () => {
    const { editor } = renderMathBlockEditor()

    fireEvent.doubleClick(screen.getByRole('img'))
    const source = screen.getByRole('textbox')
    fireEvent.change(source, { target: { value: '\\frac{1}{2}' } })
    fireEvent.keyDown(source, { key: 'Escape' })
    fireEvent.blur(source)

    expect(editor.updateBlock).not.toHaveBeenCalled()
    expect(editor.focus).toHaveBeenCalled()
  })

  it('uses editor selection colors and a single focused border while editing', () => {
    renderMathBlockEditor()

    fireEvent.doubleClick(screen.getByRole('img'))
    const source = screen.getByRole('textbox')

    expect(source).toHaveClass('selection:bg-selection')
    expect(source).toHaveClass('selection:text-foreground')
    expect(source).toHaveClass('focus-visible:ring-0')
    expect(source).not.toHaveClass('focus-visible:ring-[3px]')
  })

  it('keeps display math selection chrome scoped to the rendered formula width', () => {
    renderMathBlockEditor()

    const shell = screen.getByRole('button')
    expect(shell).toHaveClass('w-fit', 'mx-auto', 'max-w-full', 'overflow-x-auto')

    fireEvent.doubleClick(screen.getByRole('img'))
    const editingShell = screen.getByRole('textbox').parentElement?.parentElement
    expect(editingShell).toHaveClass('w-full', 'max-w-full', 'overflow-x-auto')
    expect(editingShell).not.toHaveClass('w-fit')
  })
})
