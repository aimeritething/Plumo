import type { ReactNode } from "react"
import { Dialog as RadixDialog } from "radix-ui"

/**
 * The Radix dialog that tldraw's own dialog parts (`TldrawUiDialogTitle`, its
 * close button) need above them: they are Radix's `Dialog.Title` and
 * `Dialog.Close` and throw outside a Radix `Dialog`. It draws nothing, holds
 * no focus and blocks no pointer, so tldraw's menus inside the panel keep
 * both. The one Radix import left in Plumo, under ADR-0013's exception for
 * tldraw's own panels; every Plumo dialog is ui/dialog, on Base UI.
 */
function TldrawDialogScope({
  onOpenChange,
  children,
}: {
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  return (
    <RadixDialog.Root open onOpenChange={onOpenChange}>
      {children}
    </RadixDialog.Root>
  )
}

export { TldrawDialogScope }
