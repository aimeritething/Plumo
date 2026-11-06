import {
  type FilePanelProps,
  useBlockNoteEditor,
  useDictionary,
} from '@blocknote/react'
import * as BlockNoteReact from '@blocknote/react'
import { filenameFromURL, type DefaultBlockSchema, type DefaultInlineContentSchema, type DefaultStyleSchema } from '@blocknote/core'
import { UploadSimple } from '@phosphor-icons/react'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/tabs'

// Plumo's Upload / Embed panel. On a block that already shows a file, it
// replaces that file: only the URL changes, and the alt text, caption and
// width the block has are kept (AIM-531). On an empty block the file's name
// comes along, as in BlockNote's own panel.

interface UploadTabProps extends FilePanelProps {
  replacing: boolean
  setLoading: (loading: boolean) => void
}

type FilePanelEditor = ReturnType<typeof useBlockNoteEditor<
  DefaultBlockSchema,
  DefaultInlineContentSchema,
  DefaultStyleSchema
>>

interface UploadHandlerOptions extends UploadTabProps {
  editor: FilePanelEditor
  setUploadFailed: (failed: boolean) => void
}

/** The props a picked or embedded file sets: the URL alone when it replaces one. */
// eslint-disable-next-line react-refresh/only-export-components -- the rule is tested on its own
export function filePanelUpdate(url: string, name: string, replacing: boolean) {
  return { props: replacing ? { url } : { name, url } }
}

/**
 * Whether the editor should take the focus back once the panel's file is in:
 * the focus is still in the panel, or nowhere (the panel's button lost it to
 * the system file picker). Not when the user has gone on elsewhere meanwhile.
 */
function focusIsInPanel(): boolean {
  const active = document.activeElement
  return !active || active === document.body || active.closest('[data-file-panel]') !== null
}

/** Puts the file in and, as after a click on it, leaves the block selected in a focused editor. */
function applyFilePanelUpdate(editor: FilePanelEditor, blockId: string, update: Parameters<FilePanelEditor['updateBlock']>[1]) {
  const returnFocus = focusIsInPanel()
  editor.updateBlock(blockId, update)
  if (returnFocus) editor.focus()
}

function useUploadHandler({ blockId, editor, replacing, setLoading, setUploadFailed }: UploadHandlerOptions) {
  return useCallback((file: File | null) => {
    if (!file || !editor.uploadFile) return

    setLoading(true)
    void editor.uploadFile(file, blockId)
      .then((uploaded) => {
        if (!editor.getBlock(blockId)) return
        const update = typeof uploaded === 'string'
          ? filePanelUpdate(uploaded, file.name, replacing)
          : uploaded
        applyFilePanelUpdate(editor, blockId, update)
      })
      .catch(() => {
        if (editor.getBlock(blockId)) setUploadFailed(true)
      })
      .finally(() => setLoading(false))
  }, [blockId, editor, replacing, setLoading, setUploadFailed])
}

function useUploadFailureReset(uploadFailed: boolean, setUploadFailed: (failed: boolean) => void) {
  useEffect(() => {
    if (!uploadFailed) return undefined
    const timer = window.setTimeout(() => setUploadFailed(false), 3_000)
    return () => window.clearTimeout(timer)
  }, [setUploadFailed, uploadFailed])
}

function matchingEntryValue<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.entries(record).find(([candidateKey]) => candidateKey === key)?.[1]
}

function filePanelAccept(editor: FilePanelEditor, blockType: string): string {
  const blockSpec = matchingEntryValue(editor.schema.blockSpecs, blockType)
  const acceptTypes = blockSpec?.implementation.meta?.fileBlockAccept
  return acceptTypes?.length ? acceptTypes.join(',') : '*/*'
}

function filePanelPlaceholder(dictionary: ReturnType<typeof useDictionary>, blockType: string): string {
  const blockPlaceholder = matchingEntryValue(dictionary.file_panel.upload.file_placeholder, blockType)
  return blockPlaceholder
    ?? dictionary.file_panel.upload.file_placeholder.file
}

