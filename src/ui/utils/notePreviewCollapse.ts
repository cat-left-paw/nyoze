/** 付箋カード本文 preview の初期省略行数。 */
export const NOTE_PREVIEW_COLLAPSE_MAX_LINES = 10

/** 行数閾値と併用する文字数フォールバック（約10行相当）。 */
export const NOTE_PREVIEW_COLLAPSE_MIN_CHARS = 480

export function countRawTextLines(rawText: string): number {
  if (rawText.length === 0) return 0
  return rawText.split(/\r?\n/).length
}

/** 省略トグルを出すか。DOM 計測は行わず raw text から簡易判定する。 */
export function shouldOfferPreviewCollapse(rawText: string): boolean {
  if (countRawTextLines(rawText) > NOTE_PREVIEW_COLLAPSE_MAX_LINES) return true
  return rawText.length > NOTE_PREVIEW_COLLAPSE_MIN_CHARS
}
