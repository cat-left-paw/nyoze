import type { WritingMode } from '../../settings/types'

export type EditorScrollBoundary = 'start' | 'end'

export type EditorScrollHostMetrics = Pick<
  HTMLElement,
  'scrollTop' | 'scrollLeft' | 'scrollHeight' | 'clientHeight' | 'scrollWidth' | 'clientWidth'
>

/**
 * 中央エディタ（`.editor-surface`）の論理的先頭 / 末尾 scroll offset を返す。
 *
 * - 横書き: 縦軸（scrollTop）
 * - 縦書き: 横軸（scrollLeft、Chromium vertical-rl の負方向規約）
 *
 * `computeScrollEdges` / `useEditorScrollEdges` と同じ軸選択を前提とする。
 */
export function resolveEditorBoundaryScrollOffset(
  writingMode: WritingMode,
  host: EditorScrollHostMetrics,
  boundary: EditorScrollBoundary,
): { scrollTop: number; scrollLeft: number } {
  if (writingMode === 'vertical-rl') {
    const maxScroll = Math.max(0, host.scrollWidth - host.clientWidth)
    if (maxScroll <= 0) {
      return { scrollTop: host.scrollTop, scrollLeft: 0 }
    }
    return {
      scrollTop: host.scrollTop,
      scrollLeft: boundary === 'start' ? 0 : -maxScroll,
    }
  }

  const maxScroll = Math.max(0, host.scrollHeight - host.clientHeight)
  if (maxScroll <= 0) {
    return { scrollTop: 0, scrollLeft: host.scrollLeft }
  }
  return {
    scrollTop: boundary === 'start' ? 0 : maxScroll,
    scrollLeft: host.scrollLeft,
  }
}

export function scrollEditorToBoundary(
  host: HTMLElement | null,
  writingMode: WritingMode,
  boundary: EditorScrollBoundary,
): void {
  if (!host) return
  const next = resolveEditorBoundaryScrollOffset(writingMode, host, boundary)
  host.scrollTop = next.scrollTop
  host.scrollLeft = next.scrollLeft
}
