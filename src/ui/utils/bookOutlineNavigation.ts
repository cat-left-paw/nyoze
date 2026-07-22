import { normalizeHeadingText } from '../../editor-core/io/markdownHeadings'
import type { BookOutlineHeading } from '../../project/bookFullOutlineQuery'

/**
 * Book全体Outline の見出しジャンプ: best-effort で対象 doc 内の見出し位置を解決する pure helper。
 *
 * read-only。対象ファイルを書き換えず、Markdown heading text / level と章内の順序情報だけで、
 * 開いた doc（PM doc 由来の HeadingInfo）から PM pos を推定する。
 *
 * 照合の優先順位:
 * 1. level 一致 + 正規化テキスト一致の中から occurrenceIndex 番目。
 * 2. テキストが一致しない（インライン記法差など）場合は、全見出し中の headingIndex で
 *    順序 fallback（level も一致するものを優先）。
 * 3. それでも決まらなければ null（呼び出し側は jump せず開くだけに留める）。
 */

/** PM doc 由来の見出し（editor-core の HeadingInfo と構造一致）。 */
export type DocumentHeading = {
  level: number
  text: string
  pos: number
}

export function resolveHeadingTargetPos(
  documentHeadings: readonly DocumentHeading[],
  target: BookOutlineHeading,
): number | null {
  if (documentHeadings.length === 0) return null

  const wantedText = normalizeHeadingText(target.text)

  // 1) level + 正規化テキスト一致の occurrenceIndex 番目。
  const textMatches = documentHeadings.filter(
    (heading) =>
      heading.level === target.level && normalizeHeadingText(heading.text) === wantedText,
  )
  if (textMatches.length > 0) {
    const pick = textMatches[Math.min(target.occurrenceIndex, textMatches.length - 1)]
    return pick.pos
  }

  // 2) order fallback（同 index）。level も一致するものを優先。
  const byIndex = documentHeadings[target.headingIndex]
  if (byIndex && byIndex.level === target.level) return byIndex.pos
  if (byIndex) return byIndex.pos

  return null
}

/**
 * 現在位置ハイライト用の逆引き: 現在 doc のキャレットが属する見出し
 * （`activeHeadingIndex` が指す PM doc 見出し）に対応する、Book全体Outline 章内見出しの
 * `headingIndex` を best-effort で返す。
 *
 * 必ず **current chapter の見出し配列だけ** を渡すこと。別章の見出しを誤って active に
 * しないため、照合は現在章内に閉じる。
 *
 * 照合の優先順位（{@link resolveHeadingTargetPos} の逆方向）:
 * 1. level 一致 + 正規化テキスト一致 + 同一 (level, text) 中の出現順一致。
 * 2. テキスト不一致時は、章内 headingIndex の order fallback（同 index）。
 * 3. それでも決まらなければ null（呼び出し側は章 root のみ強調）。
 */
export function resolveActiveBookHeadingIndex(
  documentHeadings: readonly DocumentHeading[],
  activeHeadingIndex: number,
  chapterHeadings: readonly BookOutlineHeading[],
): number | null {
  if (activeHeadingIndex < 0 || activeHeadingIndex >= documentHeadings.length) return null

  const active = documentHeadings[activeHeadingIndex]
  const wantedText = normalizeHeadingText(active.text)

  // active 見出しが、同一 (level, 正規化 text) 中で何番目の出現かを数える。
  let activeOccurrence = 0
  for (let i = 0; i < activeHeadingIndex; i++) {
    const h = documentHeadings[i]
    if (h.level === active.level && normalizeHeadingText(h.text) === wantedText) {
      activeOccurrence += 1
    }
  }

  // 1) level + 正規化テキスト + 出現順一致。
  const match = chapterHeadings.find(
    (h) =>
      h.level === active.level &&
      normalizeHeadingText(h.text) === wantedText &&
      h.occurrenceIndex === activeOccurrence,
  )
  if (match) return match.headingIndex

  // 2) order fallback（章内 headingIndex は配列 index と一致する）。
  const byIndex = chapterHeadings[activeHeadingIndex]
  if (byIndex) return byIndex.headingIndex

  return null
}
