import { useEffect, useMemo, useState } from 'react'
import type { CodeMirrorSnapshot } from '@/kernel/raw/use-code-mirror'
import type { Tab } from '@/types'

export interface RawEditorSnapshots {
  read: (path: string) => CodeMirrorSnapshot | null
  keep: (path: string, snapshot: CodeMirrorSnapshot) => void
}

/**
 * Each Raw Tab's CodeMirror snapshot (text, selection, undo history, scroll
 * position), kept while the Tab is open. The Raw view is keyed by path and
 * remounts on every Tab switch: it leaves its snapshot here as it goes and
 * starts from it when it comes back, so the caret, the scroll and ⌘Z are
 * where they were. The Document's current bytes still win: a change made on
 * disk meanwhile goes in as a reload, off the undo history.
 *
 * A Tab that closes drops its snapshot, and so does a Tab that leaves Raw
 * mode: Rich mode keeps its own history, and a mode switch maps the caret
 * itself.
 */
export function useRawEditorSnapshots(tabs: readonly Tab[], activeTabPath: string | null, rawMode: boolean): RawEditorSnapshots {
  const [snapshots] = useState(() => new Map<string, CodeMirrorSnapshot>())

  useEffect(() => {
    const open = new Set(tabs.map((tab) => tab.entry.path))
    for (const path of snapshots.keys()) {
      if (!open.has(path) || (path === activeTabPath && !rawMode)) snapshots.delete(path)
    }
  }, [activeTabPath, rawMode, snapshots, tabs])

  return useMemo(() => ({
    read: (path) => snapshots.get(path) ?? null,
    keep: (path, snapshot) => { snapshots.set(path, snapshot) },
  }), [snapshots])
}
