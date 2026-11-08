import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { HighlightBoundaryColorControl } from './markdown-highlight-boundary-control'
import type { HighlightEditor } from './markdown-highlight-model'

export {
  applyMarkdownHighlightColor,
  toggleDefaultMarkdownHighlight,
} from './markdown-highlight-model'
export { readMarkdownHighlightRange } from './markdown-highlight-range'

// The boundary control (the colour button beside a highlight the cursor sits
// in) is mounted by the extension in its own root (it draws into a popover on
// the body, so the host holds nothing visible); the toolbar's colour caret
// is part of the formatting toolbar itself (markdown-highlight-toolbar-control.tsx).

function unmountControl(root: Root, host: HTMLElement) {
  queueMicrotask(() => {
    root.unmount()
    host.remove()
  })
}

function mountBoundaryControl(editor: HighlightEditor, ownerDocument: Document): {
  host: HTMLElement
  root: Root
} {
  const host = ownerDocument.createElement('div')
  host.dataset.test = 'highlightBoundaryControlHost'
  ownerDocument.body.appendChild(host)
  const root = createRoot(host)
  root.render(createElement(HighlightBoundaryColorControl, { editor }))
  return { host, root }
}

export function mountMarkdownHighlightControls({
  dom,
  editor,
  signal,
}: {
  dom: HTMLElement
  editor: HighlightEditor
  signal: AbortSignal
}) {
  const boundaryControl = mountBoundaryControl(editor, dom.ownerDocument)
  signal.addEventListener('abort', () => {
    unmountControl(boundaryControl.root, boundaryControl.host)
  }, { once: true })
}
