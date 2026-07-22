/**
 * Chapter Boundary Scroll Navigation v1 — wheel gesture 判定基盤（pure controller）。
 *
 * 将来、Book 本文の章頭 / 章末で `Option/Alt + スクロール` により前後章へ移動する
 * ための「論理方向 + 単発 trigger」判定だけを担う純粋ロジック。
 *
 * このモジュールは pure であり、React / DOM listener / Electron / IPC を一切 import しない。
 * タイマー API も使わず、呼び出し側が渡す `nowMs` による同期判定だけで idle / cooldown /
 * latch を扱う（fake timer なしでテストできる）。
 *
 * 方向感覚は既存 wheel 補正（`src/editor-core/features/verticalWheelScroll.ts`）と一致させる:
 * - 横書き horizontal-tb: `deltaY > 0` → next、`deltaY < 0` → previous。
 *   deltaY がほぼ 0 で deltaX だけが来る（トラックパッド横スワイプ）場合は誤発火回避のため none。
 * - 縦書き vertical-rl: 実 scroll 量 `scrollAmount = -deltaY * 0.8 + deltaX` の符号で解釈する。
 *   vertical-rl は scrollLeft が 0 から負方向へ進むため `scrollAmount < 0` → next、`> 0` → previous。
 *
 * このスライスでは wheel listener / 既定動作の抑止 / 章移動呼び出し / UI には一切接続しない。
 */

import type { WritingMode } from '../../settings/types'

/** 章境界 wheel が示す論理方向。`none` は「triggerなし」。 */
export type ChapterBoundaryWheelDirection = 'previous' | 'next' | 'none'

/** 章移動を伴う実方向（`none` を除いた previous / next）。 */
export type ChapterBoundaryWheelMoveDirection = 'previous' | 'next'

/** 1 回の WheelEvent から抽出した論理入力（DOM 非依存）。 */
export type ChapterBoundaryWheelInput = {
  writingMode: WritingMode
  /** WheelEvent.deltaX */
  deltaX: number
  /** WheelEvent.deltaY */
  deltaY: number
  /** WheelEvent.deltaMode（pixel=0 / line=1 / page=2） */
  deltaMode: number
  altKey: boolean
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  /** 章頭付近にいる（前章末尾へ移動できる前提）。 */
  atStart: boolean
  /** 章末付近にいる（次章先頭へ移動できる前提）。 */
  atEnd: boolean
  /** previous 方向の neighbor 章が存在する。 */
  hasPrevious: boolean
  /** next 方向の neighbor 章が存在する。 */
  hasNext: boolean
  /** IME composition 中。true の間は trigger しない。 */
  composing: boolean
  /** 章移動が無効（内部 doc / 非 Book 文脈など）。 */
  navigationDisabled: boolean
  /** 同期判定用の現在時刻（ms）。高分解能タイマー等の値を呼び出し側で渡す。 */
  nowMs: number
}

// --- deltaMode 正規化係数（exported / test 固定） -------------------------------

/** WheelEvent.deltaMode === DOM_DELTA_PIXEL */
export const WHEEL_DELTA_MODE_PIXEL = 0
/** WheelEvent.deltaMode === DOM_DELTA_LINE */
export const WHEEL_DELTA_MODE_LINE = 1
/** WheelEvent.deltaMode === DOM_DELTA_PAGE */
export const WHEEL_DELTA_MODE_PAGE = 2

/** line 単位 1 行を pixel 相当へ変換する固定係数。 */
export const WHEEL_LINE_TO_PIXEL = 16
/** page 単位 1 ページを pixel 相当へ変換する固定係数（viewport 情報を持たない pure 層の安全値）。 */
export const WHEEL_PAGE_TO_PIXEL = 800

/** 縦書き実 scroll 量計算の deltaY 係数（verticalWheelScroll と一致）。 */
export const VERTICAL_WHEEL_DELTA_Y_FACTOR = 0.8

/** これ未満の論理スクロール量は「動いていない」とみなし方向 none。 */
export const WHEEL_DIRECTION_EPSILON_PX = 1

// --- gesture controller 既定パラメータ（exported / test 固定） -----------------

/** 同方向累積がこの px に達したら 1 回 trigger する。 */
export const CHAPTER_BOUNDARY_WHEEL_TRIGGER_PX = 72
/** 最後の wheel 入力からこの時間以上空いたら新 gesture として累積をリセット。 */
export const CHAPTER_BOUNDARY_WHEEL_IDLE_MS = 300
/** trigger 後この時間は新 trigger を返さない。 */
export const CHAPTER_BOUNDARY_WHEEL_COOLDOWN_MS = 1000

