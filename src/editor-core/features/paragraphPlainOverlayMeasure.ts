export type ParagraphPlainOverlayMeasureReason =
  | 'sync'
  | 'scroll'
  | 'resize'
  | 'input'
  | 'compositionupdate'
  | 'compositionend'
  | 'undo'
  | 'redo'

export const PARAGRAPH_PLAIN_COMPOSING_REMEASURE_THROTTLE_MS = 96

export function shouldRequestParagraphPlainOverlayMeasure(params: {
  reason: ParagraphPlainOverlayMeasureReason
  isComposing: boolean
  lastMeasuredAt: number | null
  now: number
}): boolean {
  if (params.reason === 'scroll') return false
  if (!params.isComposing) return true
  if (
    params.reason === 'resize' ||
    params.reason === 'compositionend' ||
    params.reason === 'sync' ||
    params.reason === 'undo' ||
    params.reason === 'redo'
  ) {
    return true
  }
  if (params.lastMeasuredAt == null) return true
  return (
    params.now - params.lastMeasuredAt >=
    PARAGRAPH_PLAIN_COMPOSING_REMEASURE_THROTTLE_MS
  )
}

/**
 * `input` / `compositionupdate` のような hot path では、cache が有効である
 * 限り full reposition (`positionParagraphPlainOverlay`) を skip する。
 *
 * scroll / resize / sync / undo / redo / compositionend や cache が空の
 * ときは従来どおり position 要求を立てる。
 */
export function shouldRequestParagraphPlainOverlayPosition(params: {
  reason: ParagraphPlainOverlayMeasureReason
  hasCachedBaseRect: boolean
}): boolean {
  if (!params.hasCachedBaseRect) return true
  switch (params.reason) {
    case 'input':
    case 'compositionupdate':
      return false
    default:
      return true
  }
}
