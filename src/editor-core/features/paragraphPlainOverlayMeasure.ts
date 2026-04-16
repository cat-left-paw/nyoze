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
