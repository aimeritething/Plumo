import { createReactBlockSpec } from '@blocknote/react'
import { ArrowsOut as Maximize2, PencilSimpleLine } from '@phosphor-icons/react'
import { useEffect, useId, useMemo, useState, type SyntheticEvent } from 'react'
import { MERMAID_BLOCK_TYPE, mermaidFenceSource } from '@/kernel/markdown/mermaid-markdown'
import { Button } from '@/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'
import { FloatingIconGroup } from './floating-icon-group'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/ui/dialog'
import { APP_COMMAND_EVENT_NAME, APP_COMMAND_IDS } from '@/shell/app-command-dispatcher'
import { translate } from '@/lib/i18n'
import { trackEvent } from '@/lib/telemetry'
import { readFencedPreElement } from './fenced-pre-element'
import { SafeSvgDiv } from './safe-markup'

export const MERMAID_BLOCK_CONFIG = {
  type: MERMAID_BLOCK_TYPE,
  propSchema: {
    source: { default: '' },
    diagram: { default: '' },
  },
  content: 'none',
} as const

type MermaidApi = typeof import('mermaid')['default']

interface MermaidDiagramProps {
  diagram: string
  source: string
}

interface MermaidSvgViewportProps {
  ariaLabel: string
  className: string
  svg: string
  testId: string
}

interface RenderState {
  diagram: string
  svg: string
  error: boolean
}

let initialized = false
let renderQueue = Promise.resolve()

const TIMELINE_HEADER_PATTERN = /^\s*timeline(?:\s+(?:LR|TD))?\b/iu
const TIMELINE_PERIOD_DELIMITER_PATTERN = /^(\s*)(.*?)(:\s+.*)$/u
const TIMELINE_NON_PERIOD_LINE_PATTERN = /^\s*(?:$|%%|#|title\b|section\b|accTitle\s*:|accDescr\s*:|accDescr\s*\{|\})/iu

const MERMAID_RENDER_HOST_STYLE = [
  'position:absolute',
  'left:-10000px',
  'top:-10000px',
  'width:960px',
  'min-height:1px',
  'overflow:hidden',
].join(';')
const OPEN_RAW_EDITOR_LABEL = translate('en', 'editor.toolbar.rawOpen')

// The floating buttons' card shows under the pointer or keyboard focus, and
// always on a device with no pointer to hover with.
const FLOATING_GROUP_CLASS = 'absolute top-2 right-2 z-raised opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100'
// The rendered SVG at its own size, centred; the box scrolls when it is wider.
const SVG_CLASS = '[&_svg]:block [&_svg]:h-auto [&_svg]:max-w-none [&_svg]:min-w-min'

function renderIdFromReactId(reactId: string): string {
  const safeId = reactId.replace(/[^a-zA-Z0-9_-]/g, '')
  return `plumo-mermaid-${safeId || 'diagram'}`
}

function initializeMermaid(mermaid: MermaidApi) {
  if (initialized) return

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    htmlLabels: false,
    theme: 'default',
    suppressErrorRendering: true,
    themeVariables: {
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    },
  })
  initialized = true
}

function isTimelineDiagram(diagram: string): boolean {
  const firstStatement = diagram
    .split(/\r?\n/u)
    .map(line => line.trim())
    .find(line => line.length > 0 && !line.startsWith('%%'))

  return typeof firstStatement === 'string' && TIMELINE_HEADER_PATTERN.test(firstStatement)
}

function encodeTimelinePeriodLabelColons(line: string): string {
  if (TIMELINE_NON_PERIOD_LINE_PATTERN.test(line)) return line

  const match = TIMELINE_PERIOD_DELIMITER_PATTERN.exec(line)
  if (!match) return line

  const [, indent, periodLabel, rest] = match
  if (!periodLabel.trim().includes(':')) return line

  // Mermaid timeline uses ":" as a field separator, so clock labels need entity colons for rendering.
  return `${indent}${periodLabel.replaceAll(':', '&#58;')}${rest}`
}

