/**
 * Plumo ships one locale. This module keeps the kernel's i18n module path and
 * export names so every call site (and the kernel's tests) resolve unchanged,
 * but the catalog is a single flat English map instead of 22 JSON locales.
 */

export const DEFAULT_APP_LOCALE = 'en'

export const APP_LOCALES = ['en'] as const

export type AppLocale = typeof APP_LOCALES[number]
export type TranslationValues = Record<string, string | number>

export const EN_TRANSLATIONS = {
  "editor.blockType.bulletList": "Bullet List",
  "editor.blockType.checklist": "Checklist",
  "editor.blockType.codeBlock": "Code Block",
  "editor.blockType.heading1": "Heading 1",
  "editor.blockType.heading2": "Heading 2",
  "editor.blockType.heading3": "Heading 3",
  "editor.blockType.heading4": "Heading 4",
  "editor.blockType.heading5": "Heading 5",
  "editor.blockType.heading6": "Heading 6",
  "editor.blockType.numberedList": "Numbered List",
  "editor.blockType.paragraph": "Paragraph",
  "editor.blockType.quote": "Quote",
  "editor.callout.defaultHeading": "Note",
  "editor.codeBlock.copy": "Copy code to clipboard",
  "editor.empty.selectNote": "Select a note to start editing",
  "editor.empty.shortcuts": "{quickOpen} to search · {newNote} to create",
  "editor.find.close": "Close find",
  "editor.find.findLabel": "Find",
  "editor.find.findPlaceholder": "Find",
  "editor.find.hideReplace": "Hide replace",
  "editor.find.invalidRegex": "Invalid regex",
  "editor.find.matchCase": "Match case",
  "editor.find.matchCount": "{current} / {total}",
  "editor.find.nextMatch": "Next match",
  "editor.find.noMatches": "No matches",
  "editor.find.previousMatch": "Previous match",
  "editor.find.regex": "Use regular expression",
  "editor.find.regexMustMatchText": "Regex must match text",
  "editor.find.replace": "Replace",
  "editor.find.replaceAll": "All",
  "editor.find.replaceLabel": "Replace",
  "editor.find.replacePlaceholder": "Replace",
  "editor.find.showReplace": "Show replace",
  "editor.formatting.highlight": "Highlight",
  "editor.formatting.highlightBlue": "Blue",
  "editor.formatting.highlightChangeColor": "Change highlight color",
  "editor.formatting.highlightColor": "Choose highlight color",
  "editor.formatting.highlightGreen": "Green",
  "editor.formatting.highlightPurple": "Purple",
  "editor.formatting.highlightRed": "Red",
  "editor.formatting.highlightYellow": "Yellow",
  "editor.htmlBlock.blockedFallback": "This HTML was blocked by the sandbox rules.",
  "editor.htmlBlock.copySource": "Copy source",
  "editor.htmlBlock.openRawEditor": "Open raw editor",
  "editor.htmlBlock.previewTitle": "Sandboxed HTML block preview",
  "editor.htmlBlock.resetHeight": "Reset height",
  "editor.htmlBlock.resizeHeight": "Resize height",
  "editor.htmlBlock.toolbar": "HTML block actions",
  "editor.imageLightbox.title": "Image preview",
  "editor.sideMenu.collapseItem": "Collapse item",
  "editor.sideMenu.collapseSection": "Collapse section",
  "editor.sideMenu.expandItem": "Expand item",
  "editor.sideMenu.expandSection": "Expand section",
  "editor.sideMenu.turnIntoMenu": "Turn into…",
  "editor.slash.callout": "Callout",
  "editor.slash.callout.abstract": "Abstract",
  "editor.slash.callout.bug": "Bug",
  "editor.slash.callout.danger": "Danger",
  "editor.slash.callout.example": "Example",
  "editor.slash.callout.failure": "Failure",
  "editor.slash.callout.info": "Info",
  "editor.slash.callout.note": "Note",
  "editor.slash.callout.question": "Question",
  "editor.slash.callout.quote": "Quote",
  "editor.slash.callout.success": "Success",
  "editor.slash.callout.tip": "Tip",
  "editor.slash.callout.todo": "Todo",
  "editor.slash.callout.warning": "Warning",
  "editor.slash.date": "Date",
  "editor.slash.datetime": "Date and time",
  "editor.slash.htmlBlock": "HTML block",
  "editor.slash.math": "Math",
  "editor.slash.time": "Time",
  "editor.toolbar.rawOpen": "Open the raw editor",
  "editor.whiteboard.enterFullscreen": "Expand whiteboard",
  "editor.whiteboard.exitFullscreen": "Exit fullscreen whiteboard",
  "editor.whiteboard.permissionDeniedBody": "Plumo could not use a desktop capability that this whiteboard needs. Allow the permission in your system settings, then reopen the Document.",
  "editor.whiteboard.permissionDeniedTitle": "Whiteboard permission blocked",
  "fileActions.copied.filePath": "File path copied",
  "fileActions.copied.folderPath": "Folder path copied",
  "fileActions.error.copyFolderPath": "Failed to copy folder path: {detail}",
  "fileActions.error.copyPath": "Failed to copy path: {detail}",
  "fileActions.error.openFile": "Failed to open file: {detail}",
  "fileActions.error.pathMissing": "Path does not exist: {path}",
  "fileActions.error.revealPath": "Failed to reveal path: {detail}",
  "save.error.failed": "Save failed: {error}",
  "save.error.invalidPath": "Save failed: The note path is invalid on this platform. Rename the note or move it to a valid folder, then try again.",
  "save.toast.missingActiveVault": "Select or restore a vault before saving.",
  "save.toast.nothingToSave": "Nothing to save",
  "save.toast.saved": "Saved",
  "sidebar.action.copyFolderPathMenu": "Copy folder path",
  "sidebar.action.createFolder": "Create folder",
  "sidebar.action.createFolderInFolderMenu": "Create a new folder in this folder",
  "sidebar.action.createNoteInFolderMenu": "Create a new note in this folder",
  "sidebar.action.deleteFolderMenu": "Delete folder...",
  "sidebar.action.renameFolderMenu": "Rename folder...",
  "sidebar.action.revealFolderMenu": "Reveal in Finder",
  "sidebar.folder.name": "Folder name",
  "sidebar.folder.newName": "New folder name",
  "sidebar.group.folders": "FOLDERS",
  "status.vault.default": "Vault",
} as const

export type TranslationCatalog = typeof EN_TRANSLATIONS
export type TranslationKey = keyof TranslationCatalog

export function interpolate(template: string, values: TranslationValues = {}): string {
  const interpolationValues = new Map(Object.entries(values))
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = interpolationValues.get(key)
    return value === undefined ? match : String(value)
  })
}

export function translate(_locale: AppLocale, key: TranslationKey, values?: TranslationValues): string {
  return interpolate(Reflect.get(EN_TRANSLATIONS, key) as string, values)
}

export function createTranslator(locale: AppLocale = DEFAULT_APP_LOCALE) {
  return (key: TranslationKey, values?: TranslationValues) => translate(locale, key, values)
}

export function resolveEffectiveLocale(
  preference?: unknown,
  languagePreferences?: readonly string[],
): AppLocale {
  void preference
  void languagePreferences
  return DEFAULT_APP_LOCALE
}
