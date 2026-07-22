import { useCallback, useState } from 'react'
import { bookOutlineHeadingFoldKey } from '../utils/bookOutlineVisibility'

/**
 * Book全体Outline の local fold state hook。
 *
 * fold は右ペイン表示だけを畳む renderer 内 state で、保存 / project metadata へは書き込まない。
 * - 章 root の fold: `chapter.relativePath` を key に章内見出しを全て隠す。
 * - 見出しの fold: `relativePath + headingIndex` を key に配下の子見出しを隠す。
 */
export function useBookOutlineFold() {
  const [foldedChapters, setFoldedChapters] = useState<Set<string>>(() => new Set())
  const [foldedHeadings, setFoldedHeadings] = useState<Set<string>>(() => new Set())

  const toggleChapterFold = useCallback((relativePath: string) => {
    setFoldedChapters((prev) => {
      const next = new Set(prev)
      if (next.has(relativePath)) next.delete(relativePath)
      else next.add(relativePath)
      return next
    })
  }, [])

  const toggleHeadingFold = useCallback((relativePath: string, headingIndex: number) => {
    const key = bookOutlineHeadingFoldKey(relativePath, headingIndex)
    setFoldedHeadings((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  return { foldedChapters, foldedHeadings, toggleChapterFold, toggleHeadingFold }
}