function normalizeTimelinePeriodLabelsForRender(diagram: string): string {
  if (!isTimelineDiagram(diagram)) return diagram

  return diagram.split('\n').map(encodeTimelinePeriodLabelColons).join('\n')
}

function appendMermaidRenderHost(): HTMLDivElement {
  const host = document.createElement('div')
  host.setAttribute('data-plumo-mermaid-render-host', '')
  host.style.cssText = MERMAID_RENDER_HOST_STYLE
  document.body.appendChild(host)
  return host
}

function removeMermaidRenderArtifacts(renderId: string, host: HTMLElement): void {
  host.remove()
  document.getElementById(renderId)?.remove()
  document.getElementById(`d${renderId}`)?.remove()
  document.getElementById(`i${renderId}`)?.remove()
}

function hasSvgParseError(document: Document): boolean {
  return document.getElementsByTagName('parsererror').length > 0
}

function centerMermaidNodeLabels(svg: string): string {
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml')
  if (hasSvgParseError(parsed)) return svg

  parsed.querySelectorAll('.node .label text, .node text').forEach((label) => {
    label.setAttribute('text-anchor', 'middle')
    label.querySelectorAll('tspan').forEach((row) => {
      row.setAttribute('text-anchor', 'middle')
    })
  })

  return new XMLSerializer().serializeToString(parsed.documentElement)
}

async function renderMermaidDiagram({
  diagram,
  renderId,
}: {
  diagram: string
  renderId: string
}): Promise<string> {
  const render = async () => {
    const mermaid = (await import('mermaid')).default
    initializeMermaid(mermaid)
    const renderHost = appendMermaidRenderHost()
    try {
      const result = await mermaid.render(renderId, normalizeTimelinePeriodLabelsForRender(diagram), renderHost)
      return centerMermaidNodeLabels(result.svg)
    } finally {
      removeMermaidRenderArtifacts(renderId, renderHost)
    }
  }
  const nextRender = renderQueue.then(render, render)
  renderQueue = nextRender.then(() => undefined, () => undefined)
  return nextRender
}

function MermaidSvgViewport({ ariaLabel, className, svg, testId }: MermaidSvgViewportProps) {
  return (
    <SafeSvgDiv
      aria-label={ariaLabel}
      className={className}
      contentEditable={false}
      data-testid={testId}
      draggable={false}
      onClick={stopMermaidViewportEvent}
      onDoubleClick={stopMermaidViewportEvent}
      onMouseDown={stopMermaidViewportEvent}
      onMouseUp={stopMermaidViewportEvent}
      onPointerDown={stopMermaidViewportEvent}
      onPointerUp={stopMermaidViewportEvent}
      role="img"
      svg={svg}
      suppressContentEditableWarning
      tabIndex={0}
    />
  )
}

function stopMermaidViewportEvent(event: SyntheticEvent): void {
  event.stopPropagation()
}

function openRawEditorForMermaidSource(event: SyntheticEvent): void {
  event.preventDefault()
  event.stopPropagation()
  trackEvent('editor_mermaid_raw_edit_requested')
  window.dispatchEvent(new CustomEvent(APP_COMMAND_EVENT_NAME, {
    detail: APP_COMMAND_IDS.editToggleRawEditor,
  }))
}

function MermaidRawEditorButton() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={OPEN_RAW_EDITOR_LABEL}
          onClick={openRawEditorForMermaidSource}
          onMouseDown={stopMermaidViewportEvent}
          size="icon-xs"
          type="button"
          variant="icon"
        >
          <PencilSimpleLine aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{OPEN_RAW_EDITOR_LABEL}</TooltipContent>
    </Tooltip>
  )
}

