/**
 * Page Viewer のキーボードページ送りの pure helper。DOM / React には依存しない。
 *
 * PV-COL-2 (CSS multicol pagination) 以降、ページ移動は page index ベース
 * (`usePageViewerColumnLayout.ts` の `moveByPage` / `goToPage`) になったため、
 * この module の責務は「キー入力 → next / prev の判定」だけ。旧実装の
 * 「scrollLeft / scrollTop を viewport の 90% ずらす」系 helper
 * (`getPageStepSize` / `clampScrollLeftForVerticalRl` /
 * `clampScrollTopForHorizontalTb` / `nextScrollPositionForPageMove`) は、
 * 任意 scroll offset の疑似ページ送りを廃止したため削除済み
 * (`docs/page-viewer-css-columns-design-2026-07.md` §1 / §12.3)。
 */

import type { WritingMode } from '../../settings/types'

export type PageMoveDirection = 'next' | 'prev'

/**
 * キー入力 (`KeyboardEvent.key` / `shiftKey`) を、現在の `writingMode` の下で
 * どちらのページ移動 (`next` / `prev`) に対応するか判定する。DOM に依存しない
 * よう `KeyboardEvent` は受け取らず、必要な値だけを引数に取る。
 *
 * - `PageDown` → next / `PageUp` → prev (writing mode に関わらず常に有効)。
 * - `Space` (`shiftKey` なし) → next / `Shift+Space` → prev (常に有効)。
 * - `ArrowLeft` / `ArrowRight` は書字方向に合わせたphysical左右で扱う。
 *   vertical-rlは左=next / 右=prev、horizontal-tbは右=next / 左=prev。
 * - `ArrowDown` / `ArrowUp` は両方向とも本文ページ送りへ使わない。
 * - 該当しないキーは `null` (呼び出し側は `preventDefault` せず素通しする)。
 */
export function resolvePageMoveDirectionForKey(
  key: string,
  shiftKey: boolean,
  writingMode: WritingMode,
): PageMoveDirection | null {
  if (key === 'PageDown') return 'next'
  if (key === 'PageUp') return 'prev'
  if (key === ' ' || key === 'Spacebar') return shiftKey ? 'prev' : 'next'

  if (writingMode === 'vertical-rl') {
    if (key === 'ArrowLeft') return 'next'
    if (key === 'ArrowRight') return 'prev'
    return null
  }

  if (key === 'ArrowRight') return 'next'
  if (key === 'ArrowLeft') return 'prev'
  return null
}
