import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useSidebar } from './use-sidebar'

describe('useSidebar', () => {
  it('starts expanded at the default width', () => {
    const { result } = renderHook(() => useSidebar())

    expect(result.current.sidebar).toEqual({ collapsed: false, width: 260 })
  })

  it('toggles between collapsed and expanded, and collapse is one-way', () => {
    const { result } = renderHook(() => useSidebar())

    act(() => result.current.toggle())
    expect(result.current.sidebar.collapsed).toBe(true)
    act(() => result.current.toggle())
    expect(result.current.sidebar.collapsed).toBe(false)
    act(() => result.current.collapse())
    act(() => result.current.collapse())
    expect(result.current.sidebar.collapsed).toBe(true)
  })

  it('slides on a toggle or a collapse, and snaps on a restore, a resize, or a collapse that changes nothing', () => {
    const { result } = renderHook(() => useSidebar())
    expect(result.current.slides).toBe(false)

    act(() => result.current.toggle())
    expect(result.current.slides).toBe(true)
    act(() => result.current.restore({ collapsed: true, width: 260 }))
    expect(result.current.slides).toBe(false)
    act(() => result.current.collapse())
    expect(result.current.slides).toBe(false)
    act(() => result.current.toggle())
    act(() => result.current.setWidth(320))
    expect(result.current.slides).toBe(false)
    act(() => result.current.collapse())
    expect(result.current.slides).toBe(true)
  })

  it('keeps a dragged width inside the sidebar range', () => {
    const { result } = renderHook(() => useSidebar())

    act(() => result.current.setWidth(320))
    expect(result.current.sidebar.width).toBe(320)
    act(() => result.current.setWidth(40))
    expect(result.current.sidebar.width).toBe(180)
  })

  it('takes the Session state back on restore, clamped the same way', () => {
    const { result } = renderHook(() => useSidebar())

    act(() => result.current.restore({ collapsed: true, width: 9000 }))
    expect(result.current.sidebar).toEqual({ collapsed: true, width: 480 })
  })

  it('folds a section away and back, and a restore brings the folded sections back', () => {
    const { result } = renderHook(() => useSidebar())

    act(() => result.current.toggleSection('pinned'))
    expect(result.current.sidebar.collapsedSections).toEqual(['pinned'])
    act(() => result.current.toggleSection('pinned'))
    expect(result.current.sidebar.collapsedSections).toEqual([])

    act(() => result.current.restore({ collapsed: false, width: 300, collapsedSections: ['pinned'] }))
    expect(result.current.sidebar).toEqual({ collapsed: false, width: 300, collapsedSections: ['pinned'] })
  })

  it('folds the Explorer apart from Pinned, and opens it without touching an open one', () => {
    const { result } = renderHook(() => useSidebar())

    act(() => result.current.toggleSection('pinned'))
    act(() => result.current.toggleSection('explorer'))
    expect(result.current.sidebar.collapsedSections).toEqual(['pinned', 'explorer'])

    act(() => result.current.openSection('explorer'))
    expect(result.current.sidebar.collapsedSections).toEqual(['pinned'])
    const before = result.current.sidebar
    act(() => result.current.openSection('explorer'))
    expect(result.current.sidebar).toBe(before)
  })

  it('keeps the same state object when nothing changes, so nothing downstream re-renders', () => {
    const { result } = renderHook(() => useSidebar())
    const before = result.current.sidebar

    act(() => result.current.setWidth(260))
    expect(result.current.sidebar).toBe(before)
  })
})
