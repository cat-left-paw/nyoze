import type { WritingMode } from '../../settings/types'
import {
  scrollEditorToBoundary,
  type EditorScrollBoundary,
} from './editorScrollBoundary'

export const DEFAULT_BOUNDARY_SCROLL_RAF_ATTEMPTS = 8

export type EditorBoundaryScrollRequest = {
  boundary: EditorScrollBoundary
  expectedFilePath: string
}

export type EditorBoundaryScrollSchedulerDeps = {
  getScrollHost: () => HTMLElement | null
  getActiveFilePath: () => string | null
  getWritingMode: () => WritingMode
  scheduleTimeout: (callback: () => void, delayMs: number) => number
  cancelTimeout: (handle: number) => void
  scheduleFrame: (callback: () => void) => number
  cancelFrame: (handle: number) => void
  maxRafAttempts?: number
}

/**
 * 章ナビゲーション後の boundary scroll を、限定 timeout + rAF で予約する。
 *
 * 連続予約では generation token で古い timeout / rAF を無効化する。
 */
export function createEditorBoundaryScrollScheduler(
  deps: EditorBoundaryScrollSchedulerDeps,
) {
  const maxRafAttempts = deps.maxRafAttempts ?? DEFAULT_BOUNDARY_SCROLL_RAF_ATTEMPTS

  let generation = 0
  let pending: EditorBoundaryScrollRequest | null = null
  let timeoutHandle = 0
  let rafHandle = 0

  const cancelScheduledScroll = () => {
    generation += 1
    pending = null
    if (timeoutHandle !== 0) {
      deps.cancelTimeout(timeoutHandle)
      timeoutHandle = 0
    }
    if (rafHandle !== 0) {
      deps.cancelFrame(rafHandle)
      rafHandle = 0
    }
  }

  const runAttempt = (attempt: number, requestGeneration: number) => {
    if (requestGeneration !== generation) return

    const current = pending
    if (!current) return

    const activePath = deps.getActiveFilePath()
    const pathReady = Boolean(activePath && activePath === current.expectedFilePath)

    if (pathReady) {
      const host = deps.getScrollHost()
      if (host) {
        scrollEditorToBoundary(host, deps.getWritingMode(), current.boundary)
      }
    }

    if (attempt + 1 < maxRafAttempts) {
      rafHandle = deps.scheduleFrame(() => runAttempt(attempt + 1, requestGeneration))
      return
    }

    if (requestGeneration === generation) {
      pending = null
    }
    rafHandle = 0
  }

  const scheduleBoundaryScroll = (request: EditorBoundaryScrollRequest) => {
    cancelScheduledScroll()
    const requestGeneration = generation
    pending = request
    timeoutHandle = deps.scheduleTimeout(() => {
      timeoutHandle = 0
      if (requestGeneration !== generation) return
      rafHandle = deps.scheduleFrame(() => runAttempt(0, requestGeneration))
    }, 0)
  }

  return { scheduleBoundaryScroll, cancelScheduledScroll }
}
