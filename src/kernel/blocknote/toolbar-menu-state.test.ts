import { describe, expect, it } from 'vitest'
import {
  returnFocusAfterMenuClose,
  toolbarMenuAfter,
} from './toolbar-menu-state'

describe('toolbarMenuAfter', () => {
  it('opens the menu asked for and closes only the one that was open', () => {
    expect(toolbarMenuAfter(null, 'blockType', true)).toBe('blockType')
    expect(toolbarMenuAfter('blockType', 'blockType', false)).toBeNull()
    expect(toolbarMenuAfter('blockType', 'highlightColor', true)).toBe('highlightColor')
  })

  it('keeps the menu a click opened when the same click dismisses the other', () => {
    // The trigger's open lands first, the dismissed menu's close after.
    expect(toolbarMenuAfter('highlightColor', 'blockType', false)).toBe('highlightColor')
  })
})

describe('returnFocusAfterMenuClose', () => {
  it('keeps the focus in the editor after a choice, and lets the trigger take it otherwise', () => {
    const editorElement = document.createElement('div')
    const text = document.createElement('button')
    editorElement.appendChild(text)
    document.body.appendChild(editorElement)

    text.focus()
    expect(returnFocusAfterMenuClose(editorElement)).toBe(false)

    text.blur()
    expect(returnFocusAfterMenuClose(editorElement)).toBe(true)
    expect(returnFocusAfterMenuClose(null)).toBe(true)
    editorElement.remove()
  })
})
