/** writing-mode共通Arrow state。mapping自体はimport-0 moduleを正本とする。 */
import type { EditorState } from '@tiptap/pm/state'
export * from './writingModeNavigationMapping'

type GraphemeSegment = { segment: string; index: number }

function segmentGraphemes(text: string): GraphemeSegment[] | null {
  const Segmenter = (Intl as typeof Intl & {
    Segmenter?: new (
      locales?: string | string[],
      options?: { granularity: 'grapheme' },
    ) => { segment: (value: string) => Iterable<GraphemeSegment> }
  }).Segmenter
  if (!Segmenter) return null
  try {
    return Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(text))
  } catch {
    return null
  }
}

/** writing-mode非依存のextended grapheme caret proof。 */
export function isSafeWritingModeArrowGraphemeCaret(
  state: EditorState,
  pos: number,
): boolean {
  let $pos
  try {
    $pos = state.doc.resolve(pos)
  } catch {
    return false
  }
  const nodeBefore = $pos.nodeBefore
  const nodeAfter = $pos.nodeAfter
  if (
    !nodeBefore?.isText || !nodeAfter?.isText ||
    typeof nodeBefore.text !== 'string' || typeof nodeAfter.text !== 'string'
  ) return true
  const beforeText = nodeBefore.text
  const afterText = nodeAfter.text
  const caretOffset = beforeText.length
  const segments = segmentGraphemes(beforeText + afterText)
  if (!segments) return false
  return segments.some(
    (item) => item.index === caretOffset || item.index + item.segment.length === caretOffset,
  )
}
