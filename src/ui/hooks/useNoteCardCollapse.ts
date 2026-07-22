import { useCallback, useEffect, useState } from 'react'

/**
 * 付箋カード全体の折りたたみ状態を note id 単位で管理する（UI-only、永続化なし）。
 * active file 変更 / notes reload で存在しない id は除去し、残る id は維持する。
 */

type UseNoteCardCollapseOptions = {
  /** 現在表示中の note id 群。未確定 (loading 等) は null = prune を行わない。 */
  presentNoteIds: ReadonlySet<string> | null
}

export function useNoteCardCollapse({ presentNoteIds }: UseNoteCardCollapseOptions) {
  const [collapsedNoteIds, setCollapsedNoteIds] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    if (presentNoteIds === null) return
    setCollapsedNoteIds((current) => {
      let changed = false
      const next = new Set<string>()
      for (const id of current) {
        if (presentNoteIds.has(id)) {
          next.add(id)
        } else {
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [presentNoteIds])

  const isCardCollapsed = useCallback(
    (id: string) => collapsedNoteIds.has(id),
    [collapsedNoteIds],
  )

  const toggleCardCollapsed = useCallback((id: string) => {
    setCollapsedNoteIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  return { collapsedNoteIds, isCardCollapsed, toggleCardCollapsed }
}
