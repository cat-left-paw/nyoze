import type { MutableRefObject } from 'react'

/** Live snapshot read by EditorCore Typewriter getters (updated each App render). */
export type TypewriterRuntimeSnapshot = {
  enabled: boolean
  offsetRatio: number
  followBandRatio: number
  sourceModeActive: boolean
  /** Hidden settings.json; macOS Arrow scroll clamp (not Typewriter). */
  macosArrowScrollClampEnabled: boolean
  /** Visual Focus Phase 1 block highlight (not Typewriter scroll). */
  visualFocusBlockHighlightEnabled: boolean
  /** Visual Focus Phase 2 dim non-focused blocks (not Typewriter scroll). */
  visualFocusDimNonFocusedBlocksEnabled: boolean
  /** Visual Focus Phase 3: highlight fill color (`#rgb` / `#rrggbb`). */
  visualFocusBlockHighlightColor: string
  visualFocusBlockHighlightOpacity: number
  visualFocusDimNonFocusedBlocksOpacity: number
  /** Visual Focus Phase 5: current line overlay (WYSIWYG; not Typewriter scroll). */
  visualFocusCurrentLineHighlightEnabled: boolean
  visualFocusCurrentLineHighlightColor: string
  visualFocusCurrentLineHighlightOpacity: number
}

export type TypewriterRuntimeRef = MutableRefObject<TypewriterRuntimeSnapshot>
