/**
 * 局所 IME slot の navigation handoff 用 — PM selection → DOM selection 復元。
 *
 * P2-C1 Arrow / P2-C2 Home·End が共有する。復元後の DOM 位置が
 * `selection.from` と一致するまで確認し、不一致・例外は fail-closed。
 */

import type { EditorView } from '@tiptap/pm/view'
import { syncVerticalRlArrowDomSelectionFromPm } from './verticalRlArrowNavigationDomSelection'

/**
 * PM selection を DOM へ復元し、復元後の DOM 位置が `selection.from` と一致すること
 * まで確認する。一致しない・例外時は fail-closed で false（古い DOM selection を
 * Selection.modify / Home·End visual edge に渡さない）。
 */
export function syncDomSelectionFromPm(view: EditorView): boolean {
  return syncVerticalRlArrowDomSelectionFromPm(view)
}
