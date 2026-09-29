# Plumo

A small desktop app for viewing and editing Markdown files. Open a `.md` directly, or open a folder and browse it from the sidebar.

## Language

### Content

**Document**:
A single `.md` file opened in Plumo. Plumo reads and writes the file on disk; it never owns a copy that outlives the session.
_Avoid_: Note, page, file (when you mean the Markdown content)
_In code_: `note`, the word the code uses. Code says note; people and UI say Document.

**Folder**:
The one directory the sidebar is currently rooted at. Plumo never writes configuration into a Folder; only Documents and their attachments live there.
_Avoid_: Vault, workspace, project, root
_In code_: `vault`, the word the code uses. Code says vault; people and UI say Folder.

**Attachment**:
An image pasted or dropped into a Document, stored in an `attachments/` directory beside that Document.
_Avoid_: Asset, upload

**Frontmatter**:
The YAML block at the top of a Document. Preserved byte-for-byte across saves; visible and editable only in Raw mode.

**Image file**:
A file in the Folder whose extension is one of apng, avif, bmp, gif, ico, jpeg, jpg, png, svg, tif, tiff, webp. Plumo shows it and never edits it. An Attachment is an Image file that a Document links to; an Image file need not be an Attachment.
_Avoid_: Image (alone, when you mean the file rather than the picture inside a Document), asset, media

### Editing

**Kernel**:
The part of the code built on ProseMirror, BlockNote and CodeMirror, together with the Markdown round-trip. Plumo's editing surface sits on top of it. A Kernel block may dispatch one of Plumo's commands but never implements one. Originally copied from Tolaria under AGPL-3.0 (see `NOTICE.md`).
_Avoid_: Engine, core, editor internals

**Rich mode**:
The WYSIWYG editing surface (BlockNote). It is also how a Document is "viewed"; there is no separate read-only preview.
_Avoid_: Preview, WYSIWYG mode, rendered mode

**Raw mode**:
The plain-Markdown editing surface (CodeMirror). Shows the exact bytes that are on disk, including Frontmatter.
_Avoid_: Source mode, code mode, plain mode

**Block**:
One unit of a Document's body in Rich mode (a paragraph, heading, list item, table, image, …), together with the Blocks nested under it. Raw mode has no Blocks, only lines.
_Avoid_: Node, element, paragraph (when you mean any kind of Block)

**Section**:
A heading Block and every Block after it up to the next heading of the same or a higher level. A folded heading hides its Section; moving, deleting or duplicating a folded heading acts on the whole Section.
_Avoid_: Chapter, group

**Autosave**:
Writing a Document's pending edits to disk after a short idle delay. Disk is written first; in-memory state updates only after the write succeeds.

**Write failure**:
A refused Autosave. The buffer keeps the edit and the Tab shows an error bar with Retry and Discard changes; closing that Tab, or quitting, asks the same instead of going ahead silently. The only prompt in the app; never on an Image file's Tab.
_Avoid_: Save error, unsaved changes, dirty

### Shell

**Explorer**:
The sidebar section that shows the Folder as a tree of Documents, sub-folders, and Image files. Any other file is not shown. It is headed by the Folder's name; the Folder itself is not a row in the tree, and the word "Explorer" does not appear in the UI.
_Avoid_: File tree, folder tree, sidebar (the Explorer is one section of the sidebar)

**Pinned**:
The sidebar section above the Explorer that lists the Documents and Image files the user chose to keep at hand. Pin and Unpin add and remove one. A sub-folder cannot be pinned, nor a file outside the Folder. Each Folder has its own Pinned list, kept in the order the user gives it. A pinned file follows a rename or move made in Plumo; when it leaves the Folder or disappears from disk, it is unpinned.
_Avoid_: Favorites, bookmarks, starred

**Tab**:
One entry in the tab bar above the editor; one Tab per open Document or Image file. Clicking a Document or an Image file in the Explorer always opens a real Tab (there are no preview tabs). When two open Tabs share a file name, each also shows its parent folder's name. An Image file's Tab shows the picture, fitted to the space beside the sidebar; it has no Rich or Raw mode.

**Command Menu**:
The Cmd+K palette that lists Plumo's commands and, as you type, fuzzy-matches commands, Document names, and Image file names. Every command in the native menu bar appears here and nothing else does.
_Avoid_: Command palette, palette

**Quick Open**:
The Command Menu's search-only mode, opened with Cmd+P: it fuzzy-matches Document and Image file names within the Folder and shows no commands. Searches names only, never contents.
_Avoid_: Search, file picker

**Recent Folders**:
The Folders Plumo has opened, most recent first, at most ten. Only a directory opened as a Folder counts; the directory of a Document opened on its own does not. The current Folder is in the list. Choosing one replaces the current Folder in the same window.
_Avoid_: Recent workspaces, history, vault list

**Folder switcher**:
The control at the bottom of the sidebar that names the current Folder. Choosing it lists the Recent Folders, then Open Folder… and Close Folder. There is none while no Folder is open; the Recent Folders are then listed under Open Folder instead.
_Avoid_: Footer, workspace switcher, folder picker

**Session**:
The state Plumo restores on launch: the Folder, the open Tabs (with each Document's Rich or Raw mode), the active Tab, theme, sidebar state (its width, and which sections are collapsed), and window geometry. It also keeps, for each Folder, its Pinned list and the Tabs that were open when the Folder was last shown, so a Folder opened again gets its pins and its Tabs back; a Tab belongs to the Folder that was open when it was opened, wherever its file lives. It also keeps the Recent Folders. Stored in the app's own config directory, never in the Folder.
