import type { BookOutlineHeading } from '../../project/bookFullOutlineQuery'

/**
 * Book全体Outline の local fold / 可視判定 pure helper。
 *
 * fold は右ペイン Book全体Outline の表示状態だけを畳む（中央本文・PM doc fold には影響しない）。
 * 章 root の fold は章内見出しを全て隠し、見出しの fold は単文書 Outline と同じく
 * その見出し配下（より深い level）の子見出しを隠す。
 *
 * key は保存・project metadata へ書き込まず、renderer 内の表示状態としてのみ使う。
 */

/** fold key の区切り。path に現れない NUL（既存 helper の key 生成と同じ慣習）。 */
const FOLD_KEY_SEPARATOR = '\u0000'

/** 見出し fold key（章相対 path + 章内 headingIndex の安定キー）。 */
export function bookOutlineHeadingFoldKey(
  chapterRelativePath: string,
  headingIndex: number,
): string {
  return `${chapterRelativePath}${FOLD_KEY_SEPARATOR}${headingIndex}`
}

export type VisibleBookOutlineHeading = {
  heading: BookOutlineHeading
  /** この見出し自身が畳まれている（子を隠している）か。 */
  folded: boolean
}

/**
 * 章内見出しのうち、畳まれた祖先見出しの配下を隠した可視リストを返す（pure）。
 * 単文書 Outline の resolveVisibleOutlineItems と同じ祖先 fold ロジックを、
 * Book全体Outline の key ベース fold に合わせたもの。
 */
export function resolveVisibleBookHeadings(
  headings: readonly BookOutlineHeading[],
  chapterRelativePath: string,
  foldedHeadingKeys: ReadonlySet<string>,
): VisibleBookOutlineHeading[] {
  const visible: VisibleBookOutlineHeading[] = []
  const foldedAncestorLevels: number[] = []

  for (const heading of headings) {
    while (
      foldedAncestorLevels.length > 0 &&
      foldedAncestorLevels[foldedAncestorLevels.length - 1] >= heading.level
    ) {
      foldedAncestorLevels.pop()
    }

    if (foldedAncestorLevels.length === 0) {
      const folded = foldedHeadingKeys.has(
        bookOutlineHeadingFoldKey(chapterRelativePath, heading.headingIndex),
      )
      visible.push({ heading, folded })
      if (folded) foldedAncestorLevels.push(heading.level)
    }
  }

  return visible
}
