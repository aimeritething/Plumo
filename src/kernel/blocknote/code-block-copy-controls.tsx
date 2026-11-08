import { Copy } from '@phosphor-icons/react'
import { useCallback, useMemo } from 'react'
import type { AppLocale } from '@/lib/i18n'
import { createTranslator } from '@/lib/i18n'
import { trackEvent } from '@/lib/telemetry'
import { writeClipboardText } from '@/platform/clipboard-text'
import { codeBlockText } from './editor-rich-copy'
import { SimpleTooltip } from '@/ui/tooltip'
import { Toolbar, ToolbarButton } from '@/ui/toolbar'
import type { CodeBlockCopyTarget } from './use-code-block-copy-target'

function stopCopyButtonEvent(event: React.MouseEvent<HTMLButtonElement>): void {
  event.preventDefault()
  event.stopPropagation()
}

function reportCopyFailure(error: unknown): void {
  console.warn('[editor] Failed to copy code block:', error)
}

function useCodeBlockCopyAction(copyTarget: CodeBlockCopyTarget) {
  return useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    stopCopyButtonEvent(event)
    void writeClipboardText(codeBlockText(copyTarget.codeBlock)).then(() => {
      trackEvent('code_block_copied')
    }).catch(reportCopyFailure)
  }, [copyTarget])
}

export function CodeBlockCopyButton({ copyTarget, locale }: { copyTarget: CodeBlockCopyTarget; locale: AppLocale }) {
  const t = useMemo(() => createTranslator(locale), [locale])
  const label = t('editor.codeBlock.copy')
  const handleCopy = useCodeBlockCopyAction(copyTarget)
  return (
    <Toolbar aria-label={t('editor.codeBlock.toolbar')} className="absolute z-raised" contentEditable={false} data-editor-code-copy style={{ left: copyTarget.left, top: copyTarget.top }}>
      <SimpleTooltip label={label} side="left">
        <ToolbarButton
          aria-label={label}
          onClick={handleCopy}
          onMouseDown={stopCopyButtonEvent}
          size="sm"
        >
          <Copy aria-hidden="true" />
        </ToolbarButton>
      </SimpleTooltip>
    </Toolbar>
  )
}
