import {
  DEFAULT_LINK_PROTOCOL,
  LinkToolbarExtension,
  VALID_LINK_PROTOCOLS,
} from '@blocknote/core/extensions'
import { useDictionary, useExtension } from '@blocknote/react'
import { useState, type KeyboardEvent } from 'react'
import { Input } from '@/ui/input'

// The link form: the URL, and for a link that exists already its text, typed
// in place; Enter writes the link through BlockNote's link toolbar extension
// (editLink), which also hands the focus back to the editor. Notion's: plain
// inputs on the popover, no buttons. The Formatting toolbar's link button
// opens it with the URL alone, the Link toolbar's Edit with both. A form is
// for one link: callers key it by the link, so a new link starts a new draft.

/** A URL with no known protocol is taken as https, as BlockNote's own form does. */
function linkHref(url: string): string {
  return VALID_LINK_PROTOCOLS.some((protocol) => url.startsWith(protocol))
    ? url
    : `${DEFAULT_LINK_PROTOCOL}://${url}`
}

export function LinkForm({
  onDone,
  range,
  showTextField,
  text,
  url,
}: {
  /** The link is written: close what holds the form. */
  onDone: () => void
  range: { from: number; to: number }
  showTextField: boolean
  text: string
  url: string
}) {
  const dict = useDictionary()
  const { editLink } = useExtension(LinkToolbarExtension)
  const [draftUrl, setDraftUrl] = useState(url)
  const [draftText, setDraftText] = useState(text)

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    editLink(linkHref(draftUrl), draftText, range.from)
    onDone()
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Input
        aria-label={dict.link_toolbar.form.url_placeholder}
        autoFocus
        data-test="linkUrl"
        onChange={(event) => setDraftUrl(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder={dict.link_toolbar.form.url_placeholder}
        value={draftUrl}
      />
      {showTextField && (
        <Input
          aria-label={dict.link_toolbar.form.title_placeholder}
          data-test="linkText"
          onChange={(event) => setDraftText(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          placeholder={dict.link_toolbar.form.title_placeholder}
          value={draftText}
        />
      )}
    </div>
  )
}
