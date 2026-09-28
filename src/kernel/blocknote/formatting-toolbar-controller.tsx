import {
  PositionPopover,
  useBlockNoteEditor,
  useEditorState,
  useExtension,
  useExtensionState,
} from '@blocknote/react'
import type {
  FloatingUIOptions,
  FormattingToolbarProps,
} from '@blocknote/react'
import { blockHasType, defaultProps, type DefaultProps } from '@blocknote/core'
import type { BlockSchema, InlineContentSchema, StyleSchema } from '@blocknote/core'
import { FormattingToolbarExtension } from '@blocknote/core/extensions'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type FC,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import { useBlockNoteFormattingToolbarHoverGuard } from './block-note-formatting-toolbar-hover-guard'
import { CodeBlockLanguageControls } from './code-block-language-controls'
import { FormattingToolbar } from './formatting-toolbar'
import {
  getCursorBlockSafely,
  getSelectedBlocksSafely,
  isFileBlockType,
  type FormattingToolbarEditor,
} from './formatting-toolbar-selection'
import {
  ToolbarMenuContext,
  toolbarMenuAfter,
  type ToolbarMenuKey,
  type ToolbarMenuState,
} from './toolbar-menu-state'
import { isRichFindActive } from './rich-editor-find'
import { useEditorComposing } from './use-editor-composing'

// Plumo's controller for the floating formatting toolbar, in place of
// BlockNote's: the toolbar stays open while it is hovered or focused, while
// one of its menus (block type, highlight colour) is open, and for a short
// grace after the selection collapses; a keystroke in the editor ends the
// hover hold and the grace; it hides during IME composition; it is
// clamped to the viewport; and it mounts the code block language controls
// alongside.

const FORMATTER_CLOSE_GRACE_MS = 160
const FORMATTER_VIEWPORT_PADDING_PX = 8
type FloatingOptions = NonNullable<FloatingUIOptions['useFloatingOptions']>
type FloatingMiddleware = NonNullable<FloatingOptions['middleware']>[number]

// What the toolbar opens (the block type menu, the link form) is portaled to
// the body, so a pointer or focus move into it leaves the toolbar's DOM
// subtree; it counts as within the toolbar when a trigger in the toolbar
// controls it (Radix marks the pair with aria-controls and an id).
function isControlledFromToolbar(toolbar: Element, target: Node) {
  for (
    let element = target instanceof Element ? target : target.parentElement;
    element && element !== toolbar.ownerDocument.body;
    element = element.parentElement
  ) {
    if (element.id && toolbar.querySelector(`[aria-controls="${CSS.escape(element.id)}"]`)) return true
  }
  return false
}

function isFocusStillWithinToolbar(
  currentTarget: EventTarget & Element,
  nextTarget: EventTarget | null,
) {
  if (!(nextTarget instanceof Node)) return false
  return currentTarget.contains(nextTarget) || isControlledFromToolbar(currentTarget, nextTarget)
}

function clearToolbarCloseGrace(
  timeoutRef: MutableRefObject<number | null>,
  setCloseGraceActive: Dispatch<SetStateAction<boolean>>,
) {
  if (timeoutRef.current !== null) {
    window.clearTimeout(timeoutRef.current)
    timeoutRef.current = null
  }
  setCloseGraceActive(false)
}

function startToolbarCloseGrace(
  timeoutRef: MutableRefObject<number | null>,
  setCloseGraceActive: Dispatch<SetStateAction<boolean>>,
) {
  setCloseGraceActive(true)
  if (timeoutRef.current !== null) {
    window.clearTimeout(timeoutRef.current)
  }
  timeoutRef.current = window.setTimeout(() => {
    timeoutRef.current = null
    setCloseGraceActive(false)
  }, FORMATTER_CLOSE_GRACE_MS)
}

