interface EmptyEditorProps {
  hasFolder: boolean
}

const NO_FOLDER_HINTS = [['⌘O', 'Open Folder']] as const
const FOLDER_HINTS = [['⌘N', 'New document'], ['⌘P', 'Quick Open']] as const

/**
 * The editor with no Tab open: the dim wordmark and what to do next, each
 * hint a key chip and its action. With no Folder that is opening one; with a
 * Folder it is a new Document or Quick Open. There is no tab bar, but its
 * 52px strip stays, so the window drags from the top, under the traffic
 * lights and the sidebar icon while collapsed. The column is lifted
 * by that strip's height so it sits at the window's centre.
 */
export function EmptyEditor({ hasFolder }: EmptyEditorProps) {
  const hints = hasFolder ? FOLDER_HINTS : NO_FOLDER_HINTS
  return (
    <>
      <div className="h-13 flex-none" data-tauri-drag-region />
      <div className="flex flex-1 cursor-default flex-col items-center justify-center gap-4 pb-13" data-testid="editor-empty-state">
        <span className="text-sm font-medium text-text-muted">Plumo</span>
        <div className="flex gap-5">
          {hints.map(([keys, action]) => (
            <span key={keys} className="flex items-center gap-2 text-sm text-text-tertiary" data-testid="empty-hint">
              <kbd className="rounded-sm bg-state-hover px-1.5 py-px font-mono text-2xs font-normal tracking-normal text-text-secondary inset-ring inset-ring-border-default">{keys}</kbd>
              {action}
            </span>
          ))}
        </div>
      </div>
    </>
  )
}
