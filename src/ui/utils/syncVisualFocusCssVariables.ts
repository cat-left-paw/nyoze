import {
  buildVisualFocusCurrentLineBackgroundCss,
  buildVisualFocusHighlightBackgroundCss,
  normalizeVisualFocusBlockHighlightColor,
  normalizeVisualFocusBlockHighlightOpacity,
  normalizeVisualFocusCurrentLineHighlightColor,
  normalizeVisualFocusCurrentLineHighlightOpacity,
  normalizeVisualFocusDimNonFocusedBlocksOpacity,
} from '../../settings/visualFocusAppearance'

/** Applied on `:root` / `document.documentElement` for `.ProseMirror` descendants. */
export const VISUAL_FOCUS_CSS_VAR_HIGHLIGHT_BG = '--nyoze-visual-focus-block-highlight-bg'

export const VISUAL_FOCUS_CSS_VAR_DIM_OPACITY = '--nyoze-visual-focus-dim-opacity'

export const VISUAL_FOCUS_CSS_VAR_CURRENT_LINE_BG = '--nyoze-visual-focus-current-line-bg'

export type VisualFocusAppearanceSnapshot = {
  visualFocusBlockHighlightColor: string
  visualFocusBlockHighlightOpacity: number
  visualFocusDimNonFocusedBlocksOpacity: number
  visualFocusCurrentLineHighlightColor: string
  visualFocusCurrentLineHighlightOpacity: number
}

export function applyVisualFocusCssVariables(
  root: HTMLElement | null,
  appearance: VisualFocusAppearanceSnapshot,
): void {
  if (!root) {
    return
  }
  const color = normalizeVisualFocusBlockHighlightColor(appearance.visualFocusBlockHighlightColor)
  const hiOp = normalizeVisualFocusBlockHighlightOpacity(appearance.visualFocusBlockHighlightOpacity)
  const dimOp = normalizeVisualFocusDimNonFocusedBlocksOpacity(
    appearance.visualFocusDimNonFocusedBlocksOpacity,
  )
  const currColor = normalizeVisualFocusCurrentLineHighlightColor(
    appearance.visualFocusCurrentLineHighlightColor,
  )
  const currOp = normalizeVisualFocusCurrentLineHighlightOpacity(
    appearance.visualFocusCurrentLineHighlightOpacity,
  )
  root.style.setProperty(
    VISUAL_FOCUS_CSS_VAR_HIGHLIGHT_BG,
    buildVisualFocusHighlightBackgroundCss(color, hiOp),
  )
  root.style.setProperty(VISUAL_FOCUS_CSS_VAR_DIM_OPACITY, String(dimOp))
  root.style.setProperty(
    VISUAL_FOCUS_CSS_VAR_CURRENT_LINE_BG,
    buildVisualFocusCurrentLineBackgroundCss(currColor, currOp),
  )
}