function useFormattingToolbarCloseGrace({
  show,
  toolbarHasFocus,
  toolbarHovered,
  typingInEditorRef,
}: {
  show: boolean
  toolbarHasFocus: boolean
  toolbarHovered: boolean
  typingInEditorRef: MutableRefObject<boolean>
}) {
  const [closeGraceActive, setCloseGraceActive] = useState(false)
  const closeGraceTimeoutRef = useRef<number | null>(null)
  const previousShowRef = useRef(show)

  const clearCloseGrace = useCallback(() => {
    clearToolbarCloseGrace(closeGraceTimeoutRef, setCloseGraceActive)
  }, [])
  const dismissImmediately = useCallback(() => {
    previousShowRef.current = false
    clearCloseGrace()
  }, [clearCloseGrace])

  useEffect(() => {
    const toolbarInteractionActive = show || toolbarHasFocus || toolbarHovered

    if (toolbarInteractionActive) {
      clearCloseGrace()
    } else if (previousShowRef.current && !typingInEditorRef.current) {
      startToolbarCloseGrace(closeGraceTimeoutRef, setCloseGraceActive)
    }

    previousShowRef.current = show
  }, [clearCloseGrace, show, toolbarHasFocus, toolbarHovered, typingInEditorRef])

  useEffect(() => () => {
    if (closeGraceTimeoutRef.current !== null) {
      window.clearTimeout(closeGraceTimeoutRef.current)
    }
  }, [])

  return { closeGraceActive, clearCloseGrace, dismissImmediately }
}

type FormattingToolbarStore = {
  setState(open: boolean): void
}

function useCloseToolbarMenuOnEditorInteraction(
  editor: FormattingToolbarEditor,
  opened: boolean,
  closeMenu: () => void,
) {
  useEffect(() => {
    if (!opened || !editor.domElement) return
    const editorElement = editor.domElement
    editorElement.addEventListener('pointerdown', closeMenu, true)
    editorElement.addEventListener('keydown', closeMenu, true)
    editorElement.addEventListener('beforeinput', closeMenu, true)
    return () => {
      editorElement.removeEventListener('pointerdown', closeMenu, true)
      editorElement.removeEventListener('keydown', closeMenu, true)
      editorElement.removeEventListener('beforeinput', closeMenu, true)
    }
  }, [closeMenu, editor, opened])
}

