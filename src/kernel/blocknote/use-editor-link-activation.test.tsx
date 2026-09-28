import { useRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/platform/url', async () => {
  const actual = await vi.importActual('@/platform/url') as typeof import('@/platform/url')
  return {
    ...actual,
    openExternalUrl: vi.fn().mockResolvedValue(undefined),
    openLocalFile: vi.fn().mockResolvedValue(undefined),
  }
})

import { openExternalUrl, openLocalFile } from '@/platform/url'
import { useEditorLinkActivation } from './use-editor-link-activation'

const mockOpenExternalUrl = vi.mocked(openExternalUrl)
const mockOpenLocalFile = vi.mocked(openLocalFile)

function Harness({
  onNavigateWikilink,
  onOpenLinkReady,
  sourceEntryPath,
  vaultPath,
}: {
  onNavigateWikilink: (target: string) => void
  onOpenLinkReady: (openLink: (href: string) => void) => void
  sourceEntryPath?: string
  vaultPath?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  onOpenLinkReady(useEditorLinkActivation(containerRef, onNavigateWikilink, vaultPath, sourceEntryPath))
  return <div ref={containerRef} data-testid="editor-link-container" />
}

function renderHarness(
  onNavigateWikilink = vi.fn(),
  vaultPath?: string,
  sourceEntryPath?: string,
) {
  let openLink: (href: string) => void = () => {
    throw new Error('the link opener was not returned')
  }
  render(
    <Harness
      onNavigateWikilink={onNavigateWikilink}
      onOpenLinkReady={(opener) => { openLink = opener }}
      sourceEntryPath={sourceEntryPath}
      vaultPath={vaultPath}
    />,
  )
  return {
    container: screen.getByTestId('editor-link-container') as HTMLDivElement,
    onNavigateWikilink,
    openLink: (href: string) => openLink(href),
  }
}

function appendUrl(container: HTMLElement, href: string) {
  const link = document.createElement('a')
  link.setAttribute('href', href)
  link.textContent = href
  container.appendChild(link)
  return link
}

function dispatchMouseEvent(target: Node, type: string, options: MouseEventInit = {}) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    ...options,
  })
  target.dispatchEvent(event)
  return event
}

