import { useCallback, useMemo, useState } from 'react'
import type { EditorFindOptions } from '@/kernel/blocknote/editor-find'

/**
 * What the find bar is looking for in the active Tab, and whether it is open.
 * The editor pane holds it rather than either bar, so switching the Tab
 * between Rich and Raw mode keeps the bar open on the same query: the bar of
 * the surface that mounts picks it up. Another Tab starts over, closed and
 * empty, as each Tab's bar always has.
 */
export interface EditorFindSession {
  open: boolean
  query: string
  options: EditorFindOptions
  show: () => void
  close: () => void
  setQuery: (query: string) => void
  setOptions: (options: EditorFindOptions) => void
}

interface FindSessionState {
  scope: string | null
  open: boolean
  query: string
  options: EditorFindOptions
}

const DEFAULT_OPTIONS: EditorFindOptions = { caseSensitive: false, regex: false }

function freshSession(scope: string | null): FindSessionState {
  return { scope, open: false, query: '', options: DEFAULT_OPTIONS }
}

/** `scope` is the Tab the session belongs to; a new one starts a fresh session. */
export function useEditorFindSession(scope: string | null): EditorFindSession {
  const [state, setState] = useState(() => freshSession(scope))
  const current = state.scope === scope ? state : freshSession(scope)
  if (current !== state) setState(current)

  const update = useCallback((change: Partial<FindSessionState>) => {
    setState((previous) => ({ ...(previous.scope === scope ? previous : freshSession(scope)), ...change }))
  }, [scope])
  const show = useCallback(() => update({ open: true }), [update])
  const close = useCallback(() => update({ open: false }), [update])
  const setQuery = useCallback((query: string) => update({ query }), [update])
  const setOptions = useCallback((options: EditorFindOptions) => update({ options }), [update])

  const { open, query, options } = current
  return useMemo(
    () => ({ open, query, options, show, close, setQuery, setOptions }),
    [close, open, options, query, setOptions, setQuery, show],
  )
}
