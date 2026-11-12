/**
 * EDITOR-RUBY-OVERLAY-P0: 層の読みへ写す style の一覧（正本）。
 *
 * 今の読み（`.tategaki-aozora-ruby-rt`）は、親文字の要素から次を継いでいる。層の読みは別の場所にあるので、写す。
 * 値は、DOM に残してある読みの要素（`display: none`）の computed style から読む。親文字の要素の style（フォント・太さ・斜体・
 * 色・字間・見出しの大きさ・リンクの色）をそのまま継ぐので、書式の mark ごとの規則を持たない。
 * - `font-size`: 読みの大きさ（`--editor-ruby-size` × 親文字）。見出しの中のルビも、親文字の大きさから決まる。
 * - `letter-spacing`: PM の root が `0.02em` を絶対値（px）として子孫へ継がせる。写し忘れると読みの長さが最大 4 px 違う。
 * - `writing-mode` / `text-orientation`: `.editor-panel[data-writing-mode]` の規則が読みへ与える値。
 *
 * この一覧に足りない項目があると、読みの形が本文の読みと違う。書式・表示の機能を足すときは、`tests/e2e/editor-ruby-overlay-p0-a.spec.ts`
 * の「写す項目」の試験（flag OFF の読みの computed style と 1 つずつ一致）で確かめる。
 * 読みの `line-height`（1.2）・`white-space: nowrap` は CSS が固定で与えるので、ここでは扱わない。
 * `opacity`（Visual Focus の薄さ）は block の `opacity` なので、親文字の祖先から別に求める（`effectiveOpacity`）。
 */
export const COPIED_STYLE_PROPERTIES = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'font-stretch',
  'font-kerning',
  'font-feature-settings',
  'font-variation-settings',
  'font-optical-sizing',
  'font-size-adjust',
  'font-variant-ligatures',
  'font-variant-caps',
  'font-variant-numeric',
  'font-variant-east-asian',
  'font-variant-position',
  'font-variant-alternates',
  'letter-spacing',
  'word-spacing',
  'text-transform',
  'text-rendering',
  'text-spacing-trim',
  'text-orientation',
  'writing-mode',
  'color',
] as const

export type CopiedStyleProperty = (typeof COPIED_STYLE_PROPERTIES)[number]

/**
 * 写す項目（computed style の値）から、層の読みの `style.cssText` の前半を作る（pure）。
 * 位置（`left` / `top` / `transform`）と `opacity` は別に書く。
 */
export function buildCopiedCssText(values: ReadonlyMap<string, string> | Record<string, string>, omit?: ReadonlySet<string>): string {
  const get = (name: string) => (values instanceof Map ? values.get(name) : (values as Record<string, string>)[name])
  let text = 'position:absolute;margin:0;padding:0;white-space:nowrap;line-height:1.2;'
  for (const name of COPIED_STYLE_PROPERTIES) {
    if (omit?.has(name)) continue
    const value = get(name)
    if (value) text += `${name}:${value};`
  }
  return text
}

/**
 * 読みの `font-size`（px）。`--editor-ruby-size` は、親文字（ルビの要素）に対する比（設定の反映は `${rubySize}em`）。
 * `em` / `px` / `rem` / `%` を受ける。読めない値のときは既定の 0.5em（`styles.css` の `--editor-ruby-size`）。
 */
export function resolveReadingFontSize(rawRubySize: string, baseFontSizePx: number, win: { getComputedStyle(el: Element): { fontSize: string }; document: { documentElement: Element } }): number {
  const match = /^\s*(-?\d*\.?\d+)\s*(em|px|rem|%)?\s*$/.exec(rawRubySize)
  if (!match) return baseFontSizePx * 0.5
  const amount = parseFloat(match[1]!)
  switch (match[2]) {
    case 'px': return amount
    case 'rem': return amount * parseFloat(win.getComputedStyle(win.document.documentElement).fontSize)
    case '%': return (amount / 100) * baseFontSizePx
    default: return amount * baseFontSizePx
  }
}
