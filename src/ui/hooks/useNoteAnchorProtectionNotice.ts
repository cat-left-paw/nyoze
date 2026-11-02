import { useEffect } from 'react'
import type { EditorCoreHandle } from '../../editor-core/types'
import type { UiLanguageMode } from '../../settings/types'
import { createUiTextGetter } from '../i18n/uiText'

/**
 * STICKY-NOTE-LIFECYCLE1: 付箋のマーカーを含む範囲の削除・切り取りの拒否を、既存の
 * inline hint で知らせる。同じ文が表示中なら出し直さない（キーの連打で何度も出さない）。
 */
export function useNoteAnchorProtectionNotice(options: {
  coreRef: { current: EditorCoreHandle | null }
  coreReady: boolean
  uiLanguageMode: UiLanguageMode
  showEditorInlineHint: (message: string, durationMs?: number, options?: { coalesce?: boolean }) => void
  /** REVIEWFIX2 R3: Paragraph Plain の確定で anchor が消えた id（文字の編集で外れた付箋の記録）。 */
  onNoteAnchorsDetachedByEdit: (ids: readonly string[]) => void
}): void {
  const { coreRef, coreReady, uiLanguageMode, showEditorInlineHint, onNoteAnchorsDetachedByEdit } = options
  useEffect(() => {
    const core = coreRef.current
    if (!core) return
    const t = createUiTextGetter(uiLanguageMode)
    core.setNoteAnchorProtectionNoticeHandler(() => {
      showEditorInlineHint(t('editor.noteAnchor.protectedRangeHint'), 2600, { coalesce: true })
    }, onNoteAnchorsDetachedByEdit)
    return () => core.setNoteAnchorProtectionNoticeHandler(null, null)
  }, [coreReady, coreRef, onNoteAnchorsDetachedByEdit, showEditorInlineHint, uiLanguageMode])
}
