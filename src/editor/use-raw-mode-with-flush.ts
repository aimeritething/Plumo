import { useRef, useLayoutEffect, useCallback, useState } from 'react'
import type { useCreateBlockNote } from '@blocknote/react'
import type { EditorMode } from '@/types'
import { useEditorContentPathSignal } from '@/kernel/resolve/use-editor-content-path-signal'
import { useRawMode } from './use-raw-mode'
import { clearTableResizeState } from '@/kernel/blocknote/table-resize-state'
import {
  buildCodeMirrorRestoreState,
  captureRawCodeMirrorRestoreState,
  captureRawEditorPositionSnapshot,
  captureRichEditorPositionSnapshot,
  focusedPropertyLine,
  propertyCodeMirrorRestoreState,
  type CodeMirrorRestoreState,
} from './editor-mode-position'
import {
  type PendingRawExitContent,
  buildPendingRawExitContent,
  createRawModeContentTransition,
  rememberPendingRawExitContent,
  syncActiveTabIntoRawBuffer,
  withPendingRawExitContent,
  withRawModeContentOverride,
} from './editor-raw-mode-sync'
import {
  createEditorModeRestoreTransition,
  type EditorModeRestoreTransition,
  useEditorModePositionSync,
} from './use-editor-mode-position-sync'

interface PendingRoundTripRawRestore {
  path: string
  state: CodeMirrorRestoreState
}

function getRoundTripRawRestore({
  activeTabPath,
  restoreTransition,
}: {
  activeTabPath: string | null
  restoreTransition: EditorModeRestoreTransition
}) {
  if (!activeTabPath) return null
  return restoreTransition.roundTripRawRestore?.path === activeTabPath
    ? restoreTransition.roundTripRawRestore.state
    : null
}

function buildPendingRawRestore({
  activeTabContent,
  activeTabPath,
  editor,
  restoreTransition,
  syncedContent,
}: {
  activeTabContent: string | null
  activeTabPath: string | null
  editor: ReturnType<typeof useCreateBlockNote>
  restoreTransition: EditorModeRestoreTransition
  syncedContent: string | null
}) {
  // A Property holding the focus: Raw's caret goes to that Property's line.
  const propertyLine = focusedPropertyLine(document)
  const propertyContent = syncedContent ?? activeTabContent
  if (propertyLine !== null && propertyContent) return propertyCodeMirrorRestoreState(propertyContent, propertyLine)

  const roundTripRestore = getRoundTripRawRestore({
    activeTabPath,
    restoreTransition,
  })
  if (roundTripRestore) return roundTripRestore

  const nextContent = syncedContent ?? activeTabContent
  if (!nextContent) return null

  const richSnapshot = captureRichEditorPositionSnapshot(editor)
  return richSnapshot ? buildCodeMirrorRestoreState(editor, nextContent, richSnapshot) : null
}

function capturePendingRoundTripRawRestore(activeTabPath: string | null): PendingRoundTripRawRestore | null {
  if (!activeTabPath) return null

  const rawRestoreState = captureRawCodeMirrorRestoreState(document)
  return rawRestoreState ? { path: activeTabPath, state: rawRestoreState } : null
}

function resolveActiveTabContent({
  activeTabContent,
  activeTabPath,
  pendingRawExitContent,
}: {
  activeTabContent: string | null
  activeTabPath: string | null
  pendingRawExitContent: PendingRawExitContent | null
}) {
  if (activeTabPath && pendingRawExitContent?.path === activeTabPath) {
    return pendingRawExitContent.content
  }
  return activeTabContent
}

function useTrackRawBuffer({
  activeTabContent,
  activeTabPath,
  rawInitialContentRef,
  rawBufferPathRef,
  rawLatestContentRef,
  rawSourceContentRef,
}: {
  activeTabContent: string | null
  activeTabPath: string | null
  rawInitialContentRef: React.MutableRefObject<string | null>
  rawBufferPathRef: React.MutableRefObject<string | null>
  rawLatestContentRef: React.MutableRefObject<string | null>
  rawSourceContentRef: React.MutableRefObject<string | null>
}) {
  useLayoutEffect(() => {
    if (!activeTabPath) {
      rawLatestContentRef.current = null
      rawInitialContentRef.current = null
      rawBufferPathRef.current = null
      rawSourceContentRef.current = null
      return
    }

    if (rawBufferPathRef.current === activeTabPath) {
      return
    }

    rawLatestContentRef.current = activeTabContent
    rawInitialContentRef.current = activeTabContent
    rawBufferPathRef.current = activeTabContent === null ? null : activeTabPath
    rawSourceContentRef.current = activeTabContent
  }, [
    activeTabContent,
    activeTabPath,
    rawBufferPathRef,
    rawInitialContentRef,
    rawLatestContentRef,
    rawSourceContentRef,
  ])
}

