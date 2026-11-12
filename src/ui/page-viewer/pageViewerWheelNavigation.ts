/**
 * Page Viewer のホイール（マウスのホイール・トラックパッド）によるページ移動の判定（pure controller）。
 *
 * PAGE-VIEWER-WHEEL1。React / DOM / Electron / IPC を import しない。timer・rAF・polling も使わず、
 * 呼び出し側が `WheelEvent.timeStamp` として渡す `nowMs` だけで、操作の区切り（idle）と
 * 「1 回の操作で 1 ページだけ」の latch を同期判定する。
 *
 * 1 回の操作で 1 ページだけ進む（作者の判断、2026-11-09）:
 * - トラックパッドの慣性は 1 回はらうだけで 1〜2 秒、数十個のイベントが届く。その操作が続いている間は、
 *   次の移動をしない（latch）。操作の終わりは「最後のイベントから `idleMs` 以上空いた」こと。
 * - マウスのホイールをゆっくり 1 段ずつ回したときは、1 段（deltaY 11.8 px など）で 1 ページ。
 *   速く回したときは、続けて届いた分（約 15 ms 間隔）を 1 回の操作として 1 ページ。
 * - 速く回した最後の逆向きのイベント（ホイールの跳ね返り）は、latch 中なので無視する（前のページへ戻らない）。
 * - 1 イベントでしきい値に届けば、それで移動する（章の境目の controller の「最低 2 イベント」は使わない）。
 *
 * 方向（作者の判断）:
 * - そのイベントで量の大きい軸を使う（同じなら deltaY）。
 * - 縦の回転（deltaY）: 縦書き・横書きとも、下へ回す（deltaY > 0）と次のページ。
 * - 横（deltaX。トラックパッドの横スワイプ、Windows の Shift+ホイール）: OS のスクロールの向きに合わせる。
 *   縦書きは deltaX < 0 が次のページ（紙の縦書きの本と同じ）、横書きは deltaX > 0 が次のページ。
 * - Ctrl（トラックパッドのピンチは Chromium では Ctrl 付きのホイールで届く）・Meta・Alt 付きは無視する
 *   （最後の入力の時刻も更新しない。ピンチの直後のホイールを止めないため）。Shift は横の扱いに入る。
 *
 * 章の境目の controller（`src/ui/utils/editorChapterBoundaryWheelNavigation.ts`）は、章の境目専用の条件
 * （Alt 必須・最低 2 イベント・1 秒の cooldown）を持つので変えず、deltaMode の正規化だけを再利用する。
 */

import type { WritingMode } from '../../settings/types'
import { normalizeWheelDeltaToPixels } from '../utils/editorChapterBoundaryWheelNavigation'

/** 操作の中の同じ向きの累積がこの px に達したら、1 回だけ移動する。1 段 = deltaY 11.8 px（Mac のマウス）で反応する。 */
export const PAGE_VIEWER_WHEEL_TRIGGER_PX = 8
/**
 * 最後のイベントからこの時間（ms）以上空いたら、新しい操作として累積と latch を捨てる。
 * 速い回転の中の最大の間（112 ms）は同じ操作として扱う。ゆっくりの段が 150 ms 未満で続くと 1 ページにまとまる。
 */
export const PAGE_VIEWER_WHEEL_IDLE_MS = 150

/** 移動する向き（章の境目の controller と同じ `previous`。ページ移動の `prev` への写しは呼び出し側の 1 か所）。 */
export type PageViewerWheelMoveDirection = 'next' | 'previous'

export type PageViewerWheelDirection = PageViewerWheelMoveDirection | 'none'

/** 1 回の WheelEvent から抽出した入力（DOM 非依存）。 */
export type PageViewerWheelInput = {
  writingMode: WritingMode
  deltaX: number
  deltaY: number
  /** WheelEvent.deltaMode（pixel=0 / line=1 / page=2） */
  deltaMode: number
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  /** 同期判定用の現在時刻（ms）。`WheelEvent.timeStamp` を渡す。 */
  nowMs: number
}

