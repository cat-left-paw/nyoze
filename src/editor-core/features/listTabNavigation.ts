import { sinkListItem, liftListItem } from '@tiptap/pm/schema-list'
import type { EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

type HandleListTabKeyOptions = {
  getIsComposing: () => boolean
}

/**
 * カーソルがリスト項目（listItem）内にいるかどうかを判定する pure helper。
 * bulletList / orderedList の直接・間接子であれば true を返す。
 */
export function isInListContext(state: EditorState): boolean {
  const { $from } = state.selection
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'listItem') return true
  }
  return false
}

/**
 * 通常エディタのリスト文脈での Tab / Shift+Tab キー処理。
 *
 * - IME 入力中はすべて pass-through（false を返す）
 * - Modifier キー（Mod / Alt）付きの Tab はスキップ
 * - リスト文脈での Tab   → sinkListItem（ネスト深くする）試行
 * - リスト文脈での Shift+Tab → liftListItem（ネスト浅くする）試行
 * - 成否に関わらずリスト文脈では event.preventDefault() してフォーカス流出を防ぐ
 * - リスト文脈外では false を返し、通常の Tab 動作に委ねる
 *
 * @returns true if the event was handled (caller should return true from handleKeyDown)
 */
export function handleListTabKey(
  view: EditorView,
  event: KeyboardEvent,
  options: HandleListTabKeyOptions,
): boolean {
  if (event.key !== 'Tab') return false
  if (options.getIsComposing() || event.isComposing) return false
  // Mod / Alt 付きの Tab はエディタショートカットや OS 機能に委ねる
  if (event.metaKey || event.ctrlKey || event.altKey) return false

  if (!isInListContext(view.state)) return false

  // リスト文脈であれば必ずフォーカス流出を防ぐ
  event.preventDefault()

  const listItemType = view.state.schema.nodes['listItem']
  if (!listItemType) return true

  if (event.shiftKey) {
    // Shift+Tab: アンネスト（liftListItem）
    liftListItem(listItemType)(view.state, view.dispatch)
  } else {
    // Tab: ネスト（sinkListItem）
    sinkListItem(listItemType)(view.state, view.dispatch)
  }

  return true
}
