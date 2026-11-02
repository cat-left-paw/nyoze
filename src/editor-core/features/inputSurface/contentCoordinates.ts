/**
 * PIS-S10-PREEDIT-FOLLOW1: 入力面は、scrollするhost（`.editor-surface`）の子の`position: absolute`で、内容の座標へ置く。
 * こうするとブラウザ自身が、変換中のscroll（wheel・標準のcaret reveal）で入力中の文字を本文と一緒に動かす。
 * JavaScriptの追従・変換中のreveal・timerは持たない。
 *
 * 配置の計算は、これまでどおりviewportの座標（`getBoundingClientRect()`・`Range`の矩形）で読み、
 * **書き込みの直前に**このmoduleで内容の座標へ変換する。読み取りをすべて終えてから書く順序は変えない
 * （`EDITOR-INPUT-PERF3`のE。Layoutを増やさない）。
 *
 * 絶対配置の子の`left` / `top` / `right`は、scroll host（`position: relative`）のpadding boxを基準に、
 * 内容と一緒にscrollする。縦書きでは`scrollLeft`が0以下で、内容は左へ伸びる。
 *   - 基準の左端（viewport）= host矩形の左 + `clientLeft` − `scrollLeft`
 *   - 基準の右端（viewport）= その左端 + `clientWidth`
 */
export type ContentOrigin = {
  /** 内容の座標の原点（`left`の基準）のviewport上のx。 */
  readonly x: number
  /** 同じく`top`の基準のviewport上のy。 */
  readonly y: number
  /** `right`の基準（padding boxの右端）のviewport上のx。 */
  readonly right: number
}

export type ContentOriginMetrics = {
  readonly left: number
  readonly top: number
  readonly clientLeft: number
  readonly clientTop: number
  readonly clientWidth: number
  readonly scrollLeft: number
  readonly scrollTop: number
}

export function contentOriginFromMetrics(metrics: ContentOriginMetrics): ContentOrigin {
  const x = metrics.left + metrics.clientLeft - metrics.scrollLeft
  return {
    x,
    y: metrics.top + metrics.clientTop - metrics.scrollTop,
    right: x + metrics.clientWidth,
  }
}

/** 配置の読み取りの1回分。書き込みの前に、ほかの読み取りと一緒に呼ぶ。 */
export function readContentOrigin(scrollHost: HTMLElement): ContentOrigin {
  const rect = scrollHost.getBoundingClientRect()
  return contentOriginFromMetrics({
    left: rect.left, top: rect.top, clientLeft: scrollHost.clientLeft, clientTop: scrollHost.clientTop,
    clientWidth: scrollHost.clientWidth, scrollLeft: scrollHost.scrollLeft, scrollTop: scrollHost.scrollTop,
  })
}

export const toContentLeft = (origin: ContentOrigin, viewportX: number) => viewportX - origin.x
export const toContentTop = (origin: ContentOrigin, viewportY: number) => viewportY - origin.y
/** 縦書きの先頭の列の右端（viewportのx）を、`right`の値へ。 */
export const toContentRight = (origin: ContentOrigin, viewportLineEnd: number) => origin.right - viewportLineEnd

export type ContentRect = { left: number; right: number; top: number; bottom: number }
/** viewportの矩形を内容の座標へ。 */
export const toContentRect = (origin: ContentOrigin, rect: ContentRect): ContentRect => ({
  left: rect.left - origin.x, right: rect.right - origin.x, top: rect.top - origin.y, bottom: rect.bottom - origin.y,
})
/** 内容の座標の行末（縦書きの先頭の列の右端）を、`right`の値へ。 */
export const rightFromContentLineEnd = (origin: ContentOrigin, contentLineEnd: number) => origin.right - origin.x - contentLineEnd