function MermaidLightbox({ svg }: { svg: string }) {
  return (
    <Dialog>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              aria-label="Open Mermaid diagram"
              size="icon-xs"
              type="button"
              variant="icon"
            >
              <Maximize2 aria-hidden="true" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Open diagram</TooltipContent>
      </Tooltip>
      <DialogContent variant="bare" showCloseButton>
        <DialogTitle className="sr-only">Mermaid diagram</DialogTitle>
        <DialogDescription className="sr-only">
          Expanded view of the rendered Mermaid diagram.
        </DialogDescription>
        <MermaidSvgViewport
          ariaLabel="Expanded Mermaid diagram"
          className={`${SVG_CLASS} h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] overflow-auto rounded-xl bg-surface-card p-6 text-text-primary focus-visible:focus-ring [&_svg]:m-auto`}
          svg={svg}
          testId="mermaid-diagram-dialog-viewport"
        />
      </DialogContent>
    </Dialog>
  )
}

function MermaidSourceFallback({ source }: { source: string }) {
  return (
    <pre
      className="m-0 max-w-full overflow-auto rounded-md bg-inline-code-bg p-2.5 text-xs leading-normal text-inherit"
      role="img"
      aria-label="Mermaid source"
    >
      <code>{source}</code>
    </pre>
  )
}

const FIGURE_CLASS = 'group relative my-2.5 w-full text-text-primary'

export function MermaidDiagram({ diagram, source }: MermaidDiagramProps) {
  const reactId = useId()
  const renderId = useMemo(() => renderIdFromReactId(reactId), [reactId])
  const [state, setState] = useState<RenderState>({ diagram: '', svg: '', error: false })

  useEffect(() => {
    let active = true
    if (!diagram.trim()) return () => { active = false }

    renderMermaidDiagram({ diagram, renderId })
      .then((svg) => {
        if (active) setState({ diagram, svg, error: false })
      })
      .catch(() => {
        if (active) setState({ diagram, svg: '', error: true })
      })

    return () => { active = false }
  }, [diagram, renderId])

  const currentState = state.diagram === diagram ? state : { diagram, svg: '', error: false }
  if (!diagram.trim() || currentState.error) {
    return (
      <figure
        className={`${FIGURE_CLASS} rounded-lg border-hairline border-chroma-red bg-chroma-red/8 p-3`}
        data-testid="mermaid-diagram-error"
      >
        <FloatingIconGroup className={FLOATING_GROUP_CLASS} contentEditable={false}>
          <MermaidRawEditorButton />
        </FloatingIconGroup>
        <figcaption className="mb-2 text-xs leading-normal font-semibold text-chroma-red">Mermaid diagram unavailable</figcaption>
        <MermaidSourceFallback source={source} />
      </figure>
    )
  }

  return (
    <figure className={FIGURE_CLASS} data-testid="mermaid-diagram">
      <FloatingIconGroup className={FLOATING_GROUP_CLASS} contentEditable={false}>
        <MermaidRawEditorButton />
        <MermaidLightbox svg={currentState.svg} />
      </FloatingIconGroup>
      <MermaidSvgViewport
        ariaLabel="Mermaid diagram"
        className={`${SVG_CLASS} max-w-full overflow-auto rounded-lg border-hairline border-border-default bg-surface-card p-3.5 focus-visible:focus-ring [&_svg]:mx-auto`}
        svg={currentState.svg}
        testId="mermaid-diagram-viewport"
      />
    </figure>
  )
}

function readMermaidPreElement(element: HTMLElement): { source: string; diagram: string } | undefined {
  const diagram = readFencedPreElement(element, 'mermaid')
  if (diagram === undefined) return undefined

  return {
    diagram,
    source: mermaidFenceSource({ diagram }),
  }
}

export const MermaidBlockSpec = createReactBlockSpec(
  MERMAID_BLOCK_CONFIG,
  {
    runsBefore: ['codeBlock'],
    parse: readMermaidPreElement,
    render: (props) => (
      <MermaidDiagram
        diagram={props.block.props.diagram}
        source={props.block.props.source}
      />
    ),
  },
)
