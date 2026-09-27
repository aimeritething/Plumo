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
        note: 'border-chroma-teal/20 bg-chroma-teal/2 text-chroma-teal-text',
        success: 'border-chroma-green/20 bg-chroma-green/2 text-chroma-green-text',
        warning: 'border-chroma-orange/20 bg-chroma-orange/2 text-chroma-orange-text',
        error: 'border-chroma-red/20 bg-chroma-red/2 text-chroma-red-text',
        example: 'border-chroma-purple/20 bg-chroma-purple/2 text-chroma-purple-text',
        quote: 'border-text-secondary/20 bg-text-secondary/2 text-text-secondary',
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
      <div ref={contentRef} className="px-2.5 pt-0.5 pb-2 text-text-primary" />
    </aside>
  )
}

export const CalloutBlockSpec = createReactBlockSpec(
  CALLOUT_BLOCK_CONFIG,
  { render: CalloutBlockView },
)