describe('useEditorLinkActivation', () => {
  beforeEach(() => {
    mockOpenExternalUrl.mockClear()
    mockOpenLocalFile.mockClear()
  })

  it('opens URLs only on Cmd+click', () => {
    const { container } = renderHarness()
    const link = appendUrl(container, 'https://example.com')

    const plainClick = dispatchMouseEvent(link, 'click')
    expect(mockOpenExternalUrl).not.toHaveBeenCalled()
    expect(plainClick.defaultPrevented).toBe(true)

    const modifiedClick = dispatchMouseEvent(link, 'click', { metaKey: true })
    expect(mockOpenExternalUrl).toHaveBeenCalledWith('https://example.com')
    expect(modifiedClick.defaultPrevented).toBe(true)
  })

  it('opens linked inline code on Cmd+click for either DOM nesting order', () => {
    const { container } = renderHarness()
    const nestedCode = document.createElement('code')
    nestedCode.textContent = 'some-symbol'
    appendUrl(container, 'https://nested.example.com').replaceChildren(nestedCode)
    const wrappingCode = document.createElement('code')
    const wrappedLink = appendUrl(wrappingCode, 'https://wrapped.example.com')
    container.appendChild(wrappingCode)

    const nestedClick = dispatchMouseEvent(nestedCode, 'click', { metaKey: true })
    const wrappedClick = dispatchMouseEvent(wrappedLink, 'click', { metaKey: true })

    expect(nestedClick.defaultPrevented).toBe(true)
    expect(wrappedClick.defaultPrevented).toBe(true)
    expect(mockOpenExternalUrl).toHaveBeenNthCalledWith(1, 'https://nested.example.com')
    expect(mockOpenExternalUrl).toHaveBeenNthCalledWith(2, 'https://wrapped.example.com')
  })

  it('opens modified URL mousedown before editor internals see stale link nodes', () => {
    const { container } = renderHarness()
    const link = appendUrl(container, 'https://example.com')
    const targetMouseDown = vi.fn()
    link.addEventListener('mousedown', targetMouseDown)

    const plainMouseDown = dispatchMouseEvent(link, 'mousedown')
    expect(plainMouseDown.defaultPrevented).toBe(false)
    expect(targetMouseDown).toHaveBeenCalledOnce()
    targetMouseDown.mockClear()

    const modifiedMouseDown = dispatchMouseEvent(link, 'mousedown', { metaKey: true })

    expect(modifiedMouseDown.defaultPrevented).toBe(true)
    expect(targetMouseDown).not.toHaveBeenCalled()
    const click = dispatchMouseEvent(link, 'click', { metaKey: true })

    expect(click.defaultPrevented).toBe(true)
    expect(mockOpenExternalUrl).toHaveBeenCalledOnce()
    expect(mockOpenExternalUrl).toHaveBeenCalledWith('https://example.com')
  })

  it('suppresses the follow-up modified URL click even when it arrives after zero-delay timers', () => {
    vi.useFakeTimers()
    try {
      const { container } = renderHarness()
      const link = appendUrl(container, 'https://example.com')

      const modifiedMouseDown = dispatchMouseEvent(link, 'mousedown', { ctrlKey: true })
      vi.advanceTimersByTime(0)
      const delayedClick = dispatchMouseEvent(link, 'click', { ctrlKey: true })

      expect(modifiedMouseDown.defaultPrevented).toBe(true)
      expect(delayedClick.defaultPrevented).toBe(true)
      expect(mockOpenExternalUrl).toHaveBeenCalledOnce()
      expect(mockOpenExternalUrl).toHaveBeenCalledWith('https://example.com')
    } finally {
      vi.useRealTimers()
    }
  })

  it('handles URL events that originate on link text nodes', () => {
    const { container } = renderHarness()
    const link = appendUrl(container, 'https://example.com')
    const textNode = link.firstChild
    expect(textNode).toBeInstanceOf(Text)
    if (!textNode) throw new Error('Expected link text node')

    dispatchMouseEvent(textNode, 'mousedown', { metaKey: true })
    const click = dispatchMouseEvent(textNode, 'click', { metaKey: true })

    expect(click.defaultPrevented).toBe(true)
    expect(mockOpenExternalUrl).toHaveBeenCalledOnce()
    expect(mockOpenExternalUrl).toHaveBeenCalledWith('https://example.com')
  })

  it('blocks malformed URL anchors instead of opening or falling through', () => {
    const { container } = renderHarness()
    const link = appendUrl(container, 'https://exa mple.com')

    const plainClick = dispatchMouseEvent(link, 'click')
    const modifiedClick = dispatchMouseEvent(link, 'click', { metaKey: true })

    expect(plainClick.defaultPrevented).toBe(true)
    expect(modifiedClick.defaultPrevented).toBe(true)
    expect(mockOpenExternalUrl).not.toHaveBeenCalled()
  })

  it('opens relative attachment links through the active vault path', () => {
    const { container } = renderHarness(vi.fn(), '/vault')
    const link = appendUrl(container, 'attachments/report.pdf')

    const modifiedClick = dispatchMouseEvent(link, 'click', { metaKey: true })

    expect(modifiedClick.defaultPrevented).toBe(true)
    expect(mockOpenLocalFile).toHaveBeenCalledWith('/vault/attachments/report.pdf', '/vault')
    expect(mockOpenExternalUrl).not.toHaveBeenCalled()
  })

  it('routes markdown note links through note navigation', async () => {
    const { container, onNavigateWikilink } = renderHarness()
    const link = appendUrl(container, 'other.md')

    const modifiedClick = dispatchMouseEvent(link, 'click', { metaKey: true })

    expect(modifiedClick.defaultPrevented).toBe(true)
    expect(mockOpenExternalUrl).not.toHaveBeenCalled()
    expect(mockOpenLocalFile).not.toHaveBeenCalled()
    expect(onNavigateWikilink).not.toHaveBeenCalled()

    await Promise.resolve()
    expect(onNavigateWikilink).toHaveBeenCalledWith('other')
  })

  it('normalizes relative markdown note links from the source note path', async () => {
    const { container, onNavigateWikilink } = renderHarness(
      vi.fn(),
      '/vault',
      '/vault/areas/current.md',
    )
    const link = appendUrl(container, '../projects/roadmap.md#goals')

    const modifiedClick = dispatchMouseEvent(link, 'click', { metaKey: true })

    expect(modifiedClick.defaultPrevented).toBe(true)
    await Promise.resolve()
    expect(onNavigateWikilink).toHaveBeenCalledWith('projects/roadmap')
    expect(mockOpenExternalUrl).not.toHaveBeenCalled()
    expect(mockOpenLocalFile).not.toHaveBeenCalled()
  })

  it('normalizes Windows relative markdown note links against the active vault', async () => {
    const vaultPath = String.raw`C:\Users\alex\Documents\Notes`
    const sourcePath = String.raw`C:\Users\alex\Documents\Notes\areas\current.md`
    const { container, onNavigateWikilink } = renderHarness(vi.fn(), vaultPath, sourcePath)
    const link = appendUrl(container, String.raw`..\projects\roadmap.md#goals`)

    const modifiedClick = dispatchMouseEvent(link, 'click', { ctrlKey: true })

    expect(modifiedClick.defaultPrevented).toBe(true)
    await Promise.resolve()
    expect(onNavigateWikilink).toHaveBeenCalledWith('projects/roadmap')
    expect(mockOpenExternalUrl).not.toHaveBeenCalled()
    expect(mockOpenLocalFile).not.toHaveBeenCalled()
  })

  it('scrolls same-note markdown anchors to matching headings', () => {
    const { container, onNavigateWikilink } = renderHarness()
    const link = appendUrl(container, '#project-goals')
    const heading = document.createElement('div')
    heading.setAttribute('data-content-type', 'heading')
    heading.textContent = 'Project Goals'
    heading.scrollIntoView = vi.fn()
    container.appendChild(heading)

    const modifiedClick = dispatchMouseEvent(link, 'click', { metaKey: true })

    expect(modifiedClick.defaultPrevented).toBe(true)
    expect(heading.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    expect(onNavigateWikilink).not.toHaveBeenCalled()
    expect(mockOpenExternalUrl).not.toHaveBeenCalled()
    expect(mockOpenLocalFile).not.toHaveBeenCalled()
  })

  it('ignores malformed URLs and links inside code blocks', () => {
    const { container, onNavigateWikilink } = renderHarness()
    const codeBlock = document.createElement('div')
    codeBlock.setAttribute('data-content-type', 'codeBlock')
    const codeLink = appendUrl(codeBlock, 'other.md')
    container.appendChild(codeBlock)
    const badLink = appendUrl(container, 'not a url')

    fireEvent.click(codeLink, { metaKey: true })
    fireEvent.click(badLink, { metaKey: true })

    expect(onNavigateWikilink).not.toHaveBeenCalled()
    expect(mockOpenExternalUrl).not.toHaveBeenCalled()
  })

  it('toggles follow-link cursor mode while Cmd is held', () => {
    const { container } = renderHarness()

    expect(container.hasAttribute('data-follow-links')).toBe(false)
    fireEvent.keyDown(window, { key: 'Meta', metaKey: true })
    expect(container.hasAttribute('data-follow-links')).toBe(true)
    fireEvent.keyUp(window, { key: 'Meta' })
    expect(container.hasAttribute('data-follow-links')).toBe(false)
  })
})

// The link toolbar's Open button calls the opener the hook returns; ⌘+click
// goes through the same function, so both follow a link the same way.
describe.each([
  ['Cmd+click', (harness: ReturnType<typeof renderHarness>, href: string) => {
    dispatchMouseEvent(appendUrl(harness.container, href), 'click', { metaKey: true })
  }],
  ['the link toolbar Open button', (harness: ReturnType<typeof renderHarness>, href: string) => {
    harness.openLink(href)
  }],
])('following a link with %s', (_way, follow) => {
  beforeEach(() => {
    mockOpenExternalUrl.mockClear()
    mockOpenLocalFile.mockClear()
  })

  it.each([
    ['other.md', 'other'],
    ['notes/other.md', 'notes/other'],
  ])('opens the Document %s in Plumo', async (href, target) => {
    const harness = renderHarness(vi.fn(), '/vault', '/vault/current.md')

    follow(harness, href)

    await Promise.resolve()
    expect(harness.onNavigateWikilink).toHaveBeenCalledWith(target)
    expect(mockOpenExternalUrl).not.toHaveBeenCalled()
    expect(mockOpenLocalFile).not.toHaveBeenCalled()
  })

  it('scrolls to the heading a #anchor names', () => {
    const harness = renderHarness()
    const heading = document.createElement('div')
    heading.setAttribute('data-content-type', 'heading')
    heading.textContent = 'Heading'
    heading.scrollIntoView = vi.fn()
    harness.container.appendChild(heading)

    follow(harness, '#heading')

    expect(heading.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    expect(harness.onNavigateWikilink).not.toHaveBeenCalled()
    expect(mockOpenExternalUrl).not.toHaveBeenCalled()
  })

  it('opens an external URL in the browser', () => {
    const harness = renderHarness()

    follow(harness, 'https://example.com/docs')

    expect(mockOpenExternalUrl).toHaveBeenCalledWith('https://example.com/docs')
    expect(harness.onNavigateWikilink).not.toHaveBeenCalled()
  })

  it('opens an Attachment through the active Folder', () => {
    const harness = renderHarness(vi.fn(), '/vault')

    follow(harness, 'attachments/report.pdf')

    expect(mockOpenLocalFile).toHaveBeenCalledWith('/vault/attachments/report.pdf', '/vault')
    expect(mockOpenExternalUrl).not.toHaveBeenCalled()
  })
})
