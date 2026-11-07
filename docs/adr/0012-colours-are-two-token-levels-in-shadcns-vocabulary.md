---
status: accepted
date: 2026-11-07
---

# Colours are two token levels, scales under roles, in shadcn's vocabulary

The colour tokens had grown one name per component state (`sidebar-row-hover`, `tab-hover`, `menu-item-hover`, `control-tertiary-hover`, …): seven nearly equal grays across a dozen names, each a literal hex value. With every token a hand-picked value, a user-chosen Primary color could not reach the hover, the soft fill and the selection that hang off it. So colours are now two levels. The first is twelve-step scales on Radix Colors' model (`src/color-scales.css`), each step with a fixed job, and a see-through twin for each step. The second is roles that each point at a step (`index.css`). Components use the roles only. The Primary color is a scale built at runtime from one colour, so choosing it in Settings repaints every role that uses it, and the dark theme only has to swap scales.

The roles take shadcn's names wherever shadcn has the role, and follow shadcn's pattern for the rest (`subtle-foreground`, `selected`, `link`, `selection`, `primary-muted`, the status and content colours). shadcn's names come with two consequences. `primary` is the Primary color, and `accent` is the gray hover fill, not a brand colour. Also, the sidebar keeps shadcn's full `sidebar-*` set, plus `sidebar-selected`. By default each of these points at the general role, so the sidebar can be changed later without touching components. No other region gets its own set. Tailwind's own palette is turned off, so a colour class is always a role.

## Considered Options

- **Radix Themes' way**: components use scale steps directly (`bg-gray-3`). This works, but the code then says "step 3", not "the hover fill", and every step number becomes part of the components' contract.
- **shadcn's way alone**: one flat layer of roles, with no scales under it. The derived colours of a user-chosen Primary color (hover, soft fill, selection, readable text) would then have to come from `color-mix` with no control over contrast.
- **Plumo's own role names** (`surface-*`, `text-*`, `state-*`). Components copied from shadcn would need their class names rewritten, and shadcn themes could not be brought in.

## Consequences

- `accent` does not mean the Primary color. The glossary's term is Primary color, and the code says `primary`.
- Hover and selected are different roles (`accent`, `selected`), which shadcn does not separate. A component copied from shadcn that shows a current item with `accent` should use `selected` for it.
- The default blue's scale is written into `color-scales.css` as `--blue-*`. `primary-color.test.ts` checks it against the generator, so a change to the generator's step targets needs the file regenerated.
