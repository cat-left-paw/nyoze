import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import {
  createTabDragController,
  IDLE_TAB_DRAG_VIEW,
  type TabDragController,
  type TabDragView,
} from '../utils/tabDragController'
import type { TabReorderRequest } from '../utils/tabReorder'

/**
 * EDITOR-TAB-REORDER1: タブ列の drag による並べ替え。
 * 状態機械・挿入位置の計算・window の listener は `tabDragController.ts` にあり、ここは React との接続
 * （挿入位置の表示 state、unmount での後始末）だけ。並べ替えの確定は `onReorderTab`（共通の setter を通す）。
 */
export function useEditorTabDrag(onReorderTab: (request: TabReorderRequest) => void) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const [view, setView] = useState<TabDragView>(IDLE_TAB_DRAG_VIEW)
  const commitRef = useRef(onReorderTab)
  useLayoutEffect(() => {
    commitRef.current = onReorderTab
  }, [onReorderTab])
  const controllerRef = useRef<TabDragController | null>(null)
  if (controllerRef.current === null) {
    controllerRef.current = createTabDragController({
      getList: () => listRef.current,
      onView: setView,
      onCommit: (request) => commitRef.current(request),
    })
  }
  useEffect(() => () => controllerRef.current?.destroy(), [])

  const onTabPointerDown = (event: ReactPointerEvent<HTMLElement>, tabId: string) => {
    controllerRef.current?.onTabPointerDown(event.nativeEvent, event.currentTarget, tabId)
  }
  return { listRef, view, onTabPointerDown }
}
