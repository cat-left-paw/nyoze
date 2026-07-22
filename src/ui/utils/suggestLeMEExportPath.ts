import { getParentPath, getPathBaseName, joinPath } from './path'

const UNTITLED_EXPORT_NAME = 'nyoze-leme-export.md'

/**
 * Suggested Save-dialog default path for LeME-compatible Markdown export.
 *
 * LeME export v1 は `.md` + HTML 併用出力を標準とするため、元の拡張子に関わらず
 * `<stem>-leme.md` を提案する。
 */
export function suggestLeMEExportPath(filePath: string | null): string {
  if (!filePath) return UNTITLED_EXPORT_NAME
  const base = getPathBaseName(filePath)
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  const parent = getParentPath(filePath)
  const filename = `${stem}-leme.md`
  return parent ? joinPath(parent, filename) : filename
}
