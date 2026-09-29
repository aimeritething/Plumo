import { useCallback, useLayoutEffect, useRef, type MutableRefObject } from 'react'
import type { SetStateAction } from 'react'
import { useSaveNote } from './use-save-note'
import { canWritePathToVault } from '@/lib/vault-path-containment'
import type { VaultEntry } from '@/types'

interface Tab {
  entry: VaultEntry
  content: string
}

type PersistenceScope = string | readonly string[] | undefined
type SaveNote = (path: string, content: string, vaultPath?: string) => Promise<void>

interface EditorSaveConfig {
  setTabs: (fn: SetStateAction<Tab[]>) => void
  /** Called after content is persisted — clears the Document's unsaved state. */
  onNotePersisted?: (path: string, content: string) => void
  /** The roots writes are confined to; the buffer is cleared when it changes. */
  persistenceScope?: PersistenceScope
}

interface PendingContent {
  path: string
  content: string
}

interface InFlightSave {
  pending: PendingContent
  promise: Promise<boolean>
}

function useLatestValueRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value)
  useLayoutEffect(() => {
    ref.current = value
  }, [value])
  return ref
}

/** The configured root that contains `path`; undefined when no scope confines writes. */
function persistenceRootForPath(path: string, persistenceScope: PersistenceScope): string | undefined {
  const roots = typeof persistenceScope === 'string' ? [persistenceScope] : persistenceScope ?? []
  return roots.find((root) => root.trim() !== '' && canWritePathToVault(path, root))
}

function matchesPendingPath(pending: PendingContent | null, path: string): pending is PendingContent {
  return pending !== null && pending.path === path
}

function matchesPendingContent(
  pending: PendingContent | null,
  path: string,
  content: string,
): pending is PendingContent {
  return matchesPendingPath(pending, path) && pending.content === content
}

function applyTabContent(setTabs: EditorSaveConfig['setTabs'], path: string, content: string): void {
  setTabs((prev: Tab[]) => {
    let changed = false
    const next = prev.map((t) => {
      if (t.entry.path !== path) return t
      if (t.content === content) return t
      changed = true
      return { ...t, content }
    })
    return changed ? next : prev
  })
}

/**
 * Write one buffered snapshot. Resolves true when it landed and was still the
 * latest buffer; false when the scope no longer admits the path or a newer
 * buffer arrived while the write was in flight (that buffer is left for the
 * next write). A refused write rejects and leaves the buffer in place.
 */
async function persistPendingContent({
  pending,
  pendingContentRef,
  saveNote,
  onNotePersisted,
  persistenceScopeRef,
}: {
  pending: PendingContent
  pendingContentRef: MutableRefObject<PendingContent | null>
  saveNote: SaveNote
  onNotePersisted?: EditorSaveConfig['onNotePersisted']
  persistenceScopeRef: MutableRefObject<PersistenceScope>
}): Promise<boolean> {
  const { path, content } = pending
  const scope = persistenceScopeRef.current
  if (!canWritePathToVault(path, scope ?? '')) {
    if (pendingContentRef.current === pending) pendingContentRef.current = null
    return false
  }
  await saveNote(path, content, persistenceRootForPath(path, scope))
  if (!matchesPendingContent(pendingContentRef.current, path, content)) return false
  pendingContentRef.current = null
  onNotePersisted?.(path, content)
  return true
}

