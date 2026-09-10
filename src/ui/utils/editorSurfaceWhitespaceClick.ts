/**
 * EDITOR-SURFACE-DOCUMENT-END-CARET1: `.editor-surface` の click を
 * 「本文末尾以降の編集面余白」かどうかへ分類する pure helper。
 *
 * 背景（実測）: `.editor-core-host` は surface 全体を占めるが、`.ProseMirror` は
 * content 分しか広がらない（horizontal は高さ、vertical-rl は幅）。そのため本文末尾
 * より後ろの余白 click は `.editor-core-host` を target にし、browser も PM も caret を
 * 置かないまま focus が body へ抜ける。ここではその「余白」だけを true にする。
 *
 * 境界:
 * - `.ProseMirror` ルート自身とその descendant は常に false。実段落・文字・Ruby・TCY・
 *   link・widget、および PM 自身の padding 余白は通常の ProseMirror 挙動に任せる。
 * - `.frontmatter-view` は false。standalone frontmatter と Project document-start
 *   （`project-book-start-view` / `project-file-start-view`）は同じ class を持つので、
 *   この 1 条件で両方を除外できる。
 * - Local Window overlay は false。overlay 面の owner は controller 側。
 * - bare primary click だけを true にする。secondary / middle / modifier click は
 *   横取りしない（context menu も奪わない）。
 * - Typewriter Mode の scroll-past-end spacer は CSS で `pointer-events: none` なので
 *   click は `.editor-core-host` へ抜ける。spacer 固有の分岐は持たず、同じ余白として
 *   扱う（spacer 専用の selection 体系は作らない）。
 *
 * DOM を探索するのは渡された `target` からの `closest()` だけで、座標から位置を
 * 推測しない。実際の caret 位置は呼び出し側が ProseMirror state から決める。
 */

/** `MouseEvent` のうち分類に必要な最小 shape。 */
export type EditorSurfaceClickModifiers = {
  readonly button: number
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  readonly altKey: boolean
  readonly shiftKey: boolean
}

/** `closest()` だけを使う最小の Element shape（DOM 実体に依存しない judgment 用）。 */
export type EditorSurfaceClickTarget = {
  closest(selectors: string): unknown
} | null

/** 本文（PM ルート自身を含む）。native ProseMirror が owner。 */
const PROSE_MIRROR_SELECTOR = '.editor-core-host > .ProseMirror'
/** standalone frontmatter と Project document-start が共有する表示 class。 */
const METADATA_SELECTOR = '.frontmatter-view'
/** Local Window overlay。overlay 面は controller が owner。 */
const LOCAL_WINDOW_OVERLAY_SELECTOR = '.nyoze-local-window-overlay'
/** 編集面そのもの。ここから外れた click は対象外。 */
const EDITOR_SURFACE_SELECTOR = '.editor-surface'

/** bare primary click（修飾なしの主ボタン）か。 */
export function isBarePrimaryClick(event: EditorSurfaceClickModifiers): boolean {
  if (event.button !== 0) return false
  return !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
}

/**
 * その要素が「編集面の余白」か（本文 / metadata / Local Window overlay の外）。
 *
 * `click` の target は mousedown / mouseup の共通祖先になるため、本文から余白へ
 * drag した場合も `.editor-core-host` を指し得る。そのため click target だけでは
 * gesture の起点を区別できず、pointerdown 側の判定にも同じ述語を使う。
 */
export function isEditorSurfaceWhitespaceTarget(target: EditorSurfaceClickTarget): boolean {
  if (!target) return false
  if (target.closest(PROSE_MIRROR_SELECTOR)) return false
  if (target.closest(METADATA_SELECTOR)) return false
  if (target.closest(LOCAL_WINDOW_OVERLAY_SELECTOR)) return false
  return Boolean(target.closest(EDITOR_SURFACE_SELECTOR))
}

/**
 * この click を「本文末尾以降の編集面余白」として扱ってよいか。
 *
 * true のときだけ呼び出し側が文書末尾 caret を置く。false のときは何もせず、
 * 既存の ProseMirror / metadata / Local Window の挙動をそのまま通す。
 *
 * `pointerDownOnWhitespace` は「この click を開始した pointerdown が余白から
 * 始まったか」の最小限の証明。これが gesture の起点を示す唯一の材料で、
 * timer / 距離しきい値 / synthetic event は使わない。
 *
 * - 本文から余白へ drag: pointerdown が本文なので false（実 drag の range を潰さない）。
 * - 余白での新しい bare primary click: true。以前の Shift+Arrow / 完了済み drag で
 *   range が残っていても、この gesture 自身は drag ではないので文書末尾へ collapse する。
 */
export function isEditorSurfaceWhitespaceClick(
  event: EditorSurfaceClickModifiers,
  target: EditorSurfaceClickTarget,
  pointerDownOnWhitespace: boolean,
): boolean {
  if (!isBarePrimaryClick(event)) return false
  if (!pointerDownOnWhitespace) return false
  return isEditorSurfaceWhitespaceTarget(target)
}
