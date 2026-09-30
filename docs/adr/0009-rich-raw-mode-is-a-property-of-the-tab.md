---
status: accepted
date: 2026-09-11
amended: 2026-09-12 (review), 2026-09-30 (Properties, AIM-520)
---

# Rich/Raw mode is a property of the Tab

Rich mode and Raw mode are two surfaces for the same Document. Switching to Raw is a deliberate act on one Document: to see its exact bytes, to edit Frontmatter that Properties shows but cannot edit (a nested map, a `>` folded value), or because its Frontmatter is invalid and Rich mode must not touch it. None of those reasons carries over to the next Tab. So the mode is remembered per Document, kept while its Tab is open, and written to the Session as `openEditors[].mode`, so two Tabs can sit in different modes and a relaunch restores each.

The `useRawMode` hook already owns the switch sequence (flush the rich editor into the raw buffer before Raw, flush the raw buffer before Rich ends, map the caret between the two). What it lacked was a per-Document place to keep the answer.

## Decision

The mode is a field on the `Tab` (`mode: 'rich' | 'raw'`, absent on an Image Tab), set through the pure Tab rules in `noteTabsState` and carried into the Session by the same effect that writes Tab order. `useRawMode` keeps its file and its switch sequence and only changes where it reads and writes state: the active Tab's `mode`, handed back through `setTabMode`. The editor shell still owns the switch itself (the toggle is registered into a ref), because only it can serialize the rich editor into the raw buffer and map the caret before the other surface mounts.

Rejected:

- **One mode for the whole app or the whole Folder**: switching to Raw to fix one Document's Frontmatter would turn every other Tab Raw as well, and a Document whose Frontmatter must stay Raw would pin every Document.
- **A mode remembered per path beyond the Session**: a Document closed and reopened is a fresh open and defaults to Rich; nothing else in Plumo remembers a closed Document.
- **The mode as editor state rather than Tab data**: the Session is written from the Tabs, so a mode held by the editor would need a second channel to be restored.

The Tab rules also carry one invariant: **a Document whose Frontmatter is invalid is always in Raw mode.** Every path that changes a Tab's content (open, restore, save buffer, reload from disk) passes through `applyModeRule`, and `setTabMode` refuses Rich while the rule holds. This is a Tab rule rather than an editor concern because the editor must never mount Rich for such a Document, not even for a frame: BlockNote would render an unclosed `---` as a rule and the next save would rewrite bytes the user never touched.

Invalid is that structural check, not a YAML parse. Frontmatter that passes it but that YAML refuses (a broken value, a duplicate key) still opens in Rich mode: the body is editable, Properties says the Frontmatter cannot be read and offers Raw mode, and a save carries the block through byte for byte. Forcing Raw there would lock a Document out of Rich mode over bytes Rich mode never touches.

## Consequences

- A freshly opened Document is Rich; a restored one is whatever its Session entry says; a Document with invalid Frontmatter is Raw whatever was asked, and stays Raw after the user fixes it until they switch, so fixing YAML never yanks the surface out from under the caret.
- Switching Tabs can change `rawMode` without a toggle. The kernel's tab-swap hook already handles that (it skips the BlockNote swap while Raw is on and re-swaps when Raw ends), and the raw editor re-seeds its buffer from the Tab's content when it mounts.
- ⌘S, Tab switches, Move to Trash and quit flush both surfaces: the shell calls the rich flush and the raw flush together (`flushEditorBuffers`), since it does not know which one holds the fresh keystrokes.
- The raw editor's own debounce is Raw mode's idle wait, the same length as Rich mode's (ADR-0003); its reports take the Rich path (buffer, then write now) so a refused write becomes the error bar. A report equal to what the Tab already holds is dropped, which is how the raw editor's unmount re-report of a just-flushed edit does not write twice.
