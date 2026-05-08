import type { TypewriterWritingMode } from './typewriterScroll'

export const TYPEWRITER_SCROLL_PAST_END_RATIO = 0.85

export type TypewriterScrollPastEndDirection = 'bottom' | 'left' | 'right'

export function resolveTypewriterScrollPastEndDirection(
  writingMode: TypewriterWritingMode,
): TypewriterScrollPastEndDirection {
  if (writingMode === 'horizontal-tb') return 'bottom'
  if (writingMode === 'vertical-lr') return 'right'
  return 'left'
}

export function shouldEnableTypewriterScrollPastEnd(context: {
  enabled: boolean
  isParagraphPlainActive: boolean
  isSourceModeActive: boolean
}): boolean {
  return (
    context.enabled &&
    !context.isParagraphPlainActive &&
    !context.isSourceModeActive
  )
}
