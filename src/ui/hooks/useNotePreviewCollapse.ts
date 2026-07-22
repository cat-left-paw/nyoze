import { useCallback, useEffect, useState } from 'react'

/**
 * 付箋カード本文 preview の展開状態を note id 単位で管理する。
 * active file 変更 / notes reload で存在しない id は除去し、残る id は維持する。
 */

type UseNotePreviewCollapseOptions = {
  /** 現在表示中の note id 群。未確定 (loading 等) は null = prune を行わない。 */
  presentNoteIds: ReadonlySet<string> | null
}

export function useNotePreviewCollapse({ presentNoteIds }: UseNotePreviewCollapseOptions) {
  const [expandedNoteIds, setExpandedNoteIds] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    if (presentNoteIds === null) return
    setExpandedNoteIds((current) => {
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

  const isPreviewExpanded = useCallback(
    (id: string) => expandedNoteIds.has(id),
    [expandedNoteIds],
  )

  const togglePreviewExpanded = useCallback((id: string) => {
    setExpandedNoteIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  return { expandedNoteIds, isPreviewExpanded, togglePreviewExpanded }
}