/** The write by path; a second call while the same snapshot is in flight joins that write. */
function usePendingContentFlush({
  pendingContentRef,
  saveNote,
  onNotePersisted,
  persistenceScopeRef,
}: {
  pendingContentRef: MutableRefObject<PendingContent | null>
  saveNote: SaveNote
  onNotePersisted?: EditorSaveConfig['onNotePersisted']
  persistenceScopeRef: MutableRefObject<PersistenceScope>
}) {
  const inFlightSaveRef = useRef<InFlightSave | null>(null)

  return useCallback(
    async (path: string): Promise<boolean> => {
      const pending = pendingContentRef.current
      if (!matchesPendingPath(pending, path)) return false

      const inFlight = inFlightSaveRef.current
      if (inFlight && matchesPendingContent(inFlight.pending, pending.path, pending.content)) {
        return inFlight.promise
      }

      const promise = persistPendingContent({
        pending,
        pendingContentRef,
        saveNote,
        onNotePersisted,
        persistenceScopeRef,
      })
      inFlightSaveRef.current = { pending, promise }
      try {
        return await promise
      } finally {
        if (inFlightSaveRef.current?.promise === promise) inFlightSaveRef.current = null
      }
    },
    [onNotePersisted, pendingContentRef, persistenceScopeRef, saveNote],
  )
}

/** A buffered edit belongs to the scope it was made in; a new scope starts empty. */
function usePendingContentScopeReset(
  pendingContentRef: MutableRefObject<PendingContent | null>,
  persistenceScope: PersistenceScope,
) {
  const previousScopeRef = useRef(persistenceScope)

  useLayoutEffect(() => {
    if (previousScopeRef.current === persistenceScope) return
    previousScopeRef.current = persistenceScope
    pendingContentRef.current = null
  }, [pendingContentRef, persistenceScope])
}

/**
 * The save buffer between the editing surfaces and disk. The idle wait is the
 * surface's own (the rich editor's serialization debounce, the raw editor's
 * debounce; ADR-0003), so this hook has no timer: the shell buffers what a
 * surface reports and writes it at once. Disk is written first and the Tab is
 * brought in line only after the write lands; a refused write keeps the buffer
 * so the caller can retry it or discard it.
 */
export function useEditorSave({ setTabs, onNotePersisted, persistenceScope }: EditorSaveConfig) {
  const pendingContentRef = useRef<PendingContent | null>(null)
  const persistenceScopeRef = useLatestValueRef(persistenceScope)

  const applySavedContent = useCallback(
    (path: string, content: string) => {
      // A newer buffer for the same path outranks the write that just landed.
      if (pendingContentRef.current && !matchesPendingContent(pendingContentRef.current, path, content)) {
        return
      }
      applyTabContent(setTabs, path, content)
    },
    [setTabs],
  )
  const { saveNote } = useSaveNote(applySavedContent)

  const flushPending = usePendingContentFlush({
    pendingContentRef,
    saveNote,
    onNotePersisted,
    persistenceScopeRef,
  })
  usePendingContentScopeReset(pendingContentRef, persistenceScope)

  /** Buffer a surface's report and show it on the Tab; a path outside the scope is dropped. */
  const handleContentChange = useCallback(
    (path: string, content: string) => {
      if (!canWritePathToVault(path, persistenceScopeRef.current ?? '')) return
      pendingContentRef.current = { path, content }
      applyTabContent(setTabs, path, content)
    },
    [persistenceScopeRef, setTabs],
  )

  /** Write the buffered edits of `path` now; another Document's buffer is left alone. */
  const savePendingForPath = useCallback((path: string): Promise<boolean> => flushPending(path), [flushPending])

  /**
   * Forget the buffered edits of `path` without writing them (the error bar's
   * Discard changes reverts the Tab to the disk bytes). Other Documents'
   * buffered edits are untouched.
   */
  const discardPending = useCallback((path: string): void => {
    if (!matchesPendingPath(pendingContentRef.current, path)) return
    pendingContentRef.current = null
  }, [])

  const hasPendingSave = useCallback((path: string) => matchesPendingPath(pendingContentRef.current, path), [])

  /** The buffered edits of `path` that have not reached disk, or undefined when there are none. */
  const pendingContentFor = useCallback((path: string): string | undefined => {
    const pending = pendingContentRef.current
    return matchesPendingPath(pending, path) ? pending.content : undefined
  }, [])

  return { handleContentChange, savePendingForPath, discardPending, hasPendingSave, pendingContentFor }
}
