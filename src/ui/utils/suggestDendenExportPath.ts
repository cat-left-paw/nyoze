import { getParentPath, getPathBaseName, joinPath } from './path'

const UNTITLED_EXPORT_NAME = 'nyoze-denden-export.md'

/** Suggested Save-dialog default path for Denden-compatible Markdown export. */
export function suggestDendenExportPath(filePath: string | null): string {
  if (!filePath) return UNTITLED_EXPORT_NAME
  const base = getPathBaseName(filePath)
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  const parent = getParentPath(filePath)
  const filename = `${stem}-denden.md`
  return parent ? joinPath(parent, filename) : filename
}
