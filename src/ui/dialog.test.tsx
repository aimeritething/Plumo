import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Dialog, DialogContent, DialogTitle } from './dialog'

function OpenDialog() {
  return (
    <>
      <button type="button">Behind</button>
      <Dialog open>
        <DialogContent variant="panel">
          <DialogTitle>Settings</DialogTitle>
          <button type="button">First</button>
          <button type="button">Last</button>
        </DialogContent>
      </Dialog>
    </>
  )
}

// The focus guards Base UI puts either side of the popup, which Tab reaches
// from the dialog's last or first control.
function focusGuards() {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-base-ui-focus-guard]'))
}

describe('DialogContent', () => {
  it('pulls back a focus that something behind the open dialog takes', async () => {
    render(<OpenDialog />)
    const last = await screen.findByRole('button', { name: 'Last' })
    act(() => { last.focus() })

    act(() => { screen.getByRole('button', { name: 'Behind', hidden: true }).focus() })
    expect(last).toHaveFocus()
  })

  it('wraps Tab from the last control round to the first, and Shift+Tab back', async () => {
    render(<OpenDialog />)
    const first = await screen.findByRole('button', { name: 'First' })
    const last = screen.getByRole('button', { name: 'Last' })
    const popup = document.querySelector('[data-slot="dialog-content"]')!
    const guards = focusGuards()
    const after = guards.find((guard) => popup.compareDocumentPosition(guard) & Node.DOCUMENT_POSITION_FOLLOWING)!
    const before = guards.find((guard) => popup.compareDocumentPosition(guard) & Node.DOCUMENT_POSITION_PRECEDING)!

    // A guard is outside the popup, but reaching one is not the page taking
    // the focus: it is not sent back to where it was before Base UI moves it on.
    act(() => { last.focus() })
    act(() => { after.focus() })
    expect(last).not.toHaveFocus()
    await waitFor(() => expect(first).toHaveFocus())

    act(() => { before.focus() })
    expect(first).not.toHaveFocus()
    await waitFor(() => expect(last).toHaveFocus())
  })
})
