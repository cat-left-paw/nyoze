import { getParentPath, getPathBaseName, joinPath } from './path'

const UNTITLED_WEB_BOOK_EXPORT_NAME = 'nyoze-web-book.html'

/** Suggested Save-dialog default path for the Web Book reader HTML. */
export function suggestWebBookExportPath(filePath: string | null): string {
  if (!filePath) return UNTITLED_WEB_BOOK_EXPORT_NAME
  const base = getPathBaseName(filePath)
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  const parent = getParentPath(filePath)
  const filename = `${stem}-web-book.html`
  return parent ? joinPath(parent, filename) : filename
}
