import { useMemo } from 'react'
import { Button } from '@/ui/button'
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/ui/popover'
import { ScrollArea } from '@/ui/scroll-area'
import { parseReleaseNotes } from './release-notes'
import type { UpdateInfo } from './update-commands'

interface UpdateButtonProps {
  /** The Update that is ready; the button is drawn only while there is one. */
  update: UpdateInfo | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onRestart: () => void
  restarting: boolean
}

/**
 * The Update button: laid over the window's top-left corner to the right of
 * the sidebar icon (shell/sidebar-toggle), which ends at x 108; the button
 * starts 6px on, at x 114, and is the icon's 24px tall so the two share a
 * centre line with the traffic lights. Like the icon it is one element in
 * both sidebar states. It is drawn only once an Update has been downloaded.
 * Clicking it opens a popover with the version and its notes; Restart and
 * Update there is what installs.
 */
export function UpdateButton({ update, open, onOpenChange, onRestart, restarting }: UpdateButtonProps) {
  const groups = useMemo(() => parseReleaseNotes(update?.notes ?? ''), [update?.notes])
  if (!update) return null

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={(
          <Button
            size="xs"
            className="absolute top-3.5 left-28.5 z-raised rounded-full px-2.5"
            data-testid="update-button"
          >
            Update
          </Button>
        )}
      />
      <PopoverContent align="start" sideOffset={8} className="flex w-80 flex-col gap-3" data-testid="update-popover">
        <PopoverHeader>
          <PopoverTitle>Plumo {update.version} is ready</PopoverTitle>
        </PopoverHeader>
        {groups.length > 0 && (
          <ScrollArea className="-mx-4 max-h-64" viewportClassName="px-4">
            <div className="flex flex-col gap-3 text-[13px] leading-normal" data-testid="update-notes">
              {groups.map((group, index) => (
                <section key={`${group.heading ?? ''}:${index}`}>
                  {group.heading && <h3 className="mb-1 text-xs font-medium text-muted-foreground">{group.heading}</h3>}
                  <ul className="flex list-disc flex-col gap-1 pl-4 text-foreground marker:text-subtle-foreground">
                    {group.items.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </section>
              ))}
            </div>
          </ScrollArea>
        )}
        <Button className="self-end" onClick={onRestart} disabled={restarting}>
          Restart and Update
        </Button>
      </PopoverContent>
    </Popover>
  )
}
