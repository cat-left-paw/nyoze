import type { EditorState } from '@tiptap/pm/state'
import type {
  RubyEditContext,
  SelectionRange,
} from '../types'

type RubySpan = {
  /** ノード外側開始位置（pos） */
  from: number
  /** ノード外側終了位置（pos + nodeSize） */
  to: number
  /** ルビノード内の表示本文 */
  text: string
  ruby: string
  hasDelimiter: boolean
}

function collectOverlappingRubySpans(state: EditorState, range: SelectionRange): RubySpan[] {
  const spans: RubySpan[] = []
  if (range.from === range.to) return spans
  state.doc.nodesBetween(range.from, range.to, (node, pos) => {
    if (node.type.name !== 'aozoraRuby') return
    const outerFrom = pos
    const outerTo = pos + node.nodeSize
    // 内側範囲で重なり判定（選択が内側にある場合も検出する）
    const innerFrom = pos + 1
    const innerTo = pos + node.nodeSize - 1
    if (innerTo <= range.from || innerFrom >= range.to) return
    spans.push({
      from: outerFrom,
      to: outerTo,
      text: node.textContent ?? '',
      ruby: (node.attrs.ruby as string | undefined) ?? '',
      hasDelimiter: (node.attrs.hasDelimiter as boolean | undefined) ?? true,
    })
  })
  return spans
}

function expandRangeByRubySpans(range: SelectionRange, spans: RubySpan[]): SelectionRange {
  if (spans.length === 0) return range
  let from = range.from
  let to = range.to
  for (const span of spans) {
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

  // 既存ルビがある場合、表示本文はルビノードの textContent から取得する
  // （textBetween だとルビ記法のテキスト化が混入しうるため）
  let text: string
  if (overlapping.length > 0) {
    // 拡張範囲全体から表示テキストを収集
    // 非ルビ部分は textBetween、ルビ部分は span.text を使う
    const parts: string[] = []
    let cursor = expanded.from
    for (const span of overlapping) {
      if (cursor < span.from) {
        parts.push(state.doc.textBetween(cursor, span.from, ''))
      }
      parts.push(span.text)
      cursor = span.to
    }
    if (cursor < expanded.to) {
      parts.push(state.doc.textBetween(cursor, expanded.to, ''))
    }
    text = parts.join('')
  } else {
    text = state.doc.textBetween(expanded.from, expanded.to, '')
  }
  if (!text) return null

  let ruby = ''
  let hasDelimiter = true
  if (overlapping.length > 0) {
    const nonEmpty = overlapping.map((span) => span.ruby.trim()).filter((value) => value.length > 0)
    if (nonEmpty.length > 0) {
      const first = nonEmpty[0]
      if (first && nonEmpty.every((value) => value === first)) {
        ruby = first
      }
    }
    // 単一ルビノードの場合、hasDelimiter を引き継ぐ
    if (overlapping.length === 1) {
      hasDelimiter = overlapping[0].hasDelimiter
    }
  }

  return {
    from: expanded.from,
    to: expanded.to,
    text,
    ruby,
    overlapsExistingRuby: overlapping.length > 0,
    hasDelimiter,
  }
}
