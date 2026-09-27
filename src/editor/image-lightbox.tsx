import { Dialog, DialogContent, DialogTitle } from '@/ui/dialog'
import { translate, type AppLocale } from '@/lib/i18n'
import { useDialogReturnFocus } from '@/lib/use-dialog-return-focus'
import type { ImageLightboxTarget } from './image-lightbox-target'

type ImageLightboxProps = {
  image: ImageLightboxTarget | null
  locale?: AppLocale
  onClose: () => void
}

/** The picture alone over the overlay: the `bare` dialog, no panel around it. */
export function ImageLightbox({ image, locale = 'en', onClose }: ImageLightboxProps) {
  const title = translate(locale, 'editor.imageLightbox.title')
  const open = image !== null
  // Closing hands focus back to the editor the picture was double-clicked in (AIM-457).
  const returnFocus = useDialogReturnFocus()

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}>
      <DialogContent variant="bare" aria-describedby={undefined} data-testid="image-lightbox" className="max-h-[90vh] max-w-[90vw]" {...returnFocus}>
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {image && (
          <img
            data-testid="image-lightbox-image"
            src={image.src}
            alt={image.alt || title}
            className="max-h-[90vh] max-w-[90vw] rounded-md object-contain shadow-dialog"
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
