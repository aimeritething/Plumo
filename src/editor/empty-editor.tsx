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
        <span className="text-sm font-medium text-subtle-foreground">Plumo</span>
        <div className="flex gap-5">
          {hints.map(([keys, action]) => (
            <span key={keys} className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="empty-hint">
              <kbd className="rounded-sm bg-accent px-1.5 py-px font-mono text-2xs font-normal tracking-normal text-muted-foreground inset-ring inset-ring-border">{keys}</kbd>
              {action}
            </span>
          ))}
        </div>
      </div>
    </>
  )
}
