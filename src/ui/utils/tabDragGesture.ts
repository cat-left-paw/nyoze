/**
 * EDITOR-TAB-REORDER1: タブ列の drag の判定（純粋な状態機械）。
 *
 * pointer event を受け取って「いつ drag が始まったか」「いつ並べ替えを確定するか」「どの終わり方で
 * 後続の click を止めるか」だけを決める。DOM・座標からの挿入位置の計算・pointer capture・window の
 * listener は `tabDragController.ts` が持つ。時刻・timer・rAF には一切依らない（pointer event の
 * 列だけで進む）。
 *
 * 状態:
 * - idle: 何も追っていない。
 * - pending: primary の pointerdown を受けた。しきい値までは今の click のまま（何も変えない）。
 * - dragging: 横にしきい値以上動いた。挿入位置を示している。
 * - cancelled: drag の途中で Esc / window の blur があった。並べ替えない。pointer が離されるまで
 *   追い続け、離されたときの click は止める（drag の意図があったため）。
 */

/** 横にこの距離（CSS px）以上動くまでは drag にしない。 */
export const TAB_DRAG_START_DISTANCE_PX = 5

export type TabDragState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'pending'; readonly tabId: string; readonly pointerId: number; readonly startX: number }
  | { readonly phase: 'dragging'; readonly tabId: string; readonly pointerId: number; readonly startX: number }
  | { readonly phase: 'cancelled'; readonly tabId: string; readonly pointerId: number }

export type TabDragEvent =
  | {
      readonly type: 'down'
      readonly tabId: string
      readonly pointerId: number
      readonly x: number
      readonly button: number
      readonly isPrimary: boolean
      /** pointerdown が tab の閉じる `×` の上から始まった。 */
      readonly onClose: boolean
      /** 開いている tab の数。1 つだけなら並べ替えるものがない。 */
      readonly tabCount: number
    }
  | {
      readonly type: 'move'
      readonly pointerId: number
      readonly x: number
      /** primary のボタンが押されたままか（離された pointerup を取り逃した場合の安全網）。 */
      readonly primaryDown: boolean
    }
  | { readonly type: 'up'; readonly pointerId: number }
  /** pointercancel / pointer capture の喪失（pointerup なしで gesture が終わった）。 */
  | { readonly type: 'cancel'; readonly pointerId: number }
  | { readonly type: 'escape' }
  | { readonly type: 'blur' }

/** reducer が呼び出し側へ求める副作用。 */
export type TabDragEffect =
  /** 何もしない。 */
  | 'none'
  /** drag が始まった: pointer capture、挿入位置の表示を始める。 */
  | 'drag-started'
  /** drag が続いている: 挿入位置を計算し直す。 */
  | 'drag-moved'
  /** drag が終わった: 最後に表示していた挿入位置で並べ替えを確定し、後続の click を止める。 */
  | 'commit'
  /** 取り消した drag が終わった: 並べ替えず、後続の click を止める。 */
  | 'suppress-click'
  /** gesture を捨てた（取り消し・cancel）: 挿入位置の表示を消す。後続の click は止めない。 */
  | 'aborted'

export type TabDragStep = { readonly state: TabDragState; readonly effect: TabDragEffect }

export const INITIAL_TAB_DRAG_STATE: TabDragState = { phase: 'idle' }

const NOTHING: TabDragEffect = 'none'

function stay(state: TabDragState): TabDragStep {
  return { state, effect: NOTHING }
}

/** この pointerdown を drag の候補として追ってよいか。 */
export function canBeginTabDrag(event: Extract<TabDragEvent, { type: 'down' }>): boolean {
  return (
    event.button === 0 &&
    event.isPrimary &&
    !event.onClose &&
    event.tabCount >= 2
  )
}

export function stepTabDrag(state: TabDragState, event: TabDragEvent): TabDragStep {
  switch (event.type) {
    case 'down': {
      // 新しい pointerdown は常に前の gesture を捨てて始め直す（pointerup の取り逃しで固着しない）。
      if (!canBeginTabDrag(event)) return stay({ phase: 'idle' })
      return stay({
        phase: 'pending',
        tabId: event.tabId,
        pointerId: event.pointerId,
        startX: event.x,
      })
    }
    case 'move': {
      if (state.phase === 'idle' || state.pointerId !== event.pointerId) return stay(state)
      if (!event.primaryDown) return { state: { phase: 'idle' }, effect: 'aborted' }
      if (state.phase === 'pending') {
        if (Math.abs(event.x - state.startX) < TAB_DRAG_START_DISTANCE_PX) return stay(state)
        return {
          state: { phase: 'dragging', tabId: state.tabId, pointerId: state.pointerId, startX: state.startX },
          effect: 'drag-started',
        }
      }
      if (state.phase === 'dragging') return { state, effect: 'drag-moved' }
      return stay(state)
    }
    case 'up': {
      if (state.phase === 'idle' || state.pointerId !== event.pointerId) return stay(state)
      const idle: TabDragState = { phase: 'idle' }
      if (state.phase === 'dragging') return { state: idle, effect: 'commit' }
      if (state.phase === 'cancelled') return { state: idle, effect: 'suppress-click' }
      // pending: しきい値に届かなかった。今の click のまま。
      return { state: idle, effect: 'none' }
    }
    case 'cancel': {
      if (state.phase === 'idle' || state.pointerId !== event.pointerId) return stay(state)
      return { state: { phase: 'idle' }, effect: 'aborted' }
    }
    case 'escape': {
      // drag の前（pending）の Esc は今の click に影響させない。
      if (state.phase !== 'dragging') return stay(state)
      return {
        state: { phase: 'cancelled', tabId: state.tabId, pointerId: state.pointerId },
        effect: 'aborted',
      }
    }
    case 'blur': {
      if (state.phase === 'dragging') {
        return {
          state: { phase: 'cancelled', tabId: state.tabId, pointerId: state.pointerId },
          effect: 'aborted',
        }
      }
      // pending / cancelled の blur: gesture を持ち越さない（window の外で離されると pointerup を
      // 受け取れないため、listener が残り続けるのを避ける）。
      if (state.phase === 'pending') return { state: { phase: 'idle' }, effect: 'aborted' }
      return stay(state)
    }
  }
}
