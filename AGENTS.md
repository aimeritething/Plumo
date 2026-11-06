# AGENTS.md

Plumo is a small macOS desktop app (React + Tauri) for reading and editing Markdown
Documents in a Folder on disk. Names follow the glossary in `CONTEXT.md`; read the
`docs/adr/` entries that touch the area you change. Issues: `docs/agents/issue-tracker.md`.

## Layout

`src/` is cut by feature, files flat inside each directory. Cross-directory imports use
`@/<dir>/…`; imports within a directory are relative.

- `kernel/` — the Kernel: BlockNote (`blocknote/`), the Markdown round-trip (`markdown/`),
  the open-time pipeline (`resolve/`), CodeMirror (`raw/`).
- `editor/` — the editing surface: the editor pane and its tab bar controls, Rich / Raw
  views, Autosave, Write failure, toasts. Utility classes only; no CSS file.
- `folder/` — disk: the watcher, asset scope, the Rust command wrappers. `explorer/`
  imports `folder/`, never the reverse.
- `shell/` — sidebar, theme, shortcuts, menu events. `app-command-manifest.json` is also
  read by `src-tauri/src/menu.rs`.
- `ui/` — Plumo's generic parts: nothing here knows of Documents, Blocks, the editor or
  Tauri. Any source (shadcn templates, Radix, hand-written); a part shadcn also has keeps
  shadcn's name and API. A control that needs a shared part to look different changes that
  part or adds a variant to it, never overrides it with its own classes.
- `platform/` — `tauri.ts` and `mock/`, the in-memory Folder fixture that stands in for
  Rust outside Tauri (so `pnpm dev` and the smoke specs run without it).
- `src-tauri/` — the Rust side: commands, the Folder watcher, the Session file, the menu.

Unit tests sit beside the code as `*.test.ts(x)`; helpers are `*.test-utils.ts(x)`; a test
with no source file of its own lives in the directory it guards. `tests/smoke/` holds the
Playwright specs (`pnpm smoke`, manual; its `README.md` describes the fixture).

`patches/` holds pnpm patches on BlockNote, TipTap and prosemirror-tables, pinned in
`pnpm-workspace.yaml`. Bumping those packages means re-applying the patches.

## Commands

Scripts are in `package.json`. `pnpm tauri dev` runs the full app under a dev identifier
so it never collides with an installed Plumo; `pnpm dev` runs the frontend alone against the
mock fixture.

Before calling work done, run what CI runs: `pnpm tsc`, `pnpm lint`, `pnpm test`, and in
`src-tauri/` `cargo clippy --all-targets` and `cargo test`.
