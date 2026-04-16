/**
 * BETA-SP1: Source Mode ドラフト消失防止ガード
 *
 * Source Mode (fullPlainEditActive) 中に「現在の編集対象を離れる」操作を行うと、
 * snapshotActiveTab() が PM Doc を読むだけで CodeMirror 側のドラフトを落としてしまう。
 *
 * このモジュールは、離脱前にドラフトの有無を検知し、
 * save / discard / cancel の 3 分岐を強制する。
 */

/** ドラフト判定に必要な最小 deps。hook 非依存で単体テスト可能。 */
export type SourceModeDraftCheckDeps = {
  fullPlainEditActive: boolean
  getSourceModeDraft: () => string | null
  getCoreMarkdown: () => string | null
}

export type UnsavedContinueAction = 'save' | 'discard' | 'cancel'

/**
 * closeTab() で current active document から離脱するか判定するための deps。
 *
 * - active tab close: 離脱するので guard 必須
 * - non-active dirty tab close: 一時的にその tab へ切り替えて guard する既存設計なので guard 必須
 * - non-active clean tab close: current active document から離脱しないので guard 不要
 */
export type SourceModeCloseGuardDeps = {
  activeTabId: string
  closingTabId: string
  closingTabDirty: boolean
}

/**
 * guardSourceModeDraft の結果。
 *
 * caller はこの値だけで「通常 dirty guard を走らせるか」を同期的に判断できる。
 * React render timing に依存しない。
 *
 * - `"proceed"`:  Source Mode 非アクティブ、または未適用ドラフトなし。
 *                 通常の dirty guard は従来どおり走らせてよい。
 *                 （Source Mode text === PM Doc なので dirty は PM Doc 基準と一致）
 * - `"resolved"`: save または discard で Source Mode ドラフトを解決済み。
 *                 通常の dirty guard をスキップする。
 *                 save → dirty=false が保証される。
 *                 discard → ユーザーが明示的に破棄を選んだため再 prompt しない。
 * - `"cancelled"`: cancel またはsave 失敗。操作を中断する。
 */
export type GuardResult = 'proceed' | 'resolved' | 'cancelled'

/** ガード実行に必要な deps。 */
export type SourceModeDraftGuardDeps = SourceModeDraftCheckDeps & {
  saveDocument: () => Promise<boolean>
  closeFullPlainEdit: () => void
  requestUnsavedContinueAction: () => Promise<UnsavedContinueAction>
}

export function shouldGuardSourceModeBeforeTabClose(
  deps: SourceModeCloseGuardDeps,
): boolean {
  return deps.closingTabId === deps.activeTabId || deps.closingTabDirty
}

/**
 * Source Mode のドラフトが PM Doc と異なるか判定する。
 *
 * `fullPlainEditActive === false` の場合は即 `false` を返す。
 * `getCoreMarkdown` は `peekMarkdown()` 相当の軽量 API を想定する。
 */
export function hasUnappliedSourceModeDraft(
  deps: SourceModeDraftCheckDeps,
): boolean {
  if (!deps.fullPlainEditActive) return false
  const draft = deps.getSourceModeDraft()
  if (draft === null) return false
  const coreMarkdown = deps.getCoreMarkdown()
  return draft !== coreMarkdown
}

/**
 * Source Mode ドラフトの離脱ガード。
 *
 * - Source Mode が非アクティブなら `"proceed"`
 * - 未適用ドラフトがなければ Source Mode を閉じて `"proceed"`
 * - 未適用ドラフトがあればモーダルで save / discard / cancel
 *   - save 成功: Source Mode を閉じて `"resolved"`
 *   - save 失敗: `"cancelled"` (Source Mode に留まる)
 *   - discard: Source Mode を閉じて `"resolved"`
 *   - cancel: `"cancelled"`
 *
 * save は既存の `saveDocument(false)` に委譲する。
 * `saveDocument` は Source Mode ドラフトを PM Doc に反映してからディスク保存するため、
 * ガード側で apply を別途呼ぶ必要はない。
 */
export async function guardSourceModeDraft(
  deps: SourceModeDraftGuardDeps,
): Promise<GuardResult> {
  if (!deps.fullPlainEditActive) return 'proceed'

  if (!hasUnappliedSourceModeDraft(deps)) {
    // Source Mode アクティブだが未適用変更なし — 静かに閉じて通過
    deps.closeFullPlainEdit()
    return 'proceed'
  }

  const action = await deps.requestUnsavedContinueAction()
  if (action === 'cancel') return 'cancelled'
  if (action === 'discard') {
    deps.closeFullPlainEdit()
    return 'resolved'
  }
  // save: saveDocument() がドラフト適用 + ディスク保存を行う
  const ok = await deps.saveDocument()
  if (!ok) return 'cancelled' // invalid markdown またはキャンセル — Source Mode に留まる
  deps.closeFullPlainEdit()
  return 'resolved'
}
