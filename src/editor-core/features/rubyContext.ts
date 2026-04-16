import type { EditorState } from '@tiptap/pm/state'
import type {
  RubyEditContext,
  SelectionRange,
} from '../types'

type RubySpan = {
  from: number
  to: number
  ruby: string
}

function collectOverlappingRubySpans(state: EditorState, range: SelectionRange): RubySpan[] {
  const spans: RubySpan[] = []
  if (range.from === range.to) return spans
  state.doc.nodesBetween(range.from, range.to, (node, pos) => {
    if (node.type.name !== 'aozoraRuby') return
    const from = pos + 1
    const to = pos + node.nodeSize - 1
    if (to <= range.from || from >= range.to) return
    spans.push({
      from,
      to,
      ruby: (node.attrs.ruby as string | undefined) ?? '',
    })
  })
  return spans
}

function expandRangeByRubySpans(range: SelectionRange, spans: RubySpan[]): SelectionRange {
  if (spans.length === 0) return range
  let from = range.from
  let to = range.to
  for (const span of spans) {
    if (span.to <= from || span.from >= to) continue
    from = Math.min(from, span.from)
    to = Math.max(to, span.to)
  }
  return { from, to }
}

export function resolveRubyEditContext(state: EditorState, inputRange: SelectionRange): RubyEditContext | null {
  const initialFrom = Math.min(inputRange.from, inputRange.to)
  const initialTo = Math.max(inputRange.from, inputRange.to)
  if (initialFrom === initialTo) return null

  const overlapping = collectOverlappingRubySpans(state, {
    from: initialFrom,
    to: initialTo,
  })
  const expanded = expandRangeByRubySpans(
    {
      from: initialFrom,
      to: initialTo,
    },
    overlapping,
  )

  const text = state.doc.textBetween(expanded.from, expanded.to, '')
  if (!text) return null

  let ruby = ''
  if (overlapping.length > 0) {
    const nonEmpty = overlapping.map((span) => span.ruby.trim()).filter((value) => value.length > 0)
    if (nonEmpty.length > 0) {
      const first = nonEmpty[0]
      if (first && nonEmpty.every((value) => value === first)) {
        ruby = first
      }
    }
  }

  return {
    from: expanded.from,
    to: expanded.to,
    text,
    ruby,
    overlapsExistingRuby: overlapping.length > 0,
  }
}
