import { ArrowSquareOut, WarningCircle } from '@phosphor-icons/react'
import { Button } from '@/ui/button'

/**
 * The kernel's file preview, trimmed to the image branch: the fitted
 * picture and the fallback shown when it will not render. Plumo's `ImageView`
 * is what mounts them and owns the centring and the padding; the header and
 * its actions are gone, the tab bar carrying the hand-off buttons instead,
 * and so are the pdf, audio and video branches.
 */

export interface FilePreviewImageProps {
  src: string
  alt: string
  onLoad: (event: React.SyntheticEvent<HTMLImageElement>) => void
  onError: () => void
}

/** Scaled down to fit its box and never up: no width of its own, only a ceiling. */
export function FilePreviewImage({ src, alt, onLoad, onError }: FilePreviewImageProps) {
  return (
    <img
      src={src}
      alt={alt}
      className="max-h-full max-w-full object-contain"
      data-testid="image-file-preview"
      onLoad={onLoad}
      onError={onError}
    />
  )
}

export interface FilePreviewFallbackProps {
  title: string
  description: string
  onOpenExternal: () => void
}

export function FilePreviewFallback({ title, description, onOpenExternal }: FilePreviewFallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-8 text-center" data-testid="file-preview-fallback">
      <WarningCircle size={34} className="text-muted-foreground" aria-hidden="true" />
      <div className="space-y-1">
        <h2 className="m-0 text-[15px] font-semibold text-foreground">{title}</h2>
        <p className="m-0 max-w-md text-[13px] leading-6 text-muted-foreground">{description}</p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onOpenExternal}>
        <ArrowSquareOut size={15} />
        Open in default app
      </Button>
    </div>
  )
}
