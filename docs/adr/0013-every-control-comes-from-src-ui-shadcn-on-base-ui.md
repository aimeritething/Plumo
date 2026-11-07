---
status: accepted
date: 2026-11-07
---

# Every control comes from `src/ui`: shadcn's components, on Base UI

`src/ui` held shadcn's components on Radix, but much of the app went around it: the Command Menu, the Tab bar, the Explorer's and Pinned's rows, the Outline's card, the Rich/Raw switch and the Settings pickers each had their own buttons, keyboard handling and copied class strings, and one Tooltip wrapper was written seven times. So every control now comes from `src/ui`, and `src/ui` is shadcn's components, added with the shadcn CLI and kept to shadcn's interface; only the colour roles (ADR-0012) and Plumo's own variants change. The work is done in two steps: first every caller moves onto `src/ui` (still on Radix), then `src/ui` alone moves from Radix to Base UI.

## Rules

- A control shadcn has is shadcn's: Sidebar, Command, ToggleGroup, HoverCard, Collapsible and the rest. A Plumo look is a `cva` variant in `src/ui`, not a class string in a feature.
- A reusable control shadcn does not have (`toolbar`, `menu-list`) lives in `src/ui` too, and its file says why shadcn has none.
- A feature component used once (the Tab bar, the Outline) stays in its feature directory and is built from `src/ui` parts.
- Outside `src/ui`, no `asChild` and no `data-[state=…]`: those are Radix's, and a lint rule keeps them out, so the move to Base UI touches `src/ui` only.
- Four exceptions, each for a reason shadcn cannot meet: the pointer-only resize handles on images and boards; the Image block caption input (a `ui/input` there loses WebKit's node selection); the hidden `<input>`s that open the native file and colour pickers; tldraw's own panels.

## Considered Options

- **Stay on Radix.** No Radix bug forced the move (the one workaround is `TooltipBoundary`); Base UI is where shadcn is going, so copying from shadcn stays cheap.
- **One step: regenerate `src/ui` on Base UI and move every caller at once.** A regression would not say whether the unification or the library caused it.
- **Plumo's own controls modelled on shadcn.** Each would have to be matched by hand against shadcn's Base UI version when the library changes.

## Consequences

- The shadcn Sidebar loses its cookie, its ⌘B shortcut and its mobile sheet: the Session keeps the sidebar's state, `app-command-manifest.json` owns shortcuts, and Plumo is desktop only. Plumo's resize handle stays.
- The Explorer is a list of buttons, not a `role="tree"`: no arrow-key navigation, and depth is still `explorerRowIndent`, not nested `SidebarMenuSub`s. Pinned keeps Alt+Arrow reordering, the only way to reorder it without a pointer.
- The Slash menu keeps `menu-list`, which never takes the focus: the focus stays in the editor while the user types the filter.
- Rows and section headers show no native `title=` path; a Tab's parent hint, the tree and the Folder switcher already say where a file is.
- Radix stays in the bundle through tldraw and cmdk. The goal is that Plumo's own code imports none of it.
- Base UI's overlays and Radix's cannot nest without fighting over focus, so the overlay components move together, and the board's fullscreen dialog (Plumo's dialog around tldraw's Radix menus) is checked by hand.
