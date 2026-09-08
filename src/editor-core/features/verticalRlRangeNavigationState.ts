/**
 * OVERLAY-SELECTIONOWN1-KBD-PHYS1 — `OVERLAY-SELECTIONOWN1-KBD`の1打目handoffが
 * `Selection.modify('extend', ...)`へ渡すvertical-rl物理方向mapping。
 *
 * packaged実機確認で、旧mapping（Up/Down=`line`、Left/Right=`character`という
 * 横書き型の割り当て）は1打目の物理移動がvertical-rlの視覚方向と一致しないことが
 * 判明した。2打目以降はhost nativeがそのまま処理し実機で正しく動くため、このmoduleは
 * **bare Arrowの製品物理方向mapping（`verticalRlArrowNavigationState.ts`）と同じ
 * direction / granularityをexact 1回のextend呼び出しへ渡すだけ**にする。
 * bare Arrow moduleとの結合ではなく値の一致であり、rangeのpure moduleとしての
 * 責務分離（extendという操作固有の型）は維持する。
 */
import type { VerticalRlArrowOperation } from './verticalRlArrowNavigationState'

export type VerticalRlRangeModifyMapping = {
  direction: 'backward' | 'forward'
  granularity: 'character' | 'line'
}

export function resolveVerticalRlRangeModifyMapping(
  operation: VerticalRlArrowOperation,
): VerticalRlRangeModifyMapping {
  switch (operation) {
    case 'arrow-up':
      return { direction: 'backward', granularity: 'character' }
    case 'arrow-down':
      return { direction: 'forward', granularity: 'character' }
    case 'arrow-left':
      return { direction: 'forward', granularity: 'line' }
    case 'arrow-right':
      return { direction: 'backward', granularity: 'line' }
  }
}
