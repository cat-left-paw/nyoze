/**
 * PIS-RANGE-RETAIN-DISPLAY1: 範囲のハイライトを出すかの判定と、「別のUIへfocusが移った」印。DOM・PM runtimeに依存しない。
 *
 * 作者の要望: PMの選択が範囲のまま、focusが入力面・Hostのroot以外のUI（書字方向の切り替え、ペイン、タブ、検索の欄、設定、prompt など）
 * へ移っても、範囲のハイライトを消さない（消えると、選択が解除されたようにしか見えない）。
 *
 * 状態機械（`surfaceState.ts`の`transitionSurface`）は変えない。key router・選択の写し（再変換）・caretのreveal・pointerの貸し出しは、
 * これまでどおり`state`を見る。ここで変えるのは、範囲の表示を出すかの判定だけで、判定に使う「印」を、状態機械の外に1つだけ持つ。
 *
 * - 印（`otherUi`）: 直前に`inactive`になった理由が「入力面にfocusがあった状態から、別のUIへfocusが移った」こと。
 *   入力面の状態（`surface` / `surface-range`）からだけ付く（HostにDOMの選択がある`lent` / `host-keyboard`からは付けない。
 *   Hostのnativeの選択が描かれている間に、Highlightを重ねない）。すでに印が付いた`inactive`のまま別のUIへ移っても、印は残る。
 * - 印は、入力面へのfocus、Hostへのfocus（`host-focus` / `handoff`）、pointerの貸し出し（`pointerdown`）、eligibleでなくなったこと、
 *   文書の変更（読み込み・タブの切り替え）で外す。それ以外の`deactivate`（pointerupの時の識別不一致など）でも外す（印は、別のUIへ移った
 *   という1つの出来事でしか付かない）。
 * - 印が付いた`inactive`のときの表示は、その時点のPMの選択に従う（範囲なら範囲、caretなら出さない）。
 * - `lent`・`host-keyboard`では出さない（Hostのnativeの選択と二重に描かない）。
 */
import { transitionSurface, type SurfaceEvent, type SurfaceState } from './surfaceState'

export type RangeRetentionState = { state: SurfaceState; otherUi: boolean }

export type RangeRetentionEvent =
  | SurfaceEvent
  /** focusが、入力面でもHostのrootでもない要素へ移った（eligibleのとき）。状態は`inactive`になる。 */
  | { type: 'other-ui-focus' }
  /** eligibleでなくなった（Source Mode・段落プレーン編集・read-only・Local Window・以前の入力方式）。 */
  | { type: 'ineligible' }
  /** 文書を置き換えた（読み込み・タブの切り替え）。 */
  | { type: 'document-changed' }

/** 状態と印を、1つの出来事で進める。印は`inactive`のときだけ真になり得る。 */
export function reduceRangeRetention(current: RangeRetentionState, event: RangeRetentionEvent): RangeRetentionState {
  switch (event.type) {
    case 'other-ui-focus': {
      const surfaceHadFocus = current.state === 'surface' || current.state === 'surface-range'
      return { state: transitionSurface(current.state, { type: 'deactivate' }), otherUi: surfaceHadFocus || (current.state === 'inactive' && current.otherUi) }
    }
    case 'ineligible':
    case 'document-changed':
      return { state: transitionSurface(current.state, { type: 'deactivate' }), otherUi: false }
    case 'selection':
    case 'pointerup':
    case 'pointercancel': {
      // 選択の変化・pointerup・pointercancelは、lentでなければ状態を変えない（focusの持ち主を変えない）。印は状態がinactiveのまま残る間だけ持つ。
      const state = transitionSurface(current.state, event)
      return { state, otherUi: current.otherUi && state === 'inactive' }
    }
    default:
      // 入力面へのfocus・Hostへのfocus・handoff・pointerdown・汎用のdeactivate: 印を外す。
      return { state: transitionSurface(current.state, event), otherUi: false }
  }
}

/** 範囲のHighlightを登録してよい状態か（選択の有無などは見ない）。transitionでHighlightを消すかの判定にも使う。 */
export function isRangeDisplayState(state: SurfaceState, otherUi: boolean): boolean {
  return state === 'surface-range' || (state === 'inactive' && otherUi)
}

export type RangeDisplayInput = {
  state: SurfaceState
  otherUi: boolean
  /** PISがeligible（Source Mode・段落プレーン編集・read-only・Local Window・以前の入力方式では出さない）。 */
  eligible: boolean
  /** PMの選択が範囲（`!selection.empty`。AllSelection・NodeSelectionを含む）。 */
  range: boolean
  /** 範囲の再変換の表示中（元の範囲をlayoutから外して押し出す表示）。Hostの範囲Highlightも出さない。 */
  reconversionPresented: boolean
}

/** 範囲のHighlight（と、それに従う改行の帯）を出すか。 */
export function shouldShowRange(input: RangeDisplayInput): boolean {
  return input.eligible && input.range && !input.reconversionPresented && isRangeDisplayState(input.state, input.otherUi)
}
