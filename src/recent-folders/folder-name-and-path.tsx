import { folderName, tildePath } from './recent-folders'

/**
 * A Recent Folder as two lines: its name, and under it its path, quieter, so
 * two Folders with one name are told apart. Both ellipsise.
 */
export function FolderNameAndPath({ path, home }: { path: string; home: string | null }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-px text-left">
      <span className="truncate text-sm leading-4">{folderName(path)}</span>
      <span className="truncate text-2xs leading-3.5 font-normal text-text-muted">{tildePath(path, home)}</span>
    </span>
  )
}
