import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PageViewItem } from '../../editor-core/io/pageModelView'
import { clampPageIndex } from './pageViewerColumnMetrics'
import type { PageMoveDirection } from './pageViewerPageNavigation'
import {
  buildPageViewerPageSequence,
  resolvePageViewerPageLocation,
  type PageViewerFlowPageCounts,
  type PageViewerPageLocation,
  type PageViewerPageSequence,
} from './pageViewerPageSequence'

type UsePageViewerPageSequenceInput = {
  items: readonly PageViewItem[]
}

export type UsePageViewerPageSequenceResult = {
  sequence: PageViewerPageSequence
  activeLocation: PageViewerPageLocation | null
  pageIndex: number
  pageCount: number
  flowPageCountRegistrationGeneration: number
  setFlowPageCount: (sectionId: string, pageCount: number) => void
  goToPage: (pageIndex: number) => void
  moveByPage: (direction: PageMoveDirection) => void
}

export function usePageViewerPageSequence({
  items,
}: UsePageViewerPageSequenceInput): UsePageViewerPageSequenceResult {
  const [flowPageCounts, setFlowPageCounts] = useState<PageViewerFlowPageCounts>({})
  // `items` identity変更時のlayout reset後に、childの通常useEffectによる
  // page-count登録を必ずもう一度発火させるためだけの内部generation。PageModel /
  // sequenceの正本やページindexには影響させない。
  const [flowPageCountRegistrationGeneration, setFlowPageCountRegistrationGeneration] = useState(0)
  const [pageIndex, setPageIndex] = useState(0)
  const pageIndexRef = useRef(0)

  useLayoutEffect(() => {
    setFlowPageCounts({})
    setFlowPageCountRegistrationGeneration((current) => current + 1)
    pageIndexRef.current = 0
    setPageIndex(0)
  }, [items])

  const sequence = useMemo(
    () => buildPageViewerPageSequence(items, flowPageCounts),
    [items, flowPageCounts],
  )
  const pageCount = sequence.pageCount

  useLayoutEffect(() => {
    const clamped = clampPageIndex(pageIndexRef.current, pageCount)
    if (clamped === pageIndexRef.current) return
    pageIndexRef.current = clamped
    setPageIndex(clamped)
  }, [pageCount])

  const setFlowPageCount = useCallback((sectionId: string, nextPageCount: number) => {
    const normalized = Math.max(1, Math.floor(Number.isFinite(nextPageCount) ? nextPageCount : 1))
    setFlowPageCounts((current) => {
      if (current[sectionId] === normalized) return current
      return { ...current, [sectionId]: normalized }
    })
  }, [])

  const goToPage = useCallback(
    (nextPageIndex: number) => {
      const clamped = clampPageIndex(nextPageIndex, pageCount)
      if (clamped === pageIndexRef.current) return
      pageIndexRef.current = clamped
      setPageIndex(clamped)
    },
    [pageCount],
  )

  const moveByPage = useCallback(
    (direction: PageMoveDirection) => {
      goToPage(pageIndexRef.current + (direction === 'next' ? 1 : -1))
    },
    [goToPage],
  )

  const activeLocation = useMemo(
    () => resolvePageViewerPageLocation(sequence, pageIndex),
    [sequence, pageIndex],
  )

  return {
    sequence,
    activeLocation,
    pageIndex,
    pageCount,
    flowPageCountRegistrationGeneration,
    setFlowPageCount,
    goToPage,
    moveByPage,
  }
}