/** Ctrl（ピンチを含む）・Meta・Alt 付きのホイールはページ移動の対象外。Shift は対象（横の扱い）。 */
export function isPageViewerWheelModifierIgnored(input: Pick<PageViewerWheelInput, 'ctrlKey' | 'metaKey' | 'altKey'>): boolean {
  return input.ctrlKey === true || input.metaKey === true || input.altKey === true
}

/**
 * ホイールの論理の向き（次・前）と、累積に使う px の量。
 * 量が 0・非有限なら `null`（ページ移動の入力ではない）。
 */
export function resolvePageViewerWheelLogicalDelta(
  writingMode: WritingMode,
  deltaX: number,
  deltaY: number,
  deltaMode: number,
): { direction: PageViewerWheelMoveDirection; magnitudePx: number } | null {
  const ndx = normalizeWheelDeltaToPixels(deltaX, deltaMode)
  const ndy = normalizeWheelDeltaToPixels(deltaY, deltaMode)
  if (!Number.isFinite(ndx) || !Number.isFinite(ndy)) return null
  if (ndx === 0 && ndy === 0) return null
  // 量の大きい軸を使う。同じなら縦（deltaY）。
  if (Math.abs(ndy) >= Math.abs(ndx)) {
    return { direction: ndy > 0 ? 'next' : 'previous', magnitudePx: Math.abs(ndy) }
  }
  const nextOnPositiveX = writingMode !== 'vertical-rl'
  const towardNext = nextOnPositiveX ? ndx > 0 : ndx < 0
  return { direction: towardNext ? 'next' : 'previous', magnitudePx: Math.abs(ndx) }
}

export type PageViewerWheelNavigationController = {
  /** 1 イベント分を渡し、移動する向き（または none）を返す。 */
  handle(input: PageViewerWheelInput): PageViewerWheelDirection
  /** 累積・向き・latch・最後の入力の時刻を全て初期化する（ready でない間・書字方向の変更・文書の読み込み直し・unmount）。 */
  reset(): void
}

export type PageViewerWheelNavigationOptions = {
  triggerPx?: number
  idleMs?: number
}

export function createPageViewerWheelNavigationController(
  options: PageViewerWheelNavigationOptions = {},
): PageViewerWheelNavigationController {
  const triggerPx = options.triggerPx ?? PAGE_VIEWER_WHEEL_TRIGGER_PX
  const idleMs = options.idleMs ?? PAGE_VIEWER_WHEEL_IDLE_MS

  let accumulatedPx = 0
  let direction: PageViewerWheelMoveDirection | null = null
  let lastInputMs: number | null = null
  let latched = false

  function reset(): void {
    accumulatedPx = 0
    direction = null
    lastInputMs = null
    latched = false
  }

  function handle(input: PageViewerWheelInput): PageViewerWheelDirection {
    const now = input.nowMs

    // 1. 直前のイベントから idleMs 以上空いたら、新しい操作。累積と latch を捨てる。
    const sinceLast = lastInputMs === null ? Number.POSITIVE_INFINITY : now - lastInputMs
    if (sinceLast >= idleMs) {
      accumulatedPx = 0
      direction = null
      latched = false
    }

    // 2. 無視する修飾キー。最後の入力の時刻は更新しない（ピンチの直後のホイールを止めない）。
    if (isPageViewerWheelModifierIgnored(input)) return 'none'

    // 3. 論理の向きと量。量が 0 のイベントは、状態にも最後の入力の時刻にも触れない。
    const logical = resolvePageViewerWheelLogicalDelta(input.writingMode, input.deltaX, input.deltaY, input.deltaMode)
    if (!logical) return 'none'

    lastInputMs = now

    // 4. latch 中は向きによらず none（慣性・跳ね返りの逆向きのイベントを無視する）。時刻だけ更新済み。
    if (latched) return 'none'

    // 5. 同じ向きの量を累積し、しきい値以上で 1 回だけ返して latch する。向きが変わったら数え直す。
    if (direction !== logical.direction) {
      direction = logical.direction
      accumulatedPx = 0
    }
    accumulatedPx += logical.magnitudePx
    if (accumulatedPx < triggerPx) return 'none'

    accumulatedPx = 0
    direction = null
    latched = true
    return logical.direction
  }

  return { handle, reset }
}
