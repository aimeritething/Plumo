import { createReactBlockSpec, type ReactCustomBlockRenderProps } from '@blocknote/react'
import { cva } from 'class-variance-authority'
import type { IconProps } from '@phosphor-icons/react'
import { createElement } from 'react'
import { useAppLocale } from '@/lib/use-app-preferences'
import { translate } from '@/lib/i18n'
import {
  CALLOUT_BLOCK_TYPE,
  calloutHeading,
} from '@/kernel/markdown/callout-markdown'
import { resolveCalloutDefinition } from './callout-catalog'
import { calloutIconForType } from './callout-icons'

export const CALLOUT_BLOCK_CONFIG = {
  type: CALLOUT_BLOCK_TYPE,
  propSchema: {
    calloutType: { default: 'note' },
    title: { default: '' },
  },
  content: 'inline',
} as const

type CalloutBlockViewProps = ReactCustomBlockRenderProps<
  typeof CALLOUT_BLOCK_TYPE,
  typeof CALLOUT_BLOCK_CONFIG.propSchema,
  'inline'
>

// Linear-style: the family's chromatic role at 2% for the ground and 20% for
// a hairline border; the heading takes the role's text colour, the body the
// body colour. The family is the callout catalog's visual axis.
const calloutVariants = cva(
  'my-2 overflow-hidden rounded-md border-hairline',
  {
    variants: {
      family: {
        note: 'border-teal/20 bg-teal/2 text-teal-text',
        success: 'border-green/20 bg-green/2 text-green-text',
        warning: 'border-orange/20 bg-orange/2 text-orange-text',
        error: 'border-red/20 bg-red/2 text-red-text',
        example: 'border-purple/20 bg-purple/2 text-purple-text',
        quote: 'border-muted-foreground/20 bg-muted-foreground/2 text-muted-foreground',
      },
    },
  },
)

function CalloutHeading({
  calloutType,
  heading,
}: {
  calloutType: string
  heading: string
}) {
  // A callout's filled glyph is its own design, so it keeps out of the app's icon outline.
  const icon = createElement(calloutIconForType(calloutType), {
    'aria-hidden': true,
    className: 'size-3.5',
    weight: 'fill',
    'data-icon-stroke': undefined,
  } as IconProps)
  return <>{icon}<span>{heading}</span></>
}

function CalloutBlockView({ block, contentRef }: CalloutBlockViewProps) {
  const locale = useAppLocale()
  const { calloutType, title } = block.props
  const family = resolveCalloutDefinition({ type: calloutType }).family
  const heading = calloutHeading(calloutType, title, translate(locale, 'editor.callout.defaultHeading'))

  return (
    <aside
      className={calloutVariants({ family })}
      data-callout-type={calloutType}
    >
      <div className="flex min-h-7 items-center gap-2 px-2.5 pt-2 pb-0.5 font-semibold">
        <CalloutHeading
          calloutType={calloutType}
          heading={heading}
        />
      </div>
      <div ref={contentRef} className="px-2.5 pt-0.5 pb-2 text-document-foreground" />
    </aside>
  )
}

export const CalloutBlockSpec = createReactBlockSpec(
  CALLOUT_BLOCK_CONFIG,
  { render: CalloutBlockView },
)
