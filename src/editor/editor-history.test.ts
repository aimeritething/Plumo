import { afterEach, describe, expect, it } from 'vitest'
import { nativeTextFieldHasFocus } from './editor-history'

describe('nativeTextFieldHasFocus', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('is true for a rename field or a find bar, whose history is the browser\'s', () => {
    document.body.innerHTML = '<input type="text" />'
    document.querySelector('input')!.focus()
    expect(nativeTextFieldHasFocus()).toBe(true)
  })

  it('is false for the editor, and with nothing focused', () => {
    expect(nativeTextFieldHasFocus()).toBe(false)
    document.body.innerHTML = '<div contenteditable="true" tabindex="0"></div>'
    document.querySelector('div')!.focus()
    expect(nativeTextFieldHasFocus()).toBe(false)
  })

  it('is false for the Command Menu\'s input, where Undo is picked as a row', () => {
    document.body.innerHTML = '<div data-command-palette="true"><input type="text" /></div>'
    document.querySelector('input')!.focus()
    expect(nativeTextFieldHasFocus()).toBe(false)
  })
})
