import type { OwnerCommitReceipt } from './editOwner'
import type { SurfaceContent } from './reconversionState'
import { parseComputedColor, resolveOpaqueBackdrop, type Rgba } from './surfaceBackdrop'

/**
 * PIS-RETAINED-TEXT-COLOR1: 確定できずに入力欄に残った文字（保持文字）の表示。
 *
 * 保持文字は本文と同じ色で描かれ、本文に入ったのか入力欄に残っているのかが見た目で分からなかった。
 * 背景の明るさに応じた赤系の色で描き分ける。このmoduleは判断（pure）と、属性の付け外しの1つの関数だけを持つ。
 * 保持の判定そのもの（`failure`、documentActionのbarrierと通知、確定・破棄・コピー）は変えない。
 */

/** 入力欄自身の属性。固定のCSS規則（styles.css）が、あるときだけ保持の色にする。 */
export const RETAINED_TEXT_ATTRIBUTE = 'data-nyoze-input-surface-retained'
/** 入力欄自身の変数。editorのroot・祖先には書かない。下地を求めた同じ場所（surfaceTypography）で書く。 */
export const RETAINED_TEXT_COLOR_VARIABLE = '--nyoze-input-surface-retained-color'
/**
 * 明るい背景に使う濃い赤の列と、暗い背景に使う明るい赤の列（追記1）。どちらも先頭が基本の色で、背景とのcontrast比が
 * 足りないときだけ、先頭から順に次の色へたどる（濃い赤は暗く、明るい赤は明るくなる）。
 */
export const RETAINED_TEXT_DARK_REDS = ['#b3261e', '#a6201a', '#9c1c14', '#8c1610'] as const
export const RETAINED_TEXT_LIGHT_REDS = ['#ff8a80', '#ff9e94', '#ffaba2', '#ffb4ab', '#ffc0b8'] as const
/** 列の先頭の色（側を決めるときの比較と、背景が読めないときの色）。 */
export const RETAINED_TEXT_DARK_RED = RETAINED_TEXT_DARK_REDS[0]
export const RETAINED_TEXT_LIGHT_RED = RETAINED_TEXT_LIGHT_REDS[0]
/** 保持の色に求める、背景とのcontrast比（WCAG AA）。 */
export const RETAINED_TEXT_MIN_CONTRAST = 4.5

export type RetainedDisplayInput = {
  kind: SurfaceContent['kind']
  text: string
  composing: boolean
  failure: Exclude<OwnerCommitReceipt, 'committed'> | null
}

/**
 * 保持の表示をするか。
 * - 写しは入力欄の文字ではない（再変換のための複写）ので対象外。
 * - 文字がなければ対象外。
 * - 変換中は、`failure`がない通常の変換（preedit）には色を付けない。保持文字の上で変換を始めた場合
 *   （`failure`がある）は、確定しても保持されるので、色を付けたままにする。
 * - `failure`が`null`でも、変換中でなく文字があれば保持として扱う（documentActionの`unclassified-retained-text`と同じ）。
 *
 * 出来事の途中（入力面に文字が入ってからownerへ確定するまで）は、まだ分類されていない文字がある。この関数は出来事が落ち着いた
 * 状態にだけ使う（呼ぶ側が、入口を抜けるときに1回だけ呼ぶ）。途中の状態で呼ぶと、成功する入力の1打ごとに属性が付いて外れる。
 */
export function isSurfaceTextRetainedForDisplay(input: RetainedDisplayInput): boolean {
  return input.kind !== 'mirror' && input.text.length > 0 && (!input.composing || input.failure !== null)
}