function resetRawBufferState({
  rawInitialContentRef,
  rawBufferPathRef,
  rawLatestContentRef,
  rawSourceContentRef,
}: {
  rawInitialContentRef: React.MutableRefObject<string | null>
  rawBufferPathRef: React.MutableRefObject<string | null>
  rawLatestContentRef: React.MutableRefObject<string | null>
  rawSourceContentRef: React.MutableRefObject<string | null>
}) {
  rawInitialContentRef.current = null
  rawBufferPathRef.current = null
  rawLatestContentRef.current = null
  rawSourceContentRef.current = null
}

function useHandleFlushPending(options: {
  editor: ReturnType<typeof useCreateBlockNote>
  activeTabPath: string | null
  activeTabContent: string | null
  editorContentPath: string | null
  rawInitialContentRef: React.MutableRefObject<string | null>
  rawLatestContentRef: React.MutableRefObject<string | null>
  rawSourceContentRef: React.MutableRefObject<string | null>
  flushPendingEditorChangeRef?: React.MutableRefObject<(() => boolean) | null>
  restoreTransitionRef: React.MutableRefObject<EditorModeRestoreTransition>
  setRawModeContentOverride: React.Dispatch<React.SetStateAction<PendingRawExitContent | null>>
  vaultPath?: string
}) {
  const {
    editor,
    activeTabPath,
    activeTabContent,
    editorContentPath,
    rawInitialContentRef,
    rawLatestContentRef,
    rawSourceContentRef,
    flushPendingEditorChangeRef,
    restoreTransitionRef,
    setRawModeContentOverride,
    vaultPath,
  } = options
  return useCallback(async () => {
    rawSourceContentRef.current = activeTabContent
    const serializeRichEditorContent = flushPendingEditorChangeRef?.current?.() ?? true
    const syncedContent = syncActiveTabIntoRawBuffer({
      editor,
      activeTabPath,
      activeTabContent,
      editorContentPath,
      rawLatestContentRef,
      serializeRichEditorContent,
      vaultPath,
    })
    rawInitialContentRef.current = syncedContent ?? activeTabContent
    const restoreTransition = restoreTransitionRef.current
    restoreTransition.rawRestore = buildPendingRawRestore({
      activeTabContent,
      activeTabPath,
      editor,
      restoreTransition,
      syncedContent,
    })
    restoreTransition.roundTripRawRestore = null
    setRawModeContentOverride(buildPendingRawExitContent(activeTabPath, syncedContent))
    clearTableResizeState(editor)
    return true
  }, [
    activeTabContent,
    activeTabPath,
    editor,
    editorContentPath,
    flushPendingEditorChangeRef,
    restoreTransitionRef,
    rawInitialContentRef,
    rawLatestContentRef,
    rawSourceContentRef,
    setRawModeContentOverride,
    vaultPath,
  ])
}

function useHandleBeforeRawEnd(options: {
  activeTabPath: string | null
  activeTabContent: string | null
  onContentChange?: (path: string, content: string) => void
  rawInitialContentRef: React.MutableRefObject<string | null>
  rawBufferPathRef: React.MutableRefObject<string | null>
  rawLatestContentRef: React.MutableRefObject<string | null>
  rawSourceContentRef: React.MutableRefObject<string | null>
  restoreTransitionRef: React.MutableRefObject<EditorModeRestoreTransition>
  setPendingRawExitContent: React.Dispatch<React.SetStateAction<PendingRawExitContent | null>>
  setRawModeContentOverride: React.Dispatch<React.SetStateAction<PendingRawExitContent | null>>
}) {
  const {
    activeTabPath,
    activeTabContent,
    onContentChange,
    rawInitialContentRef,
    rawBufferPathRef,
    rawLatestContentRef,
    rawSourceContentRef,
    restoreTransitionRef,
    setPendingRawExitContent,
    setRawModeContentOverride,
  } = options
  return useCallback(() => {
    const restoreTransition = restoreTransitionRef.current
    restoreTransition.roundTripRawRestore = capturePendingRoundTripRawRestore(activeTabPath)
    restoreTransition.richRestore = captureRawEditorPositionSnapshot(document)
    restoreTransition.rawRestore = null
    setPendingRawExitContent(
      rememberPendingRawExitContent({
      activeTabPath,
      activeTabContent,
      rawInitialContent: rawInitialContentRef.current,
      rawLatestContentRef,
      onContentChange,
      }),
    )
    setRawModeContentOverride(null)
    resetRawBufferState({
      rawInitialContentRef,
      rawBufferPathRef,
      rawLatestContentRef,
      rawSourceContentRef,
    })
  }, [
    activeTabContent,
    activeTabPath,
    onContentChange,
    restoreTransitionRef,
    rawInitialContentRef,
    rawBufferPathRef,
    rawLatestContentRef,
    rawSourceContentRef,
    setPendingRawExitContent,
    setRawModeContentOverride,
  ])
}

