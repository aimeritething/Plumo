---
status: accepted
date: 2026-09-11
amended: 2026-09-28 (AIM-471: the drop point is read; AIM-515: the margins count as the editor)
---

# One native drag-drop intake splits Documents from Attachments

The main window runs with `dragDropEnabled: true`, so WKWebView never lets an external file drop reach the page: no HTML5 `dragover` and no `drop` fires for a file from Finder, and the drop arrives only as Tauri's own event. Two things have to come out of that one event: a dropped `.md` opens as a Document, and an image dropped over a Document becomes an Attachment.

The image drop hook carried over with the kernel listened to `tauri://drag-drop` and `tauri://drag-leave` on the webview and branched on `payload.type`. Tauri emits those raw events with `{ paths, position }` and no `type` at all — the kind of drag is carried by the event name, and only `Window.onDragDropEvent` folds the four names back into a tagged payload. The carried hook's native branch therefore recognised nothing and imported nothing; every dropped image fell through it.

## Decision

`useTauriDragDropEvent` is the renderer's single native drag-drop intake. It subscribes through `getCurrentWindow().onDragDropEvent`, validates the tagged payload, and hands it to as many consumers as ask for it. Both consumers go through it and each ignores in silence what is not its own:

- `useDocumentDrop`, mounted by the App, opens every dropped `.md`, activating the Tab of one already open. It shares the settle-then-open sequence (`openNotesSettled`) with File → Open Document…, so the two cannot drift.
- `useImageDrop`, mounted with the editor, copies every dropped Image file into `attachments/` beside the Document and inserts it where it was released. Only the enter event names the paths, so it alone decides whether the drag carries an Image file, and a `.md` passing over the Document never offers to become a picture. The enter and over events both carry the pointer's position, and the drop affordance shows while that position is over the editor, by the rule below, and hides as soon as it leaves.

What counts as an Image file is the glossary's list, shared from `src/folder/file-preview.ts` and matched by the Rust copy command, so a drop and the Explorer agree on what a picture is.

Nothing else is picked up, so nothing but Documents and `attachments/` is ever written into the Folder.

Where the image goes is the drop point, not the caret. The user looks at where they release the file, and the caret may sit at the top of the Document or off screen, so an image put there lands out of sight. The drop's position is read and turned into a place in the Document:

- **Only over the editor, margins included.** The drop is the window's event, so a release over the sidebar, the tab bar or anything laid over the editor reaches the hook too. What counts as the editor is the editor pane's document area, its `.editor-scroll-area`: the editor's own element and the empty ground around it, which in a wide window is the margin left and right of Rich mode's centred text column. A release there is taken; one over the find bar at the top of that area, over a dialog or menu laid on it, or outside it is not, and nothing is copied or inserted. A margin that took nothing would read as dropping being broken.
- **At the nearest block boundary.** In Rich mode the images go before the block under the pointer when it is in that block's upper half and after it in the lower half, the rule the block drag handle's drop indicator already follows; below the last block they go after it. A pointer beside the text column, in the editor's side padding or the margins, is read as if moved sideways onto the nearest edge of the column at the same height; the drop indicator reads it the same way through the same helper (`blockElementFromPoint`). In Raw mode they go on lines of their own before or after the line at the pointer's height, by the same halves, set apart from the text around them by blank lines, and never into the Frontmatter; only the height is read, so the gutter and the space beside a short line find the line there.
- **In the order dropped.** The copies run side by side and finish in any order, so nothing is inserted until every copy of the drop has settled; then the ones that landed go in consecutively in the order of `paths`, and each one that did not says so in a toast.

The place is read the moment the drop lands, before any copy starts, so the layout it is read from is the one the user saw.

Tauri types the position as physical pixels, but on macOS wry reads `NSDraggingInfo.draggingLocation`, which is in points from the webview's top-left: already the page's CSS pixels. Only Windows reports true pixels and is scaled down by `devicePixelRatio`.

Where the hook is mounted is still the rule for which Documents a drop may reach: the editor mounts with a Document's Tab and not with the empty editor, so an image dropped with no Tab open reaches no consumer and does nothing — no toast. Rich mode and Raw mode each mount it, so both take image drops, copy through the same command, and write the same Markdown for the image: Raw mode's line is the image block's own serialization, `![](attachments/<name>)` beside a Document at the Folder root.

The hook's HTML5 branch follows the same rules with the event's own coordinates, listening on the whole document area and reading the event's target where the native branch hit-tests the point. Under Tauri no external drop reaches it; it is the path for `pnpm dev` in a plain browser, and for the editor's own internal drags. BlockNote's side menu re-dispatches a drag that lands near its editor into the editor as a `synthetic` copy with the point pulled inside; the real event has already been read, so the branch stops the copy of an image drag.

## Consequences

- A Document's Attachments have to be viewable, which the asset protocol refuses until their directory is in its scope. `useNoteTabs` allows the boundary root through `sync_vault_asset_scope_for_window` before it reads a Document, so the content reaches the editor with its images resolvable rather than a paint later. Saving or copying an image already allows the root on the Rust side.
- Clipboard paste needs none of this: WKWebView puts a pasted image in `clipboardData`, the kernel's paste handler falls through to BlockNote's file branch, and `uploadFile` writes the Attachment through `save_image`. That is Rich mode's alone: Raw mode's CodeMirror pastes only the clipboard's text, so an image pasted there does not become an Attachment.
- Image files open as Tabs of their own. Such a Tab has no editor, so it mounts no image drop hook, and an image dropped over it is ignored by construction rather than by a check.
- A drop that carries both a `.md` and an image does both, each through its own consumer, when it is released over the editor. Nothing requires one to win. A `.md` opens wherever it is released.
- One slow copy holds back the rest of its drop; the images appear together once the last copy settles, rather than one by one in an order the user did not choose.