// The pointer that clicked a toolbar button may still rest on the toolbar
// while the user goes on typing; the toolbar must not then trail the caret. So
// a keystroke in the editor drops the hover hold and any running grace, and
// while typing is the last thing the user did, a selection that collapses
// closes the toolbar with no grace. A pointer press, or a keystroke outside
// the editor, gives the grace back.
function useTypingInEditorEndsToolbarHold(
  editor: FormattingToolbarEditor,
  typingInEditorRef: MutableRefObject<boolean>,
  onTyping: () => void,
) {
  useEffect(() => {
    const editorElement = editor.domElement
    if (!editorElement) return
    const ownerDocument = editorElement.ownerDocument
    const handleKeyboardInput = (event: Event) => {
      const inEditor = event.target instanceof Node && editorElement.contains(event.target)
      typingInEditorRef.current = inEditor
      if (inEditor) onTyping()
    }
    const handlePointerDown = () => {
      typingInEditorRef.current = false
    }
    ownerDocument.addEventListener('keydown', handleKeyboardInput, true)
    ownerDocument.addEventListener('beforeinput', handleKeyboardInput, true)
    ownerDocument.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      ownerDocument.removeEventListener('keydown', handleKeyboardInput, true)
      ownerDocument.removeEventListener('beforeinput', handleKeyboardInput, true)
      ownerDocument.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [editor, onTyping, typingInEditorRef])
}

function useDeduplicatedFormattingToolbarStore(
  store: FormattingToolbarStore,
  show: boolean,
) {
  const openRef = useRef(show)

  useEffect(() => {
    openRef.current = show
  }, [show])

  return useCallback((open: boolean) => {
    if (openRef.current === open) return
    openRef.current = open
    store.setState(open)
  }, [store])
}

function textAlignmentToPlacement(textAlignment: DefaultProps['textAlignment']) {
  switch (textAlignment) {
    case 'left':
      return 'top-start'
    case 'center':
      return 'top'
    case 'right':
      return 'top-end'
    default:
      return 'top-start'
  }
}

function viewportClampMiddleware(): FloatingMiddleware {
  return {
    name: 'viewportClamp',
    fn({ x, rects }: { rects: { floating: { width: number } }; x: number }) {
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth
      const minX = FORMATTER_VIEWPORT_PADDING_PX
      const maxX = Math.max(
        minX,
        viewportWidth - rects.floating.width - FORMATTER_VIEWPORT_PADDING_PX,
      )

      return {
        x: Math.min(Math.max(x, minX), maxX),
      }
    },
  }
}

function withViewportSafeMiddleware(options?: FloatingOptions): FloatingOptions {
  if (!options) {
    return {
      middleware: [viewportClampMiddleware()],
    }
  }

  return {
    ...options,
    middleware: [
      ...(options.middleware ?? []),
      viewportClampMiddleware(),
    ],
  }
}

function getFormattingToolbarBridgeBlockId(editor: FormattingToolbarEditor) {
  const selectedBlock = getSelectedBlocksSafely(editor).at(0)
  if (!selectedBlock) return null

  return isFileBlockType(selectedBlock.type) ? selectedBlock.id : null
}

function getFormattingToolbarAnchorElement(editor: FormattingToolbarEditor) {
  const anchor = editor.domElement?.firstElementChild
  return anchor instanceof Element && anchor.isConnected ? anchor : null
}

type FormattingToolbarControllerProps = {
  formattingToolbar?: FC<FormattingToolbarProps>;
  floatingUIOptions?: FloatingUIOptions;
}

function useFormattingToolbarInteractionState({
  editor,
  formattingToolbarStore,
  isComposing,
  show,
}: {
  editor: FormattingToolbarEditor
  formattingToolbarStore: FormattingToolbarStore
  isComposing: boolean
  show: boolean
}) {
  const [toolbarHasFocus, setToolbarHasFocus] = useState(false)
  const [toolbarHovered, setToolbarHovered] = useState(false)
  const [openToolbarMenu, setOpenToolbarMenu] = useState<ToolbarMenuKey | null>(null)
  const setToolbarMenuOpen = useCallback((key: ToolbarMenuKey, opened: boolean) => {
    setOpenToolbarMenu(current => toolbarMenuAfter(current, key, opened))
  }, [])
  const closeToolbarMenu = useCallback(() => setOpenToolbarMenu(null), [])
  const toolbarMenuState = useMemo<ToolbarMenuState>(() => ({
    openMenu: openToolbarMenu,
    setMenuOpen: setToolbarMenuOpen,
  }), [openToolbarMenu, setToolbarMenuOpen])
  const toolbarMenuOpened = openToolbarMenu !== null
  const typingInEditorRef = useRef(false)
  const { closeGraceActive, clearCloseGrace, dismissImmediately } = useFormattingToolbarCloseGrace({
    show,
    toolbarHasFocus,
    toolbarHovered,
    typingInEditorRef,
  })
  const endHoldForTyping = useCallback(() => {
    setToolbarHovered(false)
    clearCloseGrace()
  }, [clearCloseGrace])
  useTypingInEditorEndsToolbarHold(editor, typingInEditorRef, endHoldForTyping)
  const setFormattingToolbarOpen = useDeduplicatedFormattingToolbarStore(
    formattingToolbarStore,
    show,
  )
  const closeToolbarMenuFromEditor = useCallback(() => {
    closeToolbarMenu()
    setToolbarHasFocus(false)
    setToolbarHovered(false)
    dismissImmediately()
    setFormattingToolbarOpen(false)
  }, [closeToolbarMenu, dismissImmediately, setFormattingToolbarOpen])
  useCloseToolbarMenuOnEditorInteraction(editor, toolbarMenuOpened, closeToolbarMenuFromEditor)

  return {
    clearCloseGrace,
    closeToolbarMenu,
    isOpen: !isComposing
      && (show || toolbarHasFocus || toolbarHovered || toolbarMenuOpened || closeGraceActive),
    setFormattingToolbarOpen,
    setToolbarHasFocus,
    setToolbarHovered,
    toolbarMenuState,
  }
}

type FormattingToolbarSurfaceProps = {
  Component?: FC<FormattingToolbarProps>
  closeToolbarMenu: () => void
  editorElement: HTMLElement | null
  floatingUIOptions: FloatingUIOptions
  position: { from: number; to: number } | undefined
  setFormattingToolbarOpen: (open: boolean) => void
  setToolbarHasFocus: Dispatch<SetStateAction<boolean>>
  setToolbarHovered: Dispatch<SetStateAction<boolean>>
  shouldRender: boolean
  toolbarMenuState: ToolbarMenuState
}

// The wrapper's own blur and pointerleave miss a control that goes away while
// focused or under the pointer (the link form unmounts on Enter): the browser
// fires neither on a removed node. The document's next focusin or pointerover
// outside the toolbar settles the flags instead. A focusin the wrapper's blur
// already settled (the flag is down) is left alone: the blur decided it.
function useToolbarLeaveFallback({
  active,
  onFocusLeft,
  onPointerLeft,
  toolbarHasFocusRef,
  wrapperRef,
}: {
  active: boolean
  onFocusLeft: (target: EventTarget | null) => void
  onPointerLeft: () => void
  toolbarHasFocusRef: MutableRefObject<boolean>
  wrapperRef: MutableRefObject<HTMLDivElement | null>
}) {
  useEffect(() => {
    if (!active) return
    const isWithin = (target: EventTarget | null) => {
      const wrapper = wrapperRef.current
      return wrapper !== null && isFocusStillWithinToolbar(wrapper, target)
    }
    const handleFocusIn = (event: FocusEvent) => {
      if (toolbarHasFocusRef.current && !isWithin(event.target)) onFocusLeft(event.target)
    }
    const handlePointerOver = (event: PointerEvent) => {
      if (!isWithin(event.target)) onPointerLeft()
    }
    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('pointerover', handlePointerOver)
    return () => {
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('pointerover', handlePointerOver)
    }
  }, [active, onFocusLeft, onPointerLeft, toolbarHasFocusRef, wrapperRef])
}

function FormattingToolbarSurface(props: FormattingToolbarSurfaceProps) {
  const {
    Component,
    closeToolbarMenu,
    editorElement,
    floatingUIOptions,
    position,
    setFormattingToolbarOpen,
    setToolbarHasFocus,
    setToolbarHovered,
    shouldRender,
    toolbarMenuState,
  } = props
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const toolbarHasFocusRef = useRef(false)
  const menuOpened = toolbarMenuState.openMenu !== null
  // A choice in a toolbar menu acts on the editor and focuses it: that is the
  // menu handing back, not focus leaving the toolbar, so the selection decides
  // whether the toolbar stays (BlockNote's own show state), not the blur.
  const onFocusLeft = useCallback((target: EventTarget | null) => {
    const menuHandedBack = menuOpened
      && target instanceof Node
      && editorElement !== null
      && editorElement.contains(target)
    toolbarHasFocusRef.current = false
    setToolbarHasFocus(false)
    closeToolbarMenu()
    if (!menuHandedBack) setFormattingToolbarOpen(false)
  }, [closeToolbarMenu, editorElement, menuOpened, setFormattingToolbarOpen, setToolbarHasFocus])
  const onPointerLeft = useCallback(() => setToolbarHovered(false), [setToolbarHovered])
  useToolbarLeaveFallback({
    active: shouldRender,
    onFocusLeft,
    onPointerLeft,
    toolbarHasFocusRef,
    wrapperRef,
  })
  return (
    <PositionPopover position={position} {...floatingUIOptions}>
      {shouldRender && (
        <div
          ref={wrapperRef}
          onPointerEnter={() => setToolbarHovered(true)}
          onPointerLeave={(event) => {
            if (!isFocusStillWithinToolbar(event.currentTarget, event.relatedTarget)) setToolbarHovered(false)
          }}
          onFocusCapture={() => {
            toolbarHasFocusRef.current = true
            setToolbarHasFocus(true)
          }}
          onBlurCapture={(event) => {
            if (isFocusStillWithinToolbar(event.currentTarget, event.relatedTarget)) return
            onFocusLeft(event.relatedTarget)
          }}
        >
          <ToolbarMenuContext.Provider value={toolbarMenuState}>
            {Component ? <Component /> : <FormattingToolbar />}
          </ToolbarMenuContext.Provider>
        </div>
      )}
    </PositionPopover>
  )
}

export function FormattingToolbarController(props: FormattingToolbarControllerProps) {
  const editor = useBlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>()
  const formattingToolbar = useExtension(FormattingToolbarExtension, {
    editor,
  })
  const show = useExtensionState(FormattingToolbarExtension, {
    editor,
  })
  const isComposing = useEditorComposing(editor)
  const {
    clearCloseGrace,
    closeToolbarMenu,
    isOpen,
    setFormattingToolbarOpen,
    setToolbarHasFocus,
    setToolbarHovered,
    toolbarMenuState,
  } = useFormattingToolbarInteractionState({
    editor,
    formattingToolbarStore: formattingToolbar.store,
    isComposing,
    show,
  })
  // Find selects each match so that closing the bar leaves the caret on it, and
  // BlockNote shows the toolbar for any selection, focused or not. While the
  // selection is find's (a query is live and the focus is in the bar, not in
  // the editor) there is nothing to format; a click into the text brings the
  // toolbar back with the bar still open.
  const selectionIsFinds = useEditorState({
    editor,
    selector: ({ editor }) => isRichFindActive(editor.prosemirrorState) && !editor.prosemirrorView?.hasFocus(),
  })
  const hasFloatingToolbarAnchor = getFormattingToolbarAnchorElement(editor) !== null
  const shouldRenderFloatingToolbar = isOpen && !selectionIsFinds && hasFloatingToolbarAnchor
  const currentBridgeBlockId = useEditorState({
    editor,
    selector: ({ editor }) => getFormattingToolbarBridgeBlockId(editor),
  })

  useBlockNoteFormattingToolbarHoverGuard({
    editor,
    container:
      editor.domElement?.closest('.editor__blocknote-container') ??
      editor.domElement ??
      null,
    selectedFileBlockId: currentBridgeBlockId,
    isOpen,
  })

  const position = useEditorState({
    editor,
    selector: ({ editor }) => (
      shouldRenderFloatingToolbar
        ? {
            from: editor.prosemirrorState.selection.from,
            to: editor.prosemirrorState.selection.to,
          }
        : undefined
    ),
  })

  const placement = useEditorState({
    editor,
    selector: ({ editor }) => {
      const block = getCursorBlockSafely(editor)
      if (!block) return 'top-start'

      if (!blockHasType(block, editor, block.type, {
        textAlignment: defaultProps.textAlignment,
      })) {
        return 'top-start'
      }

      return textAlignmentToPlacement(block.props.textAlignment)
    },
  })

  const floatingUIOptions = useMemo<FloatingUIOptions>(
    () => ({
      ...props.floatingUIOptions,
      useFloatingOptions: {
        open: shouldRenderFloatingToolbar,
        onOpenChange: (open, _event, reason) => {
          setFormattingToolbarOpen(open)
          if (!open) {
            setToolbarHasFocus(false)
            setToolbarHovered(false)
            closeToolbarMenu()
            clearCloseGrace()
          }
          if (reason === 'escape-key') {
            editor.focus()
          }
        },
        placement,
        ...withViewportSafeMiddleware(props.floatingUIOptions?.useFloatingOptions),
      },
      elementProps: {
        // The input to BlockNote's `--bn-ui-base-z-index` arithmetic for the wrapper, its own tier for the toolbar.
        style: {
          zIndex: 40,
        },
        ...props.floatingUIOptions?.elementProps,
      },
    }),
    [
      clearCloseGrace,
      closeToolbarMenu,
      editor,
      placement,
      props.floatingUIOptions,
      setFormattingToolbarOpen,
      setToolbarHasFocus,
      setToolbarHovered,
      shouldRenderFloatingToolbar,
    ],
  )

  return (
    <>
      <CodeBlockLanguageControls editor={editor} />
      <FormattingToolbarSurface
        Component={props.formattingToolbar}
        closeToolbarMenu={closeToolbarMenu}
        editorElement={editor.domElement ?? null}
        floatingUIOptions={floatingUIOptions}
        position={position}
        setFormattingToolbarOpen={setFormattingToolbarOpen}
        setToolbarHasFocus={setToolbarHasFocus}
        setToolbarHovered={setToolbarHovered}
        shouldRender={shouldRenderFloatingToolbar}
        toolbarMenuState={toolbarMenuState}
      />
    </>
  )
}
