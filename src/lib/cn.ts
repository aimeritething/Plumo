import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// `border-hairline` (and its per-side forms) is a border width, bridged in
// index.css as `--border-width-hairline`. tailwind-merge does not know the
// name, so it would file it under border colours and drop it behind
// `border-border`; register it in the width groups instead.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "border-w": ["border-hairline"],
      "border-w-x": ["border-x-hairline"],
      "border-w-y": ["border-y-hairline"],
      "border-w-s": ["border-s-hairline"],
      "border-w-e": ["border-e-hairline"],
      "border-w-t": ["border-t-hairline"],
      "border-w-r": ["border-r-hairline"],
      "border-w-b": ["border-b-hairline"],
      "border-w-l": ["border-l-hairline"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
