import type { AppLocale } from '@/lib/i18n'
import type { RawEditorFindController } from './raw-editor-find-types'

export type FindControlsProps = Pick<
  RawEditorFindController,
  | 'caseSensitive'
  | 'close'
  | 'findInputRef'
  | 'handleFindChange'
  | 'handleFindKeyDown'
  | 'hasMatches'
  | 'moveNext'
  | 'movePrevious'
  | 'query'
  | 'regex'
  | 'status'
  | 'toggleCaseSensitive'
  | 'toggleRegex'
> & {
  locale: AppLocale
  onReplaceOpenChange: (open: boolean) => void
  replaceOpen: boolean
}

export type ReplaceControlsProps = Pick<
  RawEditorFindController,
  'handleReplaceKeyDown' | 'hasMatches' | 'replaceAll' | 'replaceCurrent' | 'replacement' | 'setReplacement'
> & {
  locale: AppLocale
}
