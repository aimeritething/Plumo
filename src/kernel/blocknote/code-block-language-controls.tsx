import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { useCreateBlockNote } from '@blocknote/react'
import { createCodeBlockOptions } from './code-block-options'
import { EDITOR_CONTAINER_SELECTOR } from '@/kernel/resolve/editor-dom-selection'
import { BLOCK_CONTAINER_SELECTOR } from './block-note-dom'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/select'

type CodeBlockLanguageEditor = ReturnType<typeof useCreateBlockNote>

type CodeBlockLanguageTarget = {
  blockId: string
  editable: boolean
  height: number
  // The editor container the control is laid out in. It sits inside the scroll
  // area, so the control scrolls with its code block rather than chasing it.
  host: HTMLElement
  language: string
  left: number
  top: number
}

type LanguageSelectControl = Element & { value: string }

// Scoped to the live editor: a block drag preview is a clone of the block, native select included.
const NATIVE_LANGUAGE_CONTROL_SELECTOR =
  '.bn-editor .bn-block-content[data-content-type="codeBlock"] > div > select'
const ELEMENT_NODE = 1

const SUPPORTED_LANGUAGES = Object.entries(createCodeBlockOptions().supportedLanguages ?? {})

const LANGUAGE_OPTIONS = SUPPORTED_LANGUAGES.map(([id, language]) => ({ id, name: language.name }))

// A fence keeps the name it was written with (```ts), which the native select has no option for.
const LANGUAGE_ID_BY_NAME = new Map<string, string>([
  ...SUPPORTED_LANGUAGES.flatMap(([id, language]) => (
    (language.aliases ?? []).map((alias): [string, string] => [alias.toLowerCase(), id])
  )),
  ...SUPPORTED_LANGUAGES.map(([id]): [string, string] => [id, id]),
])

function liveCodeBlockLanguage(editor: CodeBlockLanguageEditor, blockId: string): string | null {
  try {
    const block = editor.getBlock(blockId)
    if (block?.type !== 'codeBlock') return null
    const language = (block.props as { language?: unknown } | undefined)?.language
    return typeof language === 'string' ? language : ''
  } catch {
    return null
  }
}

function pickerLanguage(blockLanguage: string, nativeControl: LanguageSelectControl): string {
  return LANGUAGE_ID_BY_NAME.get(blockLanguage.trim().toLowerCase()) ?? (nativeControl.value || 'text')
}

function languageControlTarget(
  editor: CodeBlockLanguageEditor,
  blockId: string,
  blockLanguage: string,
  nativeControl: LanguageSelectControl,
  host: HTMLElement,
): CodeBlockLanguageTarget {
  const rect = nativeControl.getBoundingClientRect()
  const hostRect = host.getBoundingClientRect()
  return {
    blockId,
    editable: editor.isEditable
      && nativeControl.closest('.bn-editor')?.getAttribute('contenteditable') !== 'false',
    height: rect.height,
    host,
    language: pickerLanguage(blockLanguage, nativeControl),
    left: rect.left - hostRect.left + host.scrollLeft,
    top: rect.top - hostRect.top + host.scrollTop,
  }
}

function codeBlockLanguageTarget(
  editor: CodeBlockLanguageEditor,
  element: Element,
): CodeBlockLanguageTarget | null {
  if (element.tagName !== 'SELECT') return null
  const nativeControl = element as LanguageSelectControl
  const blockId = element.closest(BLOCK_CONTAINER_SELECTOR)?.getAttribute('data-id')
  if (!blockId) return null
  const blockLanguage = liveCodeBlockLanguage(editor, blockId)
  if (blockLanguage === null) return null
  const host = element.closest<HTMLElement>(EDITOR_CONTAINER_SELECTOR)
  if (!host) return null
  return languageControlTarget(editor, blockId, blockLanguage, nativeControl, host)
}

function codeBlockLanguageTargets(editor: CodeBlockLanguageEditor): CodeBlockLanguageTarget[] {
  return Array.from(document.querySelectorAll(NATIVE_LANGUAGE_CONTROL_SELECTOR))
    .map((element) => codeBlockLanguageTarget(editor, element))
    .filter((target): target is CodeBlockLanguageTarget => target !== null)
}

function sameTarget(current: CodeBlockLanguageTarget, next: CodeBlockLanguageTarget): boolean {
  return current.blockId === next.blockId
    && current.editable === next.editable
    && current.height === next.height
    && current.host === next.host
    && current.language === next.language
    && current.left === next.left
    && current.top === next.top
}

