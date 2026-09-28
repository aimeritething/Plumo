import { describe, expect, it, vi } from 'vitest'
import { BlockNoteEditor } from '@blocknote/core'
import {
  createRichEditorPasteHandler,
  handleRichEditorPaste,
  pasteTakesClipboardFiles,
  type RichEditorPasteContext,
} from './rich-editor-paste'
import { schema } from './editor-schema'

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
}))

function clipboardDataFor(data: Record<string, string>): DataTransfer {
  return {
    getData: vi.fn((type: string) => data[type] ?? ''),
    types: Object.keys(data),
  } as unknown as DataTransfer
}

function pasteContext(data: Record<string, string>): RichEditorPasteContext {
  return {
    defaultPasteHandler: vi.fn(() => true),
    editor: { pasteMarkdown: vi.fn(), pasteText: vi.fn(() => true) },
    event: {
      clipboardData: clipboardDataFor(data),
    } as unknown as ClipboardEvent,
  }
}

const angleOpen = String.fromCharCode(60)
const angleClose = String.fromCharCode(62)
const cppInclude = `#include ${angleOpen}iostream${angleClose}`
const cppSource = `${cppInclude}\nint main() { return 0; }`
const fencedCppSource = ['```', cppSource, '```'].join('\n')

function htmlTag(name: string): string {
  return `${angleOpen}${name}${angleClose}`
}

function htmlCodeBlock(markup: string): string {
  return `${htmlTag('pre')}${htmlTag('code')}${markup}${htmlTag('/code')}${htmlTag('/pre')}`
}

