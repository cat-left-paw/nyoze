import { useCallback, useEffect, useRef } from 'react'
import type { WritingMode } from '../../settings/types'
import {
  createEditorBoundaryScrollScheduler,
  type EditorBoundaryScrollRequest,
} from '../utils/editorBoundaryScrollScheduler'

type ScheduleEditorBoundaryScrollOptions = {
  getScrollHost: () => HTMLElement | null
  getActiveFilePath: () => string | null
  writingMode: WritingMode
}

/**
 * 章ナビゲーション成功後に、editor surface を論理 boundary へ移動する。
 *
 * `resetEditorScroll` / `restoreEditorScroll` の rAF より後に適用するため、
 * 限定回数の requestAnimationFrame で再試行する。常設 Observer / polling は使わない。
 */
export function useScheduleEditorBoundaryScroll({
  getScrollHost,
  getActiveFilePath,
  writingMode,
}: ScheduleEditorBoundaryScrollOptions) {
  const getScrollHostRef = useRef(getScrollHost)
  const getActiveFilePathRef = useRef(getActiveFilePath)
  const writingModeRef = useRef(writingMode)
  getScrollHostRef.current = getScrollHost
  getActiveFilePathRef.current = getActiveFilePath
  writingModeRef.current = writingMode

  const schedulerRef = useRef<ReturnType<typeof createEditorBoundaryScrollScheduler> | null>(
    null,
  )
  if (!schedulerRef.current) {
    schedulerRef.current = createEditorBoundaryScrollScheduler({
      getScrollHost: () => getScrollHostRef.current(),
      getActiveFilePath: () => getActiveFilePathRef.current(),
      getWritingMode: () => writingModeRef.current,
      scheduleTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
      cancelTimeout: (handle) => window.clearTimeout(handle),
      scheduleFrame: (callback) => window.requestAnimationFrame(callback),
      cancelFrame: (handle) => window.cancelAnimationFrame(handle),
    })
  }

  const scheduleBoundaryScroll = useCallback((request: EditorBoundaryScrollRequest) => {
    schedulerRef.current?.scheduleBoundaryScroll(request)
  }, [])

  const cancelScheduledScroll = useCallback(() => {
    schedulerRef.current?.cancelScheduledScroll()
  }, [])

  useEffect(() => cancelScheduledScroll, [cancelScheduledScroll])

  return { scheduleBoundaryScroll, cancelScheduledScroll }
}
