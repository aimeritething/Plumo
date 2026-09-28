import { ArrowSquareOut as ExternalLink } from '@phosphor-icons/react'
import { useCallback } from 'react'
import {
  DeleteLinkButton,
  EditLinkButton,
  LinkToolbar as BlockNoteLinkToolbar,
  useComponentsContext,
  useDictionary,
  type LinkToolbarProps,
} from '@blocknote/react'

function useRequiredComponentsContext() {
  const components = useComponentsContext()
  if (!components) throw new Error('BlockNote components context is unavailable')
  return components
}

type OpenLink = { onOpenLink: (href: string) => void }

// Opens the link the way ⌘+click does (see useEditorLinkActivation).
function OpenLinkButton({ url, onOpenLink }: Pick<LinkToolbarProps, 'url'> & OpenLink) {
  const Components = useRequiredComponentsContext()
  const dict = useDictionary()
  const handleOpen = useCallback(() => {
    onOpenLink(url)
  }, [onOpenLink, url])

  return (
    <Components.LinkToolbar.Button
      className="bn-button"
      label={dict.link_toolbar.open.tooltip}
      mainTooltip={dict.link_toolbar.open.tooltip}
      isSelected={false}
      onClick={handleOpen}
      icon={<ExternalLink size={16} />}
    />
  )
}

export function LinkToolbar({ onOpenLink, ...props }: LinkToolbarProps & OpenLink) {
  return (
    <BlockNoteLinkToolbar {...props}>
      <EditLinkButton
        url={props.url}
        text={props.text}
        range={props.range}
        setToolbarOpen={props.setToolbarOpen}
        setToolbarPositionFrozen={props.setToolbarPositionFrozen}
      />
      <OpenLinkButton url={props.url} onOpenLink={onOpenLink} />
      <DeleteLinkButton range={props.range} setToolbarOpen={props.setToolbarOpen} />
    </BlockNoteLinkToolbar>
  )
}
