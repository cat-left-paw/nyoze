/**
 * LOCAL-WINDOW-FOLD-HANDOFF1 — 右アウトライン fold の薄い UI 入口。
 *
 * 既存 document-action barrier と heading identity 再証明だけを行い、
 * 成功時に既存 `toggleHeadingFold` を 1 回呼ぶ。
 */

import { runLocalImeHeadingFoldHandoff } from '../../editor-core/features/localImeHeadingFoldHandoff'
import type { EditorCoreHandle } from '../../editor-core/types'

export function toggleHeadingFoldViaDocumentAction(
  core: EditorCoreHandle,
  pos: number,
): boolean {
  const { resolvedPos } = runLocalImeHeadingFoldHandoff(
    () => core.getEditorState().doc,
    pos,
    { hostImeComposing: core.isHostImeComposing() },
  )
  if (resolvedPos == null) return false
  core.toggleHeadingFold(resolvedPos)
  return true
}
