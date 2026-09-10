/**
 * FILE-EXPLORER-CREATE-DELETE-FOCUS1: context menu の Delete で選ばれた対象を
 * 1 回だけ削除フローへ渡すための one-shot latch（import 0 の pure helper）。
 *
 * React state で「消費済み」を表すと、`setState(null)` は commit されるまで反映
 * されないため、同じ commit の snapshot で effect が再実行されると同じ対象を
 * 二重消費し得る（Strict Mode の追加実行、dependency callback の identity 変更など）。
 * latch は `ref` の同期書き換えなので、`onDeleteEntry()` を呼ぶ前に消費済みになり、
 * 2 回目以降の consumer 呼び出しは対象なしで終わる。
 *
 * timer / rAF / polling / quiet period は使わない。confirm 表示回数を時間で推定しない。
 */

/** `useRef` と同じ shape。DOM にも React にも依存しない。 */
export type PendingDeleteLatch<T> = { current: T | null }

/**
 * latch を同期的に消費する。
 *
 * - context menu がまだ DOM に残っている間は消費しない（modal 中の focus 移動を避ける）。
 * - 対象を取り出したら、呼び出し側が削除フローを開始する **前に** latch を空にする。
 *
 * @returns 消費した対象。対象なし / menu 表示中は `null`。
 */
export function consumePendingDeleteTarget<T>(
  latch: PendingDeleteLatch<T>,
  contextMenuVisible: boolean,
): T | null {
  if (contextMenuVisible) return null
  const pending = latch.current
  if (!pending) return null
  latch.current = null
  return pending
}
