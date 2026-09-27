import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/ui/context-menu'
import { installNativeContextMenuSuppression } from './native-context-menu'

describe('installNativeContextMenuSuppression', () => {
  let uninstall: (() => void) | null = null

  afterEach(() => {
    uninstall?.()
    uninstall = null
  })

  it('leaves a Radix context menu able to open', async () => {
    uninstall = installNativeContextMenuSuppression(document)
    render(
      <ContextMenu>
        <ContextMenuTrigger asChild><div>row</div></ContextMenuTrigger>
        <ContextMenuContent data-testid="menu">
          <ContextMenuItem>Rename</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    )

    fireEvent.contextMenu(screen.getByText('row'), { button: 2, clientX: 10, clientY: 10 })

    expect(await screen.findByTestId('menu')).toBeInTheDocument()
  })

  it('prevents the native menu where no context menu is', () => {
    uninstall = installNativeContextMenuSuppression(document)
    render(<div>prose</div>)

    const notCancelled = fireEvent.contextMenu(screen.getByText('prose'), { button: 2 })

    expect(notCancelled).toBe(false)
  })
})
