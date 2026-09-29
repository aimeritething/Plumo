import {
  useCallback,
  useMemo,
} from 'react'
import type {
  useCreateBlockNote,
} from '@blocknote/react'
import { createTranslator, type AppLocale } from '@/lib/i18n'
import { getSlashMenuItems } from './slash-menu-items'

export type SuggestionAction = () => void
type SuggestionItemWithClick = { onItemClick?: SuggestionAction }

function guardSuggestionMenuItems<T extends SuggestionItemWithClick>(
  items: T[],
  runEditorAction: (action: SuggestionAction) => void,
): T[] {
  return items.map((item) => {
    if (!item.onItemClick) return item

    const onItemClick = item.onItemClick
    return {
      ...item,
      onItemClick: () => runEditorAction(onItemClick),
    }
  })
}

interface SuggestionMenuItemsOptions {
  editor: ReturnType<typeof useCreateBlockNote>
  locale: AppLocale
  runEditorAction: (action: SuggestionAction) => void
}

function useSlashMenuItems(
  editor: ReturnType<typeof useCreateBlockNote>,
  runEditorAction: (action: SuggestionAction) => void,
  t: ReturnType<typeof createTranslator>,
) {
  return useCallback(async (query: string) => {
    try {
      return guardSuggestionMenuItems(
        await Promise.resolve(getSlashMenuItems(editor, query, {
          calloutTitle: t('editor.slash.callout'),
          calloutTypeTitles: {
            abstract: t('editor.slash.callout.abstract'),
            bug: t('editor.slash.callout.bug'),
            danger: t('editor.slash.callout.danger'),
            example: t('editor.slash.callout.example'),
            failure: t('editor.slash.callout.failure'),
            info: t('editor.slash.callout.info'),
            note: t('editor.slash.callout.note'),
            question: t('editor.slash.callout.question'),
            quote: t('editor.slash.callout.quote'),
            success: t('editor.slash.callout.success'),
            tip: t('editor.slash.callout.tip'),
            todo: t('editor.slash.callout.todo'),
            warning: t('editor.slash.callout.warning'),
          },
          dateTitle: t('editor.slash.date'),
          datetimeTitle: t('editor.slash.datetime'),
          duplicateTitle: t('editor.slash.duplicate'),
          sandboxBlockTitle: t('editor.slash.htmlBlock'),
          mathTitle: t('editor.slash.math'),
          timeTitle: t('editor.slash.time'),
        })),
        runEditorAction,
      )
    } catch (error) {
      console.warn('[editor] Ignored stale slash menu query:', error)
      return []
    }
  }, [editor, runEditorAction, t])
}

export function useSuggestionMenuItems(options: SuggestionMenuItemsOptions) {
  const t = useMemo(() => createTranslator(options.locale), [options.locale])
  const getSlashMenuItems = useSlashMenuItems(options.editor, options.runEditorAction, t)

  return {
    getSlashMenuItems,
  }
}
