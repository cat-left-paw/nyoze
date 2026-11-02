import { useEffect, useRef, type RefObject } from 'react'
import { createEditorSurfaceHeightSync } from '../utils/editorSurfaceHeightSync'

/**
 * EDITOR-VERTICAL-LAYOUT-FIX1: `.editor-panel` の ref を返し、その要素が mount されている間だけ
 * content box の高さを `.editor-surface-frame` の高さ（px）へ写す。監視の理由と契約は
 * `utils/editorSurfaceHeightSync.ts` に記す。Workspace は ref を `.editor-panel` へ付けるだけ。
 */
export function useEditorSurfaceHeightSync(onHeightChanged?: () => void): RefObject<HTMLDivElement> {
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const sync = createEditorSurfaceHeightSync(panel, onHeightChanged)
    return () => sync?.dispose()
  }, [onHeightChanged])
  return panelRef
}