function sameTargets(current: CodeBlockLanguageTarget[], next: CodeBlockLanguageTarget[]): boolean {
  return current.length === next.length
    && current.every((target, index) => sameTarget(target, next[index]))
}

function observedEditorElements(): Element[] {
  return Array.from(document.querySelectorAll(NATIVE_LANGUAGE_CONTROL_SELECTOR))
    .map((element) => element.closest('.bn-editor'))
    .filter((element): element is Element => element !== null)
}

function addedNodeTouchesEditor(node: Node): boolean {
  if (node.nodeType !== ELEMENT_NODE) return false
  const element = node as Element
  return element.matches('.bn-editor') || element.querySelector('.bn-editor') !== null
}

function mutationTouchesEditor(mutation: MutationRecord): boolean {
  if (mutation.target.nodeType === ELEMENT_NODE
    && (mutation.target as Element).closest('.bn-editor')) return true
  return Array.from(mutation.addedNodes).some(addedNodeTouchesEditor)
}

function useCodeBlockLanguageTargets(editor: CodeBlockLanguageEditor) {
  const [targets, setTargets] = useState<CodeBlockLanguageTarget[]>([])

  useEffect(() => {
    let refreshFrame: number | null = null
    // Reflow with no DOM change (an image loading, the sidebar resizing) moves code blocks too.
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => refresh())
    const refresh = () => {
      if (refreshFrame !== null) return
      refreshFrame = requestAnimationFrame(() => {
        refreshFrame = null
        const nextTargets = codeBlockLanguageTargets(editor)
        observedEditorElements().forEach((element) => resizeObserver?.observe(element))
        setTargets((current) => sameTargets(current, nextTargets) ? current : nextTargets)
      })
    }
    const observer = new MutationObserver((mutations) => {
      if (mutations.some(mutationTouchesEditor)) refresh()
    })
    observer.observe(document.body, {
      attributeFilter: ['contenteditable'],
      attributes: true,
      childList: true,
      subtree: true,
    })
    const unsubscribe = editor.onChange?.(refresh) ?? (() => {})
    window.addEventListener('resize', refresh)
    refresh()

    return () => {
      if (refreshFrame !== null) cancelAnimationFrame(refreshFrame)
      observer.disconnect()
      resizeObserver?.disconnect()
      unsubscribe()
      window.removeEventListener('resize', refresh)
    }
  }, [editor])

  return targets
}

function updateCodeBlockLanguage(
  editor: CodeBlockLanguageEditor,
  blockId: string,
  language: string,
): void {
  if (!editor.isEditable) return

  try {
    const block = editor.getBlock(blockId)
    if (block?.type !== 'codeBlock') return
    editor.updateBlock(blockId, { props: { language } })
  } catch {
    // BlockNote can remove a block between the picker opening and selection.
  }
}

function CodeBlockLanguagePicker({
  blockId,
  editable,
  editor,
  language,
}: {
  blockId: string
  editable: boolean
  editor: CodeBlockLanguageEditor
  language: string
}) {
  return (
    <Select
      disabled={!editable}
      value={language}
      onValueChange={(nextLanguage) => updateCodeBlockLanguage(editor, blockId, nextLanguage)}
    >
      <SelectTrigger
        size="sm"
        className="h-7 max-w-72 border-transparent bg-transparent px-2 py-0 text-xs text-muted-foreground shadow-none hover:bg-accent hover:text-foreground focus-visible:ring-1"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        {LANGUAGE_OPTIONS.map(({ id, name }) => (
          <SelectItem key={id} value={id}>{name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function CodeBlockLanguageControls({ editor }: { editor: CodeBlockLanguageEditor }) {
  const targets = useCodeBlockLanguageTargets(editor)

  return targets.map((target) => createPortal(
    <div
      className="absolute z-raised"
      // CODE_BLOCK_LANGUAGE_CONTROL_ATTRIBUTE: a block drag finds the control by it.
      data-code-block-id={target.blockId}
      style={{ left: target.left, minHeight: target.height, top: target.top }}
    >
      <CodeBlockLanguagePicker
        blockId={target.blockId}
        editable={target.editable}
        editor={editor}
        language={target.language}
      />
    </div>,
    target.host,
    target.blockId,
  ))
}