function useSyncRawModeContentOverride({
  activeTabContent,
  activeTabPath,
  rawSourceContentRef,
  setRawModeContentOverride,
}: {
  activeTabContent: string | null
  activeTabPath: string | null
  rawSourceContentRef: React.MutableRefObject<string | null>
  setRawModeContentOverride: React.Dispatch<React.SetStateAction<PendingRawExitContent | null>>
}) {
  useLayoutEffect(() => {
    if (!activeTabPath || activeTabContent === null) return
    if (rawSourceContentRef.current === null || activeTabContent === rawSourceContentRef.current) return
    const nextContent = activeTabContent

    setRawModeContentOverride((current) => {
      if (!current) return current
      if (current.path !== activeTabPath || current.content === nextContent) return current
      return { path: activeTabPath, content: nextContent }
    })
  }, [activeTabContent, activeTabPath, rawSourceContentRef, setRawModeContentOverride])
}

/** Where the mode lives in Plumo: the active Tab, read here and written back through the Tab state. */
export interface TabModeState {
  mode: EditorMode | null
  setMode: (path: string, mode: EditorMode) => void
}

/** No Tab state given reads as no Document open: never Raw, nowhere to write a mode. */
const NO_TAB_MODE: TabModeState = { mode: null, setMode: () => {} }

export function useRawModeWithFlush(
  editor: ReturnType<typeof useCreateBlockNote>,
  activeTabPath: string | null,
  activeTabContent: string | null,
  onContentChange?: (path: string, content: string) => void,
  vaultPath?: string,
  flushPendingEditorChangeRef?: React.MutableRefObject<(() => boolean) | null>,
  tabMode: TabModeState = NO_TAB_MODE,
) {
  const { path: editorContentPath } = useEditorContentPathSignal()
  const rawLatestContentRef = useRef<string | null>(null)
  const rawInitialContentRef = useRef<string | null>(null)
  const rawBufferPathRef = useRef<string | null>(null)
  const rawSourceContentRef = useRef<string | null>(null)
  const restoreTransitionRef = useRef(createEditorModeRestoreTransition())
  const [contentTransition, setContentTransition] = useState(createRawModeContentTransition)
  const setPendingRawExitContent = useCallback<React.Dispatch<React.SetStateAction<PendingRawExitContent | null>>>(
    (action) => {
      setContentTransition((transition) => withPendingRawExitContent(transition, action))
    },
    [],
  )
  const setRawModeContentOverride = useCallback<React.Dispatch<React.SetStateAction<PendingRawExitContent | null>>>(
    (action) => {
      setContentTransition((transition) => withRawModeContentOverride(transition, action))
    },
    [],
  )
  const effectiveActiveTabContent = resolveActiveTabContent({
    activeTabContent,
    activeTabPath,
    pendingRawExitContent: contentTransition.pendingExitContent,
  })
  useTrackRawBuffer({
    activeTabContent: effectiveActiveTabContent,
    activeTabPath,
    rawInitialContentRef,
    rawBufferPathRef,
    rawLatestContentRef,
    rawSourceContentRef,
  })
  useSyncRawModeContentOverride({
    activeTabContent: effectiveActiveTabContent,
    activeTabPath,
    rawSourceContentRef,
    setRawModeContentOverride,
  })

  const handleFlushPending = useHandleFlushPending({
    editor,
    activeTabPath,
    activeTabContent: effectiveActiveTabContent,
    editorContentPath,
    rawInitialContentRef,
    rawLatestContentRef,
    rawSourceContentRef,
    flushPendingEditorChangeRef,
    restoreTransitionRef,
    setRawModeContentOverride,
    vaultPath,
  })
  const handleBeforeRawEnd = useHandleBeforeRawEnd({
    activeTabPath,
    activeTabContent: effectiveActiveTabContent,
    onContentChange,
    rawInitialContentRef,
    rawBufferPathRef,
    rawLatestContentRef,
    rawSourceContentRef,
    restoreTransitionRef,
    setPendingRawExitContent,
    setRawModeContentOverride,
  })

  const { rawMode, handleToggleRaw } = useRawMode({
    activeTabPath,
    mode: tabMode.mode,
    setMode: tabMode.setMode,
    onFlushPending: handleFlushPending,
    onBeforeRawEnd: handleBeforeRawEnd,
  })
  useEditorModePositionSync({
    activeTabPath,
    editor,
    restoreTransitionRef,
    rawMode,
  })

  return {
    rawMode,
    handleToggleRaw,
    rawLatestContentRef,
    pendingRawExitContent: contentTransition.pendingExitContent,
    setPendingRawExitContent,
    rawModeContentOverride: contentTransition.rawModeContentOverride,
  }
}
