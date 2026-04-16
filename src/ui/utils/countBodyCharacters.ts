import { splitLeadingFrontmatter } from '../../editor-core/io/frontmatter'

/**
 * frontmatter を除いた本文の Unicode コードポイント数を返す。
 *
 * BETA-SP10: Array.from(str) は N 要素の配列を生成するため、大文書では
 * メモリ負荷が高い。for...of ループで配列生成せずにカウントする。
 */
export function countBodyCharacters(markdown: string): number {
  const { body } = splitLeadingFrontmatter(markdown)
  let n = 0
  // for...of は Unicode コードポイント単位で反復する（サロゲートペアも 1 文字扱い）
  for (const _ of body) n++ // eslint-disable-line @typescript-eslint/no-unused-vars
  return n
}
