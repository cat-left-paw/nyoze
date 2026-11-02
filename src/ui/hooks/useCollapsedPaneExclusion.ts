import { useLayoutEffect, type RefObject } from 'react'
import { applyCollapsedPaneExclusion } from '../utils/collapsedPaneExclusion'

/**
 * 閉じたペインへ `inert` を同期し、その subtree 内に残った focus だけを
 * 可視 fallback（header の pane toggle）へ移す。paint 前に完了させるため
 * `useLayoutEffect` を使う（Page Viewer の closed-panel `useEffect` より前倒し）。
 */
export function useCollapsedPaneExclusion(
  open: boolean,
  paneRef: RefObject<HTMLElement | null>,
  fallbackSelector: string,
): void {
  useLayoutEffect(() => {
    applyCollapsedPaneExclusion({
      collapsed: !open,
      pane: paneRef.current,
      fallback: document.querySelector<HTMLElement>(fallbackSelector),
      activeElement:
        document.activeElement instanceof HTMLElement ? document.activeElement : null,
      windowFocused: document.hasFocus(),
    })
  }, [open, paneRef, fallbackSelector])
}