// One button opens the system's file picker; the file input itself is never
// shown, so the browser's "Choose File / No file chosen" does not appear.
function UploadTab({ blockId, loading, replacing, setLoading }: UploadTabProps & { loading: boolean }) {
  const dictionary = useDictionary()
  const editor = useBlockNoteEditor()
  const block = editor.getBlock(blockId)
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploadFailed, setUploadFailed] = useState(false)
  const handleFileChange = useUploadHandler({ blockId, editor, replacing, setLoading, setUploadFailed })
  useUploadFailureReset(uploadFailed, setUploadFailed)

  if (!block) return null

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid="file-panel-upload-input"
        accept={filePanelAccept(editor, block.type)}
        onChange={(event) => {
          handleFileChange(event.currentTarget.files?.[0] ?? null)
          event.currentTarget.value = ''
        }}
      />
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        disabled={loading}
        data-testid="file-panel-upload-button"
        onClick={() => inputRef.current?.click()}
      >
        <UploadSimple />
        {filePanelPlaceholder(dictionary, block.type)}
      </Button>
      {uploadFailed && <p className="text-xs text-feedback-error-text">{dictionary.file_panel.upload.upload_error}</p>}
    </div>
  )
}

function EmbedTab({ blockId, replacing }: FilePanelProps & { replacing: boolean }) {
  const dictionary = useDictionary()
  const editor = useBlockNoteEditor()
  const block = editor.getBlock(blockId)
  const [url, setUrl] = useState('')
  const link = url.trim()
  const embed = useCallback(() => {
    if (!link || !editor.getBlock(blockId)) return
    applyFilePanelUpdate(editor, blockId, filePanelUpdate(link, filenameFromURL(link), replacing))
  }, [blockId, editor, link, replacing])
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    embed()
  }, [embed])

  if (!block) return null

  const embedButtons: Record<string, string> = dictionary.file_panel.embed.embed_button
  return (
    <div className="flex flex-col gap-2">
      <Input
        autoFocus
        className="h-8 rounded-sm"
        data-testid="file-panel-embed-input"
        placeholder={dictionary.file_panel.embed.url_placeholder}
        value={url}
        onChange={(event) => setUrl(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
      />
      <Button size="sm" className="w-full" disabled={!link} data-testid="file-panel-embed-button" onClick={embed}>
        {matchingEntryValue(embedButtons, block.type) ?? embedButtons.file}
      </Button>
    </div>
  )
}

const UPLOAD_TAB = 'upload'
const EMBED_TAB = 'embed'

// The panel in Plumo's popover material: text tabs over one flat body, no
// card inside the card.
export function FilePanel({ blockId }: FilePanelProps) {
  const dictionary = useDictionary()
  const editor = useBlockNoteEditor()
  const block = editor.getBlock(blockId)
  // Whether the block showed a file when the panel opened, read once.
  const [replacing] = useState(() => {
    const url = (block?.props as { url?: unknown } | undefined)?.url
    return typeof url === 'string' && url.length > 0
  })
  const [loading, setLoading] = useState(false)
  const canUpload = Boolean(editor.uploadFile)
  const [openTab, setOpenTab] = useState(canUpload ? UPLOAD_TAB : EMBED_TAB)

  if (!block) return null

  return (
    <Tabs
      value={openTab}
      onValueChange={setOpenTab}
      data-file-panel
      data-testid="file-panel"
      className="w-[min(24rem,calc(100vw-2rem))] gap-0 rounded-xl border-hairline border-border-popover bg-surface-popover text-text-primary shadow-menu"
    >
      <TabsList variant="line" className="h-9 w-full justify-start gap-3 rounded-none border-b border-border-popover px-3">
        {canUpload && <TabsTrigger value={UPLOAD_TAB} className="flex-none px-0">{dictionary.file_panel.upload.title}</TabsTrigger>}
        <TabsTrigger value={EMBED_TAB} className="flex-none px-0">{dictionary.file_panel.embed.title}</TabsTrigger>
      </TabsList>
      {canUpload && (
        <TabsContent value={UPLOAD_TAB} className="p-3">
          <UploadTab blockId={blockId} loading={loading} replacing={replacing} setLoading={setLoading} />
        </TabsContent>
      )}
      <TabsContent value={EMBED_TAB} className="p-3">
        <EmbedTab blockId={blockId} replacing={replacing} />
      </TabsContent>
    </Tabs>
  )
}

export function FilePanelController() {
  if (!('FilePanelController' in BlockNoteReact)) return null
  return <BlockNoteReact.FilePanelController filePanel={FilePanel} />
}
