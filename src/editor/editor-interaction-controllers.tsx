import { useCallback } from 'react'
import {
  LinkToolbarController,
  SideMenuController,
  SuggestionMenuController,
  TableHandlesController,
  type FormattingToolbarProps,
  type SideMenuProps,
} from '@blocknote/react'
import type { AppLocale } from '@/lib/i18n'
import { FilePanelController } from './file-panel'
import { LinkToolbar } from '@/kernel/blocknote/link-toolbar'
import { SlashMenu } from '@/kernel/blocknote/slash-menu'
import { CollapsedHeadingsController, SideMenu } from '@/kernel/blocknote/block-note-side-menu'
import { TableHandle } from '@/kernel/blocknote/block-note-table-handle'
import { FormattingToolbar } from '@/kernel/blocknote/formatting-toolbar'
import { FormattingToolbarController } from '@/kernel/blocknote/formatting-toolbar-controller'
import type { SuggestionAction, useSuggestionMenuItems } from '@/kernel/blocknote/use-slash-menu-items'

type EditorInteractionControllersProps = ReturnType<typeof useSuggestionMenuItems> & {
  locale: AppLocale
  onOpenLink: (href: string) => void
  onToolbarMouseDown: (event: Pick<React.MouseEvent<HTMLElement>, 'target' | 'preventDefault'>) => void
  runEditorAction: (action: SuggestionAction) => void
  vaultPath?: string
}

function EditorToolbarControllers({
  locale,
  onOpenLink,
  onToolbarMouseDown,
  vaultPath,
}: Pick<EditorInteractionControllersProps, 'locale' | 'onOpenLink' | 'onToolbarMouseDown' | 'vaultPath'>) {
  const sideMenu = useCallback((props: SideMenuProps) => <SideMenu {...props} locale={locale} />, [locale])
  const formattingToolbar = useCallback(
    (props: FormattingToolbarProps) => (
      <FormattingToolbar {...props} locale={locale} vaultPath={vaultPath} />
    ),
    [locale, vaultPath],
  )
  const linkToolbar = useCallback(
    (props: Omit<React.ComponentProps<typeof LinkToolbar>, 'onOpenLink'>) => (
      <LinkToolbar {...props} onOpenLink={onOpenLink} />
    ),
    [onOpenLink],
  )
  const floatingUIOptions = { elementProps: { onMouseDownCapture: onToolbarMouseDown } }

  return (
    <>
      <CollapsedHeadingsController />
      <SideMenuController sideMenu={sideMenu} />
      <FormattingToolbarController
        formattingToolbar={formattingToolbar}
        floatingUIOptions={floatingUIOptions}
      />
      <LinkToolbarController linkToolbar={linkToolbar} floatingUIOptions={floatingUIOptions} />
      <FilePanelController />
      <TableHandlesController tableHandle={TableHandle} />
    </>
  )
}

function EditorSuggestionControllers({
  getSlashMenuItems,
}: Pick<EditorInteractionControllersProps, 'getSlashMenuItems'>) {
  return (
    <SuggestionMenuController
      triggerCharacter="/"
      getItems={getSlashMenuItems}
      suggestionMenuComponent={SlashMenu}
    />
  )
}

export function EditorInteractionControllers(props: EditorInteractionControllersProps) {
  return (
    <>
      <EditorToolbarControllers {...props} />
      <EditorSuggestionControllers {...props} />
    </>
  )
}
