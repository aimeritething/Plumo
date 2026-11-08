import { Dialog, DialogContent, DialogTitle } from '@/ui/dialog'
import { translate, type AppLocale } from '@/lib/i18n'
import { useDialogReturnFocus } from '@/lib/use-dialog-return-focus'
import type { ImagePreviewTarget } from './image-preview-target'

type ImagePreviewProps = {
  image: ImagePreviewTarget | null
  locale?: AppLocale
  onClose: () => void
}

/** The picture alone over the overlay: the `bare` dialog, no panel around it. */
export function ImagePreview({ image, locale = 'en', onClose }: ImagePreviewProps) {
  const title = translate(locale, 'editor.imagePreview.title')
  const open = image !== null
  // Closing hands focus back to the editor the picture was double-clicked in (AIM-457).
  const returnFocus = useDialogReturnFocus()

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}>
      <DialogContent variant="bare" data-testid="image-preview" className="max-h-[90vh] max-w-[90vw]" {...returnFocus}>
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {image && (
          <img
            data-testid="image-preview-image"
            src={image.src}
            alt={image.alt || title}
            className="max-h-[90vh] max-w-[90vw] rounded-md object-contain shadow-lg"
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