const channel = (value: number) => {
  const v = value / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const luminance = (color: Rgba) => 0.2126 * channel(color[0]) + 0.7152 * channel(color[1]) + 0.0722 * channel(color[2])
/** WCAGのcontrast比。不透明な色だけを扱う。 */
export function contrastRatioOf(first: Rgba, second: Rgba): number {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

/** `#rrggbb`の0〜255表記（`parseComputedColor`は計算後の`rgb()`だけを読み、hexは読めない）。unitで逆変換と一致を固定する。 */
function hexToRgba(hex: string): Rgba {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 1]
}
export const RETAINED_TEXT_DARK_RED_RGBA: Rgba = hexToRgba(RETAINED_TEXT_DARK_RED)
export const RETAINED_TEXT_LIGHT_RED_RGBA: Rgba = hexToRgba(RETAINED_TEXT_LIGHT_RED)
type Candidate = { hex: string; rgba: Rgba }
const DARK_LADDER: Candidate[] = RETAINED_TEXT_DARK_REDS.map(hex => ({ hex, rgba: hexToRgba(hex) }))
const LIGHT_LADDER: Candidate[] = RETAINED_TEXT_LIGHT_REDS.map(hex => ({ hex, rgba: hexToRgba(hex) }))
const DARK_RED = RETAINED_TEXT_DARK_RED_RGBA
const LIGHT_RED = RETAINED_TEXT_LIGHT_RED_RGBA

/**
 * 保持文字が描かれる背景から、保持の色を決める。
 * - 背景が読める（不透明）とき:
 *   1. 側を決める。2つの列の先頭の色のうち、背景とのcontrast比が大きいほうの列（同じなら濃い赤）。
 *   2. その列を先頭から順にたどり、contrast比が4.5以上になる最初の色。
 *   3. どれも4.5に届かなければ、2つの列のすべての色のうち、contrast比がいちばん大きい色（中間の灰色の紙）。
 * - 背景が読めない（parseできない、不透明でない）ときは、本文の文字色とのcontrast比が小さいほうの列の先頭
 *   （本文と同じ明るさの側）。本文の文字色も読めなければ濃い赤。
 * 1打ごとには呼ばない（下地を読み直すときだけ）。
 */
export function resolveRetainedTextColor(background: string, bodyTextColor?: string): string {
  const base = parseComputedColor(background)
  if (base && base[3] >= 1) {
    const ladder = contrastRatioOf(LIGHT_RED, base) > contrastRatioOf(DARK_RED, base) ? LIGHT_LADDER : DARK_LADDER
    const reached = ladder.find(candidate => contrastRatioOf(candidate.rgba, base) >= RETAINED_TEXT_MIN_CONTRAST)
    if (reached) return reached.hex
    // どの色も届かない: 全候補でcontrast比が最大の色（同じ値なら列の先頭に近い色、濃い赤の列が先）。
    let best: Candidate = DARK_LADDER[0]!, bestContrast = -1
    for (const candidate of [...DARK_LADDER, ...LIGHT_LADDER]) {
      const contrast = contrastRatioOf(candidate.rgba, base)
      if (contrast > bestContrast) { best = candidate; bestContrast = contrast }
    }
    return best.hex
  }
  const body = bodyTextColor === undefined ? null : parseComputedColor(bodyTextColor)
  if (!body || body[3] < 1) return RETAINED_TEXT_DARK_RED
  return contrastRatioOf(LIGHT_RED, body) < contrastRatioOf(DARK_RED, body) ? RETAINED_TEXT_LIGHT_RED : RETAINED_TEXT_DARK_RED
}

/**
 * 保持文字の背景（書式の背景があれば、下地の上に重ねた色）から、保持の色を決める。
 * 書式の背景が半透明なら、下地へ重ねてから比べる（`resolveOpaqueBackdrop`は、表示に使う下地と同じ合成）。
 */
export function resolveRetainedTextColorForSurface(background: string, markBackground: string | undefined, bodyTextColor?: string): string {
  return resolveRetainedTextColor(resolveOpaqueBackdrop(markBackground ? [markBackground] : [], background), bodyTextColor)
}

type AttributeHost = Pick<Element, 'hasAttribute' | 'toggleAttribute'>

/**
 * 属性の付け外しを決める唯一の場所。`failure`・変換中・文字・内容の種類が変わり得る入口（入力面のevent handlerと、
 * 外へ出すAPI）を抜けるときに、1回だけ呼ぶ（`failure`を代入する各所で個別には付け外ししない）。値が変わるときだけ`toggleAttribute`する。
 */
export function createRetainedDisplay(element: AttributeHost, read: () => RetainedDisplayInput) {
  return {
    refresh(): boolean {
      const retained = isSurfaceTextRetainedForDisplay(read())
      if (element.hasAttribute(RETAINED_TEXT_ATTRIBUTE) !== retained) element.toggleAttribute(RETAINED_TEXT_ATTRIBUTE, retained)
      return retained
    },
  }
}
