import { useEffect, useRef, useState } from 'react'
import type { EditorTab } from './useAppUiState'
import {
  isBookExportMenuAvailable,
  resolveBookExportTarget,
} from '../utils/resolveBookExportTarget'

type UseBookExportMenuAvailabilityOptions = {
  activeTab: EditorTab
  internalDocActive: boolean
}

/**
 * Toolbar Page Viewer split button 用の Book 対象 availability。
 * native File menu の Book export / Book Page Viewer enabled と同じ判定源を共有する。
 */
export type BookPageViewerToolbarAvailability =
  | { kind: 'checking' }
  | { kind: 'available' }
  | { kind: 'unavailable' }

function syncBookExportMenuAvailable(available: boolean): void {
  window.nyozeBridge?.menu?.setBookExportAvailable(available)
}

/**
 * Book 全体 export / Book Page Viewer メニューの native enabled 状態を main に同期し、
 * toolbar 向けの Book Page Viewer availability を返す。
 * 判定は read-only の `project:resolveBookExportTarget` のみ。dirty / plain mode は無関係。
 */
export function useBookExportMenuAvailability({
  activeTab,
  internalDocActive,
}: UseBookExportMenuAvailabilityOptions): BookPageViewerToolbarAvailability {
  const generationRef = useRef(0)
  const [availability, setAvailability] = useState<BookPageViewerToolbarAvailability>({
    kind: 'unavailable',
  })

  useEffect(() => {
    const generation = ++generationRef.current
    const filePath = activeTab.filePath

    if (internalDocActive || !filePath) {
      syncBookExportMenuAvailable(false)
      setAvailability({ kind: 'unavailable' })
      return
    }

    const bridge = window.nyozeBridge?.project
    if (!bridge) {
      syncBookExportMenuAvailable(false)
      setAvailability({ kind: 'unavailable' })
      return
    }

    syncBookExportMenuAvailable(false)
    setAvailability({ kind: 'checking' })
    void (async () => {
      try {
        const target = await resolveBookExportTarget(bridge, filePath)
        if (generation !== generationRef.current) return
        if (activeTab.filePath !== filePath || internalDocActive) return
        const available = isBookExportMenuAvailable(target)
        syncBookExportMenuAvailable(available)
        setAvailability({ kind: available ? 'available' : 'unavailable' })
      } catch {
        if (generation !== generationRef.current) return
        syncBookExportMenuAvailable(false)
        setAvailability({ kind: 'unavailable' })
      }
    })()
  }, [activeTab.filePath, internalDocActive, activeTab.id])

  return availability
}