describe('handleRichEditorPaste', () => {
  it('leaves a pasted image to the kernel, which writes it as an Attachment', () => {
    // A screenshot on the clipboard arrives as files and nothing else; the
    // default handler is BlockNote's file branch, and `uploadFile` puts the
    // Attachment in `attachments/` beside the Document.
    const context = pasteContext({})
    context.event = {
      clipboardData: {
        getData: vi.fn(() => ''),
        types: ['Files'],
      },
    } as unknown as ClipboardEvent

    expect(handleRichEditorPaste(context)).toBe(true)

    expect(context.defaultPasteHandler).toHaveBeenCalledWith()
    expect(context.editor.pasteText).not.toHaveBeenCalled()
  })

  it('turns a selected label into a link when a URL is pasted', () => {
    const createLink = vi.fn()
    const context = pasteContext({
      'text/plain': 'https://example.com/docs?section=editor&mode=rich',
    })
    context.editor = {
      createLink,
      getSelectedText: vi.fn(() => 'selected label'),
      pasteText: vi.fn(() => true),
    }

    expect(handleRichEditorPaste(context)).toBe(true)

    expect(createLink).toHaveBeenCalledWith('https://example.com/docs?section=editor&mode=rich')
    expect(context.defaultPasteHandler).not.toHaveBeenCalled()
    expect(context.editor.pasteText).not.toHaveBeenCalled()
  })

  it('keeps non-URL text and internal editor clips on their normal paste paths', () => {
    const nonUrlContext = pasteContext({ 'text/plain': 'plain clipboard text' })
    nonUrlContext.editor = {
      createLink: vi.fn(),
      getSelectedText: vi.fn(() => 'selected label'),
      pasteText: vi.fn(() => true),
    }
    const internalContext = pasteContext({
      'blocknote/html': '<p>https://example.com</p>',
      'text/plain': 'https://example.com',
    })
    internalContext.editor = {
      createLink: vi.fn(),
      getSelectedText: vi.fn(() => 'selected label'),
      pasteText: vi.fn(() => true),
    }

    expect(handleRichEditorPaste(nonUrlContext)).toBe(true)
    expect(handleRichEditorPaste(internalContext)).toBe(true)

    expect(nonUrlContext.defaultPasteHandler).toHaveBeenCalledOnce()
    expect(internalContext.defaultPasteHandler).toHaveBeenCalledOnce()
    expect(nonUrlContext.editor.createLink).not.toHaveBeenCalled()
    expect(internalContext.editor.createLink).not.toHaveBeenCalled()
  })

  it('prioritizes pasted web HTML when it contains images', () => {
    const context = pasteContext({
      'text/html': '<article><p>Intro</p><img src="https://example.com/photo.png" alt="Photo"></article>',
      'text/plain': 'Intro',
    })

    expect(handleRichEditorPaste(context)).toBe(true)

    expect(context.defaultPasteHandler).toHaveBeenCalledWith({ prioritizeMarkdownOverHTML: false })
    expect(context.editor.pasteText).not.toHaveBeenCalled()
  })

  it('keeps internal BlockNote image clips on the regular paste path', () => {
    const context = pasteContext({
      'blocknote/html': '<div data-content-type="image"></div>',
      'text/html': '<img src="asset://localhost/photo.png">',
      'text/plain': '![photo](attachments/photo.png)',
    })

    expect(handleRichEditorPaste(context)).toBe(true)

    expect(context.defaultPasteHandler).toHaveBeenCalledWith()
  })

  it('keeps explicit Markdown clips containing angle brackets on the regular paste path', () => {
    const context = pasteContext({
      'text/markdown': 'Use <kbd>Enter</kbd>',
      'text/plain': 'Use <kbd>Enter</kbd>',
    })

    expect(handleRichEditorPaste(context)).toBe(true)

    expect(context.defaultPasteHandler).toHaveBeenCalledWith()
    expect(context.editor.pasteText).not.toHaveBeenCalled()
  })

  it('preserves linked inline-code Markdown pasted as plain text', () => {
    const context = pasteContext({
      'text/plain': '[`some-symbol`](https://example.com)',
    })
    const editor = BlockNoteEditor.create({ schema })
    context.editor = editor as unknown as RichEditorPasteContext['editor']

    expect(handleRichEditorPaste(context)).toBe(true)

    expect(editor.document[0].content).toEqual([{
      content: [{ styles: { code: true }, text: 'some-symbol', type: 'text' }],
      href: 'https://example.com',
      type: 'link',
    }])
    expect(context.defaultPasteHandler).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: 'fenced code Markdown with angle brackets',
      data: { 'text/plain': fencedCppSource },
    },
    {
      name: 'pasted HTML code blocks',
      data: {
        'text/html': htmlCodeBlock('#include &lt;iostream&gt;\nint main() { return 0; }'),
        'text/plain': cppSource,
      },
    },
  ])('converts $name before literal text handling', ({ data }) => {
    const context = pasteContext(data)

    expect(handleRichEditorPaste(context)).toBe(true)

    expect(context.editor.pasteMarkdown).toHaveBeenCalledWith(fencedCppSource)
    expect(context.defaultPasteHandler).not.toHaveBeenCalled()
    expect(context.editor.pasteText).not.toHaveBeenCalled()
  })

  describe('what counts as a copied code snippet (AIM-467)', () => {
    it('a snippet wrapped the way a browser wraps a copy is still one code block', () => {
      const context = pasteContext({
        'text/html': `${htmlTag('meta charset="utf-8"')}${htmlTag('div')}${htmlCodeBlock('x = 1')}${htmlTag('/div')}`,
        'text/plain': 'x = 1',
      })

      expect(handleRichEditorPaste(context)).toBe(true)

      expect(context.editor.pasteMarkdown).toHaveBeenCalledWith('```\nx = 1\n```')
      expect(context.defaultPasteHandler).not.toHaveBeenCalled()
    })

    it('prose beside the snippet is a page fragment, pasted as one by the Kernel', () => {
      const context = pasteContext({
        'text/html': `${htmlTag('p')}Run it like so:${htmlTag('/p')}${htmlCodeBlock('x = 1')}`,
        'text/plain': 'Run it like so:\nx = 1',
      })

      expect(handleRichEditorPaste(context)).toBe(true)

      expect(context.defaultPasteHandler).toHaveBeenCalledWith()
      expect(context.editor.pasteMarkdown).not.toHaveBeenCalled()
      expect(context.editor.pasteText).not.toHaveBeenCalled()
    })

    it('two snippets are a fragment too', () => {
      const context = pasteContext({
        'text/html': `${htmlCodeBlock('x = 1')}${htmlCodeBlock('y = 2')}`,
        'text/plain': 'x = 1\ny = 2',
      })

      expect(handleRichEditorPaste(context)).toBe(true)

      expect(context.defaultPasteHandler).toHaveBeenCalledWith()
      expect(context.editor.pasteMarkdown).not.toHaveBeenCalled()
    })

    it('a snippet whose text is a fence makes one block, with the fence\'s language', () => {
      const cursorBlock = { id: 'empty-paragraph', type: 'paragraph', content: [] }
      const context = pasteContext({
        'text/html': htmlCodeBlock('```ts\nconst answer = 42\n```'),
        'text/plain': '```ts\nconst answer = 42\n```',
      })
      context.editor = {
        getTextCursorPosition: vi.fn(() => ({ block: cursorBlock })),
        insertBlocks: vi.fn(),
        pasteMarkdown: vi.fn(),
        pasteText: vi.fn(() => true),
        replaceBlocks: vi.fn(),
      }

      expect(handleRichEditorPaste(context)).toBe(true)

      expect(context.editor.replaceBlocks).toHaveBeenCalledTimes(1)
      expect(context.editor.replaceBlocks).toHaveBeenCalledWith([cursorBlock], [expect.objectContaining({
        content: [{ styles: {}, text: 'const answer = 42', type: 'text' }],
        props: { language: 'typescript' },
        type: 'codeBlock',
      })])
      expect(context.editor.insertBlocks).not.toHaveBeenCalled()
    })

    it('inside a code block the clipboard goes to the Kernel, which pastes its text at the caret', () => {
      const context = pasteContext({
        'text/html': htmlCodeBlock('x = 1'),
        'text/plain': fencedCppSource,
      })
      context.editor = {
        getTextCursorPosition: vi.fn(() => ({ block: { id: 'code', type: 'codeBlock', content: [] } })),
        insertBlocks: vi.fn(),
        pasteMarkdown: vi.fn(),
        pasteText: vi.fn(() => true),
        replaceBlocks: vi.fn(),
      }

      expect(handleRichEditorPaste(context)).toBe(true)

      expect(context.defaultPasteHandler).toHaveBeenCalledWith()
      expect(context.editor.insertBlocks).not.toHaveBeenCalled()
      expect(context.editor.replaceBlocks).not.toHaveBeenCalled()
      expect(context.editor.pasteMarkdown).not.toHaveBeenCalled()
    })
  })

  it('does not parse untrusted HTML code without a plain-text clipboard source', () => {
    const context = pasteContext({
      'text/html': htmlCodeBlock('&lt;script&gt;window.compromised = true&lt;/script&gt;'),
    })

    expect(handleRichEditorPaste(context)).toBe(true)

    expect(context.defaultPasteHandler).toHaveBeenCalledWith()
    expect(context.editor.pasteMarkdown).not.toHaveBeenCalled()
    expect(context.editor.pasteText).not.toHaveBeenCalled()
  })

  it('replaces an empty paragraph with a canonicalized pasted code block', () => {
    const cursorBlock = { id: 'empty-paragraph', type: 'paragraph', content: [] }
    const context = pasteContext({
      'text/plain': '```ts\nconst answer: number = 42\n```',
    })
    context.editor = {
      getTextCursorPosition: vi.fn(() => ({ block: cursorBlock })),
      insertBlocks: vi.fn(),
      pasteMarkdown: vi.fn(),
      pasteText: vi.fn(() => true),
      replaceBlocks: vi.fn(),
    }

    expect(handleRichEditorPaste(context)).toBe(true)

    expect(context.editor.replaceBlocks).toHaveBeenCalledWith([cursorBlock], [{
      children: [],
      content: [{ styles: {}, text: 'const answer: number = 42', type: 'text' }],
      props: { language: 'typescript' },
      type: 'codeBlock',
    }])
    expect(context.editor.insertBlocks).not.toHaveBeenCalled()
    expect(context.editor.pasteMarkdown).not.toHaveBeenCalled()
    expect(context.editor.pasteText).not.toHaveBeenCalled()
  })
})

