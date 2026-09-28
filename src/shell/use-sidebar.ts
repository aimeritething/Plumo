import { useCallback, useMemo, useState } from 'react'
import { clampSidebarWidth, DEFAULT_SESSION_SIDEBAR, type SessionSidebar, type SidebarSection } from '@/session/session-schema'

/** The sidebar's facts, and whether the last change to `collapsed` slides there or snaps. */
interface SidebarState {
  sidebar: SessionSidebar
  slides: boolean
}

/**
 * The sidebar's persisted facts: whether it is collapsed, how wide it is when
 * shown, and which of its sections (Pinned, the Explorer) are folded away
 * under their label. All live in the Session's `sidebar` and come back on restore. Only the end states are held here; the transition
 * between them is the stylesheet's. `slides` says whether the last change
 * slides (a toggle, a collapse) or snaps (a restored Session, a resize); a
 * collapse that changes nothing leaves it as it was.
 */
export function useSidebar() {
  const [{ sidebar, slides }, setState] = useState<SidebarState>({ sidebar: DEFAULT_SESSION_SIDEBAR, slides: false })

  const toggle = useCallback(() => {
    setState((prev) => ({ sidebar: { ...prev.sidebar, collapsed: !prev.sidebar.collapsed }, slides: true }))
  }, [])

  /** Opening a Document with no Folder open collapses the sidebar; a second collapse changes nothing. */
  const collapse = useCallback(() => {
    setState((prev) => (prev.sidebar.collapsed ? prev : { sidebar: { ...prev.sidebar, collapsed: true }, slides: true }))
  }, [])

  const setWidth = useCallback((width: number) => {
    setState((prev) => {
      const next = clampSidebarWidth(width)
      return next === prev.sidebar.width ? prev : { sidebar: { ...prev.sidebar, width: next }, slides: false }
    })
  }, [])

  /** A section's label: folds the section away, or opens it again. */
  const toggleSection = useCallback((section: SidebarSection) => {
    setState((prev) => {
      const folded = prev.sidebar.collapsedSections ?? []
      const collapsedSections = folded.includes(section) ? folded.filter((each) => each !== section) : [...folded, section]
      return { ...prev, sidebar: { ...prev.sidebar, collapsedSections } }
    })
  }, [])

  /** Opens a folded section; an open one stays as it is. */
  const openSection = useCallback((section: SidebarSection) => {
    setState((prev) => {
      const folded = prev.sidebar.collapsedSections ?? []
      return folded.includes(section) ? { ...prev, sidebar: { ...prev.sidebar, collapsedSections: folded.filter((each) => each !== section) } } : prev
    })
  }, [])

  const restore = useCallback((restored: SessionSidebar) => {
    const { collapsed, width, collapsedSections } = restored
    setState({ sidebar: { collapsed, width: clampSidebarWidth(width), ...(collapsedSections?.length ? { collapsedSections } : {}) }, slides: false })
  }, [])

  return useMemo(() => ({ sidebar, slides, toggle, collapse, setWidth, toggleSection, openSection, restore }), [collapse, openSection, restore, setWidth, sidebar, slides, toggle, toggleSection])
}
