/**
 * FILE-EXPLORER-CREATE-DELETE-FOCUS1: 「編集可能な文書へ入力できる状態」を
 * 決定的に取り戻すための、live state だけを根拠にする限定 pure 判定。
 *
 * - Search close の focus 復帰（`localImeSearchCloseFocusRestore.ts`）とは別物です。
 *   あちらは close 前に epoch / core instance を capture した token を持ちますが、
 *   こちらは token を持たず、呼び出し時点の live session state だけを読みます。
 *   search 固有 token を流用・改名していません。
 * - 汎用 focus framework ではありません。呼び出し元は「context menu / native
 *   confirm が既に破棄され、削除フローが terminal state に達した」1 箇所だけです。
 * - timer / polling / rAF / synthetic event を持ちません。
 * - 実際の focus は EditorCore 側の既存 public 境界（host PM の `commands.focus()`
 *   と Local Window controller の `tryFocusLocalWindowRoot()`）で行い、
 *   Local Window 内部 DOM を外から探しません。
 */

/**
 * Local Window controller の session mode（`localImeLocalWindowController.ts` の
 * `type Mode`）と同一の union。feature 境界を保つため import 0 の pure module に
 * とどめ、ここでは値を複製するだけにします。両者の一致は
 * `tests/file-explorer-create-delete-focus1.test.ts` の source oracle が守ります。
 */
export type EditingFocusRestoreSessionMode =
  | 'off'
  | 'active-clean'
  | 'active-dirty'
  | 'composing'
  | 'closing'
  | 'recovery-required'

/** `document.activeElement` 相当の最小 shape（DOM に依存しない judgment 用）。 */
export type EditingFocusVacancyNode = {
  readonly nodeName?: string
  readonly isConnected?: boolean
} | null

export type EditingFocusRestoreLive = {
  readonly mode: EditingFocusRestoreSessionMode
  readonly documentIdentity: string | null
  readonly controllerGeneration: number | null
  readonly localRootConnected: boolean
  readonly compositionActive: boolean
}

export type EditingFocusRestoreDecision =
  | {
      readonly target: 'skip'
      readonly reason:
        /** 既に誰か（別 UI / host / local）が focus を持っている。奪わない。 */
        | 'focus-owner-present'
        | 'host-detached'
        | 'composing'
        /** active session なのに local root が切れている。host へは倒さない。 */
        | 'local-detached'
        /** active session なのに identity / generation を証明できない。 */
        | 'local-proof-unavailable'
    }
  | { readonly target: 'local-window' }
  | {
      readonly target: 'host-editor'
      readonly reason:
        /** Local Window capability 自体が無い（controller 不在）。 */
        | 'local-unavailable'
        | 'local-off'
        | 'local-closing'
        | 'recovery-required'
    }

/**
 * focus が誰にも所有されていない（= 復帰してよい）状態か。
 *
 * 非同期 trash / refresh の完了までにユーザーが設定欄や別 UI へ移動していた場合、
 * terminal callback が focus を奪うと入力途中の文字が本文へ入り得ます。したがって
 * 「activeElement が無い / 切断済み / `BODY`・`HTML`」のときだけ復帰します。
 * 接続済みの foreign UI・host・local が既に focus を持っていれば何もしません。
 */
export function isEditingFocusVacant(active: EditingFocusVacancyNode): boolean {
  if (!active) return true
  if (active.isConnected === false) return true
  const name = active.nodeName
  return name === 'BODY' || name === 'HTML'
}

/**
 * 文書 open / tab activation の完了時に、editor へ focus を渡してよいかを判定する。
 *
 * - `handoffFrom` を渡さない場合は {@link isEditingFocusVacant} と同じ。削除フローの
 *   「誰も持っていないときだけ復帰する」契約はそのまま変わらない。
 * - `handoffFrom` を渡した場合は、**その open を始めた時点の focus owner が今も
 *   focus を持っている**ときだけ handoff を許す。File Explorer の行 button のように
 *   「開く操作そのもの」から editor へ渡すのが目的で、load 待ちの間に検索欄 /
 *   設定 UI / 外部アプリへ移っていれば owner が変わるので奪わない。
 * - 開始時 owner が既に切断されていれば handoff 対象にしない（vacancy 判定へ委ねる）。
 * - `windowFocused === false`（= ユーザーが外部アプリ / 別ウィンドウへ移動した）なら
 *   一切 handoff しない。`document.activeElement` は window blur 後も直前の要素の
 *   ままで、`BODY` へ落ちることもあるため、**activeElement だけでは外部アプリへの
 *   移動を判別できない**。同一ウィンドウ内の focus 移動（検索欄 / 設定 UI）は
 *   参照比較で、ウィンドウ外への移動はこの引数で分ける。
 *
 * 参照比較と boolean だけで判定し、DOM を探索しない・時間を推測しない。
 */
export function isEditingFocusHandoffAllowed(
  active: EditingFocusVacancyNode,
  handoffFrom: EditingFocusVacancyNode = null,
  /**
   * 呼び出し元ウィンドウが OS focus を持っているか。文書 open の handoff では実測値
   * （`document.hasFocus()`）を必ず渡す。既定 `true` は、この引数を持たない従来
   * 呼び出し（削除フローの復帰契約）を変えないための後方互換。
   */
  windowFocused = true,
): boolean {
  if (!windowFocused) return false
  if (isEditingFocusVacant(active)) return true
  if (!handoffFrom) return false
  if (handoffFrom.isConnected === false) return false
  return active === handoffFrom
}

/**
 * 復帰先を決める。
 *
 * - 既に focus owner がいる / host root が切断されている / composition 中は何もしない。
 * - live な Local Window session（`active-clean` / `active-dirty`）が正規 owner。
 *   local root を証明できない場合は **host へ倒さず skip** する（dirty draft を持つ
 *   active session から host へ owner を移すのは fail-closed ではないため）。
 * - host PM への fallback は、session が `off` / `closing` / `recovery-required` へ
 *   確定しているか、Local Window capability 自体が無い場合だけ。
 */
export function resolveEditingFocusRestore(input: {
  readonly focusVacant: boolean
  readonly hostRootConnected: boolean
  readonly hostComposing: boolean
  readonly live: EditingFocusRestoreLive | null
}): EditingFocusRestoreDecision {
  if (!input.focusVacant) return { target: 'skip', reason: 'focus-owner-present' }
  if (!input.hostRootConnected) return { target: 'skip', reason: 'host-detached' }
  if (input.hostComposing) return { target: 'skip', reason: 'composing' }

  const live = input.live
  if (!live) return { target: 'host-editor', reason: 'local-unavailable' }
  if (live.compositionActive || live.mode === 'composing') {
    return { target: 'skip', reason: 'composing' }
  }
  if (live.mode === 'recovery-required') {
    return { target: 'host-editor', reason: 'recovery-required' }
  }
  if (live.mode === 'closing') return { target: 'host-editor', reason: 'local-closing' }
  if (live.mode !== 'active-clean' && live.mode !== 'active-dirty') {
    return { target: 'host-editor', reason: 'local-off' }
  }
  if (!live.localRootConnected) {
    return { target: 'skip', reason: 'local-detached' }
  }
  if (!live.documentIdentity || live.controllerGeneration == null) {
    return { target: 'skip', reason: 'local-proof-unavailable' }
  }
  return { target: 'local-window' }
}
