import { useEffect } from 'react'
import type { EditorCoreHandle } from '../../editor-core/types'
import type { UiLanguageMode } from '../../settings/types'
import { createUiTextGetter } from '../i18n/uiText'
import { resolveInputRestrictionNoticeKey } from './inputRestrictionNoticeKey'

/**
 * STICKY-NOTE-LIFECYCLE1: 付箋のマーカーを含む範囲の削除・切り取りの拒否を、既存の
 * inline hint で知らせる。同じ文が表示中なら出し直さない（キーの連打で何度も出さない）。
 * EDITOR-INPUT-RULE-INLINE-NODE1: 書式の入力規則が変換しなかった理由も、同じ形で知らせる。
 * PIS-INPUT-BLOCK-WARN1: 長文編集モードで、確定先の位置だけで入力が拒否されると打つ前に分かった場面
 * （縦中横の中・付箋のマーカーを含む範囲・段落を置けないblockのatomの直後）の警告も、同じ形で知らせる。
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
    // EDITOR-INPUT-RULE-INLINE-NODE1: code の入力規則が、中身の inline node（ルビ・付箋など）で変換しなかった理由。
    core.setInlineMarkInputRuleNoticeHandler(() => {
      showEditorInlineHint(t('editor.inlineMarkInputRule.codeInlineNodeHint'), 2600, { coalesce: true })
    })
    core.setInputRestrictionNoticeHandler((notice) => {
      const key = resolveInputRestrictionNoticeKey(notice)
      if (key) showEditorInlineHint(t(key), 2600, { coalesce: true })
    })
    return () => {
      core.setNoteAnchorProtectionNoticeHandler(null, null)
      core.setInlineMarkInputRuleNoticeHandler(null)
      core.setInputRestrictionNoticeHandler(null)
    }
  }, [coreReady, coreRef, onNoteAnchorsDetachedByEdit, showEditorInlineHint, uiLanguageMode])
}
