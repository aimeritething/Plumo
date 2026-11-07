import { createReactBlockSpec } from '@blocknote/react'
import { lazy, Suspense } from 'react'
import { TLDRAW_BLOCK_TYPE, TLDRAW_DEFAULT_HEIGHT } from '@/kernel/markdown/tldraw-markdown'
import { updateTldrawBlockPropsSafely } from './tldraw-block-props'

// The whiteboard is its own chunk: tldraw arrives only once a Document holds a
// board. The spec cannot share the lazy module's file, so it lives here.
const TldrawWhiteboard = lazy(() => import('./tldraw-whiteboard').then(module => ({
  default: module.TldrawWhiteboard,
})))

export const TLDRAW_BLOCK_CONFIG = {
  type: TLDRAW_BLOCK_TYPE,
  propSchema: {
    boardId: { default: '' },
    height: { default: TLDRAW_DEFAULT_HEIGHT },
    snapshot: { default: '{}' },
    width: { default: '' },
  },
  content: 'none',
} as const

// The board's frame at the default height while the chunk loads.
function TldrawBlockFallback() {
  return <div className="h-130 w-full overflow-hidden rounded-lg border-hairline border-border bg-background" />
}

export const TldrawBlockSpec = createReactBlockSpec(
  TLDRAW_BLOCK_CONFIG,
  {
    runsBefore: ['codeBlock'],
    meta: { selectable: false },
    render: (props) => (
      <Suspense fallback={<TldrawBlockFallback />}>
        <TldrawWhiteboard
          boardId={props.block.props.boardId}
          height={props.block.props.height}
          snapshot={props.block.props.snapshot}
          width={props.block.props.width}
          onSnapshotChange={(snapshot) => {
            updateTldrawBlockPropsSafely({
              blockId: props.block.id,
              editor: props.editor,
              nextProps: (currentProps) => ({
                ...currentProps,
                snapshot,
              }),
            })
          }}
          onSizeChange={(size) => {
            updateTldrawBlockPropsSafely({
              blockId: props.block.id,
              editor: props.editor,
              nextProps: (currentProps) => ({
                ...currentProps,
                height: size.height,
                width: size.width,
              }),
            })
          }}
        />
      </Suspense>
    ),
  },
)