describe('pasteTakesClipboardFiles', () => {
  const image = new File(['png'], 'shot.png', { type: 'image/png' })

  function clipboardWith(types: string[]): DataTransfer {
    const files = types.includes('Files') ? [image] : []
    return {
      files,
      items: files.map((file) => ({ kind: 'file', type: file.type, getAsFile: () => file })),
      getData: (type: string) => (type === 'Files' || !types.includes(type) ? '' : type === 'text/plain' ? 'shot.png' : '<p>shot</p>'),
      types,
    } as unknown as DataTransfer
  }

  const shapes = [
    { name: 'an image alone', types: ['Files'], takesFiles: true },
    { name: 'an image with its name as text', types: ['text/plain', 'Files'], takesFiles: false },
    { name: 'an image with a web page', types: ['text/html', 'Files'], takesFiles: false },
    { name: 'text alone', types: ['text/plain'], takesFiles: false },
    { name: 'nothing', types: [], takesFiles: false },
  ]

  it.each(shapes)('says whether a paste of $name becomes its files', ({ types, takesFiles }) => {
    expect(pasteTakesClipboardFiles(clipboardWith(types))).toBe(takesFiles)
  })

  it.each(shapes.filter(({ types }) => types.includes('Files')))(
    'agrees with what a Rich mode paste of $name does',
    async ({ types, takesFiles }) => {
      // ProseMirror's text paste builds one; jsdom has none.
      vi.stubGlobal('ClipboardEvent', class extends Event { clipboardData = null })
      const uploadFile = vi.fn(async () => 'asset://localhost/shot.png')
      const editor = BlockNoteEditor.create({ schema, uploadFile, pasteHandler: createRichEditorPasteHandler() })
      const host = document.createElement('div')
      document.body.appendChild(host)
      editor.mount(host)
      const paste = new Event('paste', { bubbles: true, cancelable: true })
      Object.assign(paste, { clipboardData: clipboardWith(types) })

      editor.prosemirrorView.dom.dispatchEvent(paste)
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(uploadFile.mock.calls.length > 0).toBe(takesFiles)
      editor.unmount()
      host.remove()
      vi.unstubAllGlobals()
    },
  )
})
