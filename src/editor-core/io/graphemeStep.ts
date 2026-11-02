/**
 * 「書記素の 1 歩」: コードポイント 1 つ＋後ろに続く異体字セレクタ。
 *
 * ProseMirror の位置は UTF-16 のコード単位なので、caret を「1 字ぶん」動かすときに `± 1` や `± 2` の
 * 固定の数を使うと、サロゲートペア（拡張B 以降の漢字・U+E0100–E01EF の異体字セレクタ）の内側や、
 * 漢字と異体字セレクタの間に着いてしまう。そこへ文字を入れると、孤立したサロゲートができて原稿が壊れる。
 * この module は、前向き・後ろ向きの 1 歩の UTF-16 の長さと、1 歩の数（親文字の字数）を求める。
 *
 * 規則（`Intl.Segmenter` は使わない。結合文字や絵文字の扱いを広げないため）:
 * - 1 歩 = 異体字セレクタでないコードポイント 1 つ＋その直後に続くすべての異体字セレクタ。
 * - 異体字セレクタ: VS1–16（U+FE00–FE0F）、VS17–256（U+E0100–E01EF）。
 * - 先頭に異体字セレクタしかない（直前に漢字がない）場合は、続くセレクタをまとめて 1 歩とする（長さが 0 にならない）。
 * - 文字列の範囲外では 0。
 */

export function isVariationSelectorCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    (codePoint >= 0xe0100 && codePoint <= 0xe01ef)
  )
}

const codePointUnits = (codePoint: number): number => (codePoint > 0xffff ? 2 : 1)

/** `text` の `index` から始まる 1 歩の UTF-16 の長さ。`index` が範囲外なら 0。 */
export function graphemeStepLengthForward(text: string, index: number): number {
  if (index < 0 || index >= text.length) return 0
  let cursor = index + codePointUnits(text.codePointAt(index) as number)
  while (cursor < text.length) {
    const next = text.codePointAt(cursor) as number
    if (!isVariationSelectorCodePoint(next)) break
    cursor += codePointUnits(next)
  }
  return cursor - index
}

/** `index` の直前で終わる 1 歩の UTF-16 の長さ（`text` の末尾なら `text.length` を渡す）。`index <= 0` なら 0。 */
export function graphemeStepLengthBackward(text: string, index: number): number {
  const end = Math.min(index, text.length)
  if (end <= 0) return 0
  let cursor = end
  while (cursor > 0) {
    const pairStart =
      cursor >= 2 && isLowSurrogate(text.charCodeAt(cursor - 1)) && isHighSurrogate(text.charCodeAt(cursor - 2))
    cursor -= pairStart ? 2 : 1
    if (!isVariationSelectorCodePoint(text.codePointAt(cursor) as number)) break
  }
  return end - cursor
}

/** 1 歩の数（異体字セレクタでないコードポイントの数）。IVS 付きの漢字 1 字は 1。 */
export function countGraphemeSteps(text: string): number {
  let count = 0
  for (const char of text) {
    if (!isVariationSelectorCodePoint(char.codePointAt(0) as number)) count += 1
  }
  return count
}

function isHighSurrogate(unit: number): boolean {
  return unit >= 0xd800 && unit <= 0xdbff
}

function isLowSurrogate(unit: number): boolean {
  return unit >= 0xdc00 && unit <= 0xdfff
}