/** deltaMode を考慮し delta を pixel 相当へ正規化する。非有限値は NaN を返す。 */
export function normalizeWheelDeltaToPixels(delta: number, deltaMode: number): number {
  if (!Number.isFinite(delta)) return Number.NaN
  switch (deltaMode) {
    case WHEEL_DELTA_MODE_LINE:
      return delta * WHEEL_LINE_TO_PIXEL
    case WHEEL_DELTA_MODE_PAGE:
      return delta * WHEEL_PAGE_TO_PIXEL
    case WHEEL_DELTA_MODE_PIXEL:
    default:
      return delta
  }
}

/**
 * wheel の論理方向と累積に使う pixel 量を求める。
 * - 非有限値 / ほぼ 0（none 相当） / 対象外 writingMode は `null`。
 */
export function resolveChapterBoundaryWheelLogicalDelta(
  writingMode: WritingMode,
  deltaX: number,
  deltaY: number,
  deltaMode: number,
): { direction: ChapterBoundaryWheelMoveDirection; magnitudePx: number } | null {
  const ndx = normalizeWheelDeltaToPixels(deltaX, deltaMode)
  const ndy = normalizeWheelDeltaToPixels(deltaY, deltaMode)
  if (!Number.isFinite(ndx) || !Number.isFinite(ndy)) return null

  if (writingMode === 'horizontal-tb') {
    // 横書きは縦スクロール軸（deltaY）だけで方向を決める。
    // deltaY≈0 で deltaX だけが来る横スワイプは誤発火回避で none。
    if (Math.abs(ndy) < WHEEL_DIRECTION_EPSILON_PX) return null
    return {
      direction: ndy > 0 ? 'next' : 'previous',
      magnitudePx: Math.abs(ndy),
    }
  }

  if (writingMode === 'vertical-rl') {
    // 縦書きは verticalWheelScroll と同値の実 scroll 量で解釈する。
    const scrollAmount = -ndy * VERTICAL_WHEEL_DELTA_Y_FACTOR + ndx
    if (Math.abs(scrollAmount) < WHEEL_DIRECTION_EPSILON_PX) return null
    return {
      // vertical-rl は 0→負へ進むため scrollAmount<0 が next。
      direction: scrollAmount < 0 ? 'next' : 'previous',
      magnitudePx: Math.abs(scrollAmount),
    }
  }

  // vertical-lr 等は正式対象外。勝手な方向仕様を足さず none。
  return null
}

/** Option/Alt 単独 chord のみ受理する（macOS Option / Windows・Linux Alt = altKey）。 */
export function isChapterBoundaryWheelChord(input: {
  altKey: boolean
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
}): boolean {
  if (input.altKey !== true) return false
  if (input.shiftKey) return false
  if (input.ctrlKey) return false
  if (input.metaKey) return false
  return true
}

/** edge / neighbor / composition / disabled の文脈 gate。指定方向へ移動可能かを返す。 */
export function canNavigateChapterBoundary(
  input: Pick<
    ChapterBoundaryWheelInput,
    'atStart' | 'atEnd' | 'hasPrevious' | 'hasNext' | 'composing' | 'navigationDisabled'
  >,
  direction: ChapterBoundaryWheelMoveDirection,
): boolean {
  if (input.composing) return false
  if (input.navigationDisabled) return false
  // 短い文書（overflow なし）: 章頭と章末が同時に立つので移動させない。
  if (input.atStart && input.atEnd) return false
  if (direction === 'next') {
    return input.atEnd && input.hasNext
  }
  return input.atStart && input.hasPrevious
}

export type ChapterBoundaryWheelNavigationController = {
  /** 1 イベント分の論理入力を渡し、章移動 trigger 方向（または none）を返す。 */
  handle(input: ChapterBoundaryWheelInput): ChapterBoundaryWheelDirection
  /**
   * 累積 / 方向 / イベント件数 *だけ* を初期化する（`accumulatedPx` / `eventCount` / `direction`）。
   * `latched` / `cooldownUntilMs` / `lastInputMs` は維持する。
   *
   * active file 変更 / edge 条件変更 / neighbor 変更で使う。trigger 直後に active file が
   * 変わっても、同一慣性 gesture の残りが cooldown / latch を保ったまま次章へ連続ジャンプ
   * しないようにするための部分 reset。
   */
  resetAccumulation(): void
  /**
   * 累積 / 方向 / イベント件数 / latched / 最終入力時刻 / cooldown を全て初期化する。
   * hook 無効化 / unmount / Source Mode・Paragraph Plain 移行 / writing mode 変更 /
   * controller 再生成など、gesture 文脈を完全に捨ててよい境界で使う。
   */
  reset(): void
}

