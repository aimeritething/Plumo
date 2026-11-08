import { cva } from "class-variance-authority"

// The popover surface: the card everything that floats over the app sits on
// (a menu, a popover, a dialog, a hint laid over the editor), so they read as
// one material. shadcn writes these classes into each component; Plumo keeps
// them here once. `elevation` is the shadow: `menu` for a card beside the
// thing it acts on, `dialog` for one that stands over the whole window.
const surfaceVariants = cva(
  "rounded-xl border-hairline border-border bg-popover text-foreground",
  {
    variants: {
      elevation: {
        menu: "shadow-md",
        dialog: "shadow-lg",
      },
    },
    defaultVariants: {
      elevation: "menu",
    },
  }
)

export { surfaceVariants }
