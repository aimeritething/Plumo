# Smoke specs

`pnpm smoke` runs the Playwright specs in this directory in Chromium (fetching it first if it
is missing) against `pnpm dev`, one worker, local only. The whole React app runs; only the
Rust side is replaced. The dev server listens on port 5202; set `PLUMO_SMOKE_PORT` to run the
specs against a second checkout while another dev server holds that port.

## The Folder fixture

Outside Tauri every command goes to the in-memory Folder fixture in
`src/platform/mock/vault-fixture.ts`. It answers the file commands (`list_files`,
`get_note_content`, `save_note_content`, `create_note_content`, `duplicate_vault_file`, `create_vault_folder`,
`rename_vault_file`, `rename_vault_folder`, `move_note_to_folder`, `delete_note`,
`delete_vault_folder`), the watcher (`start_vault_watcher`, `stop_vault_watcher`), the
Finder-open buffer (`take_pending_open`), the Session (`read_session`, `update_session`),
the Settings (`read_settings`, `update_settings`),
`reveal_path_in_file_manager`, `open_vault_file_external`, `copy_text_to_clipboard` and
`quit_app` from memory, and
rejects anything else. Argument and result shapes follow the Rust commands. Add a case to the
fixture's `answer` switch when a spec needs a command it does not answer yet.

The default seed is a few small files the specs lean on (`Welcome.md`, `Reading list.md`,
`Projects/Plumo.md`, `Attachments/lake.png`) plus the style catalog under `Style catalog/`:
the Documents and pictures in `src/platform/mock/style-catalog/`, there for a person to read
while tuning styles. Dropping a file into that directory adds it to the seed. The catalog
changes often, so a spec never asserts on what is inside it, and a new catalog file should
not share a name fragment with the files the Quick Open specs search for (`plu`, `lake`,
`welcome`). The dev server answers a catalog Document's `../images/<name>` at
`/images/<name>` (`styleCatalogImages` in `vite.config.ts`), since nothing resolves a
Document's pictures outside Tauri.

A spec reaches the fixture as `window.__plumoMockVault`:

- `reset(seed)` restores the seed (or a new one) and clears the watcher, the pending opens,
  the dialog queue, the read-only marks, the Session and Settings files and the call log.
- `writeNote(path, content)` and `writeImage(path, image)` add a file without going through
  a command, as another program would; `removeFile(path)` and `movePath(path, newPath)` are
  Finder's stand-ins, and `emitExternalChange(paths)` is the watcher's report.
- `seedPendingOpen(paths)` plants a Finder launch by document for the next page load (kept in
  localStorage like the Session, drained once). `openFromFinder(paths)` opens from Finder
  while the app runs: it buffers the paths and fires the window event that stands in for the
  Rust side's poke. `queuePendingOpen(paths)` buffers without the poke.
- `queueDialogSelection(paths)` decides what the next Open Document… or Open Folder… dialogs
  "return", in order. The dialog is a plugin call with no command behind it, so the fixture
  stands in for it too.
- `markReadOnly(paths)` makes `save_note_content` refuse those paths, as a read-only file
  would; an empty list lifts it.
- `seedSession(session)` plants the Session file the next page load restores, and
  `seedSettings(settings)` the Settings file. The fixture keeps both in localStorage, so a
  reload stands in for a relaunch.
- `calls` is the log of every command the app invoked, with its arguments; `revealedPath()`,
  `openedExternallyPath()` and `clipboardText()` are what Reveal in Finder, Open in Default
  App and Copy last received; `assetUrl(path)` is
  what the asset protocol would serve for an Image file.

Shared helpers (opening the welcome Document, driving the dialogs, reading the saved
content and the stored Session, typing at the end of the Document) live in `harness.ts`.