export type ChapterBoundaryWheelNavigationOptions = {
  triggerPx?: number
  idleMs?: number
  cooldownMs?: number
}

/**
 * 単発 wheel では trigger せず、同方向の累積が閾値へ達したときだけ 1 回 trigger する
 * pure controller を生成する。idle / cooldown / latch は `nowMs` で同期判定する。
 */
export function createChapterBoundaryWheelNavigationController(
  options: ChapterBoundaryWheelNavigationOptions = {},
): ChapterBoundaryWheelNavigationController {
  const triggerPx = options.triggerPx ?? CHAPTER_BOUNDARY_WHEEL_TRIGGER_PX
  const idleMs = options.idleMs ?? CHAPTER_BOUNDARY_WHEEL_IDLE_MS
  const cooldownMs = options.cooldownMs ?? CHAPTER_BOUNDARY_WHEEL_COOLDOWN_MS

  let accumulatedPx = 0
  /** 現 gesture で同方向の有効 wheel を何イベント受け取ったか。単発 trigger 防止に使う。 */
  let eventCount = 0
  let direction: ChapterBoundaryWheelMoveDirection | null = null
  let lastInputMs: number | null = null
  let cooldownUntilMs = 0
  let latched = false

  function resetAccumulation(): void {
    accumulatedPx = 0
    eventCount = 0
    direction = null
  }

  function reset(): void {
    resetAccumulation()
    lastInputMs = null
    cooldownUntilMs = 0
    latched = false
  }

  function handle(input: ChapterBoundaryWheelInput): ChapterBoundaryWheelDirection {
    const now = input.nowMs

    // 1. 直前 wheel からの idle / cooldown を、今回の入力を反映する前に評価する。
    const sinceLast = lastInputMs == null ? Number.POSITIVE_INFINITY : now - lastInputMs
    const idleElapsed = sinceLast >= idleMs
    const cooldownOver = now >= cooldownUntilMs

    if (idleElapsed) {
      // idle 経過 = 新 gesture。古い累積とイベント件数は捨てる。
      accumulatedPx = 0
      eventCount = 0
      direction = null
      // 再武装は「cooldown 終了済み」かつ「idle 経過後の新 wheel」が揃ったときだけ。
      if (cooldownOver) latched = false
    }

    // 2. modifier / chord gate。Option 単独以外の通常スクロールは navigation ではない。
    if (!isChapterBoundaryWheelChord(input)) {
      return 'none'
    }

    // ここから先は Option(単独) wheel gesture。gesture 活動として最終入力時刻を更新する。
    // （cooldown を超える長い慣性が続く間も idle 判定が成立しないよう latch を維持する。）
    lastInputMs = now

    // 3. 論理方向と累積 px。
    const logical = resolveChapterBoundaryWheelLogicalDelta(
      input.writingMode,
      input.deltaX,
      input.deltaY,
      input.deltaMode,
    )
    if (!logical) return 'none'

    // 4. edge / neighbor / composition / disabled gate。
    if (!canNavigateChapterBoundary(input, logical.direction)) {
      // edge 外の wheel では将来の edge 到達用に累積も件数も貯めない。
      accumulatedPx = 0
      eventCount = 0
      direction = null
      return 'none'
    }

    // 5. 方向反転で累積 / 件数リセットし、新方向として再開始。
    if (direction !== logical.direction) {
      direction = logical.direction
      accumulatedPx = 0
      eventCount = 0
    }

    // 6. latched / cooldown 中は accumulate も trigger もしない。
    //    1 度の長い慣性 gesture が cooldown 後に閾値を再度跨いで 2 章目へ飛ぶのを防ぐ。
    if (latched || !cooldownOver) {
      return 'none'
    }

    // 7. 累積し、件数 / 閾値到達で 1 回だけ trigger。
    //    単発 wheel（巨大 delta / deltaMode:page 含む）では trigger しないよう、
    //    同方向の有効 wheel を最低 2 イベント受け取ってから閾値判定を許可する。
    eventCount += 1
    accumulatedPx += logical.magnitudePx
    if (eventCount < 2 || accumulatedPx < triggerPx) {
      return 'none'
    }

    accumulatedPx = 0
    eventCount = 0
    latched = true
    cooldownUntilMs = now + cooldownMs
    return logical.direction
  }

  return { handle, resetAccumulation, reset }
}
