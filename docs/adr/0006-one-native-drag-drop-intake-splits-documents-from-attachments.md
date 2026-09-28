---
status: accepted
date: 2026-09-11
---

# One native drag-drop intake splits Documents from Attachments

The main window runs with `dragDropEnabled: true`, so WKWebView never lets an external file drop reach the page: no HTML5 `dragover` and no `drop` fires for a file from Finder, and the drop arrives only as Tauri's own event. Two things have to come out of that one event: a dropped `.md` opens as a Document, and an image dropped over a Document becomes an Attachment.

The image drop hook carried over with the kernel listened to `tauri://drag-drop` and `tauri://drag-leave` on the webview and branched on `payload.type`. Tauri emits those raw events with `{ paths, position }` and no `type` at all — the kind of drag is carried by the event name, and only `Window.onDragDropEvent` folds the four names back into a tagged payload. The carried hook's native branch therefore recognised nothing and imported nothing; every dropped image fell through it.

## Decision

`useTauriDragDropEvent` is the renderer's single native drag-drop intake. It subscribes through `getCurrentWindow().onDragDropEvent`, validates the tagged payload, and hands it to as many consumers as ask for it. Both consumers go through it and each ignores in silence what is not its own:

- `useDocumentDrop`, mounted by the App, opens every dropped `.md`, activating the Tab of one already open. It shares the settle-then-open sequence (`openNotesSettled`) with File → Open Document…, so the two cannot drift.
- `useImageDrop`, mounted with the editor, copies every dropped Image file into `attachments/` beside the Document and inserts an image block at the caret. The enter event raises the drop affordance, and only when the drag carries an Image file, so a `.md` passing over the Document does not offer to become a picture. The over event, which repeats for every pointer move and names no paths, leaves the affordance where it is.

What counts as an Image file is the glossary's list, shared from `src/folder/file-preview.ts` and matched by the Rust copy command, so a drop and the Explorer agree on what a picture is.

Nothing else is picked up, so nothing but Documents and `attachments/` is ever written into the Folder.

Where the hook is mounted is the rule for what a drop may do, and no coordinate is read: the editor mounts with a Document's Tab and not with the empty editor, so an image dropped with no Tab open reaches no consumer and does nothing — no toast.

The hook's HTML5 branch stays as carried. Under Tauri no external drop reaches it; it is the path for `pnpm dev` in a plain browser, and for the editor's own internal drags.

## Consequences

- A Document's Attachments have to be viewable, which the asset protocol refuses until their directory is in its scope. `useNoteTabs` allows the boundary root through `sync_vault_asset_scope_for_window` before it reads a Document, so the content reaches the editor with its images resolvable rather than a paint later. Saving or copying an image already allows the root on the Rust side.
- Clipboard paste needs none of this: WKWebView puts a pasted image in `clipboardData`, the kernel's paste handler falls through to BlockNote's file branch, and `uploadFile` writes the Attachment through `save_image`.
- Image files open as Tabs of their own. Such a Tab has no editor, so it mounts no image drop hook, and an image dropped over it is ignored by construction rather than by a check.
- A drop that carries both a `.md` and an image does both, each through its own consumer. Nothing requires one to win.
