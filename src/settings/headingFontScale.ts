/**
 * EDITOR-HEADING-FONT-SCALE1: 見出しの文字サイズ（本文比 %）。
 *
 * 本文の文字サイズ（`fontSize`）とは別に、見出しだけの大きさを倍率で調整する。
 * 倍率なので、本文のサイズを変えると見出しも比例して変わる。
 * 既定 100% は従来の見た目（エディタは h1 2em〜h6 0.67em、ページビューアは
 * 1.55em〜1em、Web Book は UA 既定）と同じ。
 *
 * renderer の設定 normalize / main の settings sanitizer / ページビューアの payload 検証 /
 * Web Book の写しが、同じ範囲と刻みをこの 1 か所から読む（import 0 の pure module）。
 */

export const DEFAULT_HEADING_FONT_SCALE = 100
export const HEADING_FONT_SCALE_MIN = 50
export const HEADING_FONT_SCALE_MAX = 200
export const HEADING_FONT_SCALE_STEP = 5

/** 範囲内の有限数か（刻みは見ない）。 */
export function isHeadingFontScaleInRange(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= HEADING_FONT_SCALE_MIN &&
    value <= HEADING_FONT_SCALE_MAX
  )
}

/** 範囲内の値を刻み（5）の倍数へ丸める。範囲は呼び出し側が先に確かめる。 */
export function snapHeadingFontScale(value: number): number {
  const snapped = Math.round(value / HEADING_FONT_SCALE_STEP) * HEADING_FONT_SCALE_STEP
  return Math.min(HEADING_FONT_SCALE_MAX, Math.max(HEADING_FONT_SCALE_MIN, snapped))
}

/**
 * 保存された値を読む。数値でない・非有限・範囲外は既定（100）へ、範囲内は刻みへ丸める。
 * key が無い（古い設定）も既定として読む。
 */
export function normalizeHeadingFontScale(value: unknown): number {
  if (!isHeadingFontScaleInRange(value)) return DEFAULT_HEADING_FONT_SCALE
  return snapHeadingFontScale(value)
}

/** CSS の倍率（100 → 1、125 → 1.25）。整数 % を 100 で割るので 1.15 などが 1.1500000000000001 にならない。 */
export function headingFontScaleToRatio(percent: number): number {
  return Math.round(percent) / 100
}
