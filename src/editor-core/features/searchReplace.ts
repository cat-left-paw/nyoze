import type { Fragment, Mark, Node as PMNode } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { TextSelection } from '@tiptap/pm/state'
import { parseMarkdown } from '../io/parseMarkdown'
import type { LineBreakPolicy } from '../types'

// ---------------------------------------------------------------------------
// Search match finding (pure function, exported for tests)
// ---------------------------------------------------------------------------

export type SearchMatch = {
  from: number
  to: number
}

/**
 * Find all occurrences of `query` in the document text content.
 * Walks the PM Doc and maps character offsets to document positions.
 *
 * Returns an array of { from, to } document positions.
 */
export function findMatches(
  doc: PMNode,
  query: string,
  caseSensitive: boolean,
): SearchMatch[] {
  if (!query) return []

  const matches: SearchMatch[] = []
  const normalizedQuery = caseSensitive ? query : query.toLowerCase()
  const queryLen = normalizedQuery.length

  // Collect text segments with their document positions
  // We walk each text block, gather its text and positions, then search
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true // continue into children
    // For each textblock: collect text content and position mapping
    const segments: { text: string; pos: number }[] = []
    let blockText = ''

    node.forEach((child, offset) => {
      if (child.isText && child.text) {
        segments.push({ text: child.text, pos: pos + 1 + offset })
        blockText += child.text
      } else if (child.type.name === 'aozoraRuby') {
        // Ruby node: search on the base text content
        const rubyText = child.textContent
        segments.push({ text: rubyText, pos: pos + 1 + offset + 1 }) // +1 for node open
        blockText += rubyText
      } else if (child.type.name === 'aozoraTcy') {
        const tcyText = child.textContent
        segments.push({ text: tcyText, pos: pos + 1 + offset + 1 })
        blockText += tcyText
      } else {
        // Non-text inline (hard_break, html_inline_atom, etc.)
        // Treat as single character boundary
        blockText += '\uFFFF'
        segments.push({ text: '\uFFFF', pos: pos + 1 + offset })
      }
    })

    const searchText = caseSensitive ? blockText : blockText.toLowerCase()

    let searchFrom = 0
    while (searchFrom <= searchText.length - queryLen) {
      const idx = searchText.indexOf(normalizedQuery, searchFrom)
      if (idx < 0) break

      // Map blockText index to document position
      const docFrom = mapBlockIndexToDocPos(segments, idx)
      const docTo = mapBlockIndexToDocPos(segments, idx + queryLen)

      if (docFrom >= 0 && docTo >= 0) {
        matches.push({ from: docFrom, to: docTo })
      }

      searchFrom = idx + 1
    }

    return false // don't descend into textblock children (already handled)
  })

  return matches
}

/**
 * Map a character index within the concatenated block text to a document position.
 */
function mapBlockIndexToDocPos(
  segments: { text: string; pos: number }[],
  charIndex: number,
): number {
  let consumed = 0
  for (const seg of segments) {
    const segLen = seg.text.length
    if (charIndex < consumed + segLen) {
      return seg.pos + (charIndex - consumed)
    }
    consumed += segLen
  }
  // At the exact end
  if (segments.length > 0) {
    const last = segments[segments.length - 1]
    return last.pos + last.text.length
  }
  return -1
}

// ---------------------------------------------------------------------------
// Inline Markdown replacement helpers
// ---------------------------------------------------------------------------

/**
 * If `replacement` parses as a single paragraph of inline Markdown
 * (bold / italic / strike / highlight / ruby / link / etc.), return its
 * inline content as a Fragment so the caller can insert marks instead of
 * a literal string. Returns null when:
 *   - `replacement` is empty
 *   - it contains a newline (would be multi-block)
 *   - markdown-it produces multiple top-level blocks
 *   - the single top-level block is not a `paragraph` (e.g., heading,
 *     list, blockquote, code block)
 *   - the parsed fragment is just a single unmarked text node identical
 *     to `replacement` (no marks, no inline atoms). In that case we
 *     fall back to `insertText()` so existing surrounding marks
 *     (bold, link, etc.) are preserved at the match position.
 *
 * block 構造化は対象外。inline fragment 化できない場合は呼び出し側で
 * 従来通り `insertText()` にフォールバックする。
 */
function buildInlineFragmentReplacement(
  state: EditorState,
  replacement: string,
  lineBreakPolicy: LineBreakPolicy,
): Fragment | null {
  if (!replacement) return null
  if (replacement.includes('\n')) return null

  let parsedDoc: PMNode
  try {
    parsedDoc = parseMarkdown(state.schema, replacement, lineBreakPolicy)
  } catch {
    return null
  }
  if (parsedDoc.childCount !== 1) return null
  const firstChild = parsedDoc.firstChild
  if (!firstChild) return null
  if (firstChild.type.name !== 'paragraph') return null
  if (!firstChild.type.inlineContent) return null
  const fragment = firstChild.content
  if (isPlainUnmarkedTextFragment(fragment, replacement)) return null
  return fragment
}

function isPlainUnmarkedTextFragment(fragment: Fragment, expected: string): boolean {
  if (fragment.childCount !== 1) return false
  const only = fragment.firstChild
  if (!only) return false
  if (!only.isText) return false
  if (only.marks.length > 0) return false
  return only.text === expected
}

function isPositionInCodeBlock(doc: PMNode, pos: number): boolean {
  if (pos < 0 || pos > doc.content.size) return false
  const $pos = doc.resolve(pos)
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type.name === 'codeBlock') return true
  }
  return false
}

/**
 * Marks of the text node at the start of the match range. Used so that a
 * plain-text replacement inherits the marks of the text being replaced
 * (e.g., replacing "old" inside `**old**` keeps bold). `marksAcross` would
 * drop bold/link here because both are configured `inclusive: false` to
 * prevent mark creep on typing — but search-replace is an explicit range
 * operation where the user expects the existing mark set to survive.
 */
function getMarksAtMatchStart(doc: PMNode, from: number, to: number): readonly Mark[] {
  if (to <= from) return []
  if (from < 0 || from > doc.content.size) return []
  const $from = doc.resolve(from)
  const parent = $from.parent
  if (!parent.inlineContent) return []
  const child = parent.maybeChild($from.index())
  if (!child || !child.isInline) return []
  return child.marks
}

function applyPlainReplacement(
  tr: Transaction,
  schema: EditorState['schema'],
  marksDoc: PMNode,
  match: SearchMatch,
  replacement: string,
): void {
  if (replacement.length === 0) {
    tr.delete(match.from, match.to)
    return
  }
  const marks = getMarksAtMatchStart(marksDoc, match.from, match.to)
  tr.replaceWith(match.from, match.to, schema.text(replacement, marks))
}

// ---------------------------------------------------------------------------
// Replace helpers (pure-ish: they create transactions)
// ---------------------------------------------------------------------------

/**
 * Replace the text at the given match range with `replacement`.
 * Returns the new transaction and the position after replacement.
 *
 * `replacement` が単一段落の inline Markdown として解釈できる場合は
 * parsed Fragment で置換し、`**太字**` などを mark 表示で即時反映する。
 * codeBlock 内、または block / 複数 block / inline fragment として扱えない
 * 場合は従来通りプレーンテキスト挿入にフォールバックする。
 */
export function replaceMatchInDoc(
  state: EditorState,
  match: SearchMatch,
  replacement: string,
  lineBreakPolicy: LineBreakPolicy = 'obsidian-paragraph',
): Transaction {
  const tr = state.tr
  const inCodeBlock = isPositionInCodeBlock(state.doc, match.from)
  const fragment = inCodeBlock
    ? null
    : buildInlineFragmentReplacement(state, replacement, lineBreakPolicy)

  let cursorPos: number
  if (fragment) {
    try {
      tr.replaceWith(match.from, match.to, fragment)
      cursorPos = match.from + fragment.size
    } catch {
      // Fragment did not fit the parent; fall back to plain text.
      const fallback = state.tr
      applyPlainReplacement(fallback, state.schema, state.doc, match, replacement)
      const safe = Math.min(match.from + replacement.length, fallback.doc.content.size)
      fallback.setSelection(TextSelection.create(fallback.doc, safe))
      return fallback
    }
  } else {
    applyPlainReplacement(tr, state.schema, state.doc, match, replacement)
    cursorPos = match.from + replacement.length
  }

  const safePos = Math.min(cursorPos, tr.doc.content.size)
  tr.setSelection(TextSelection.create(tr.doc, safePos))
  return tr
}

/**
 * Replace all matches with `replacement`.
 * Replaces from end to start to preserve earlier positions.
 * Returns the transaction.
 *
 * Inline Markdown handling は `replaceMatchInDoc` と同じ。codeBlock 内の
 * 個別 match だけはプレーンテキストで上書きする。
 */
export function replaceAllMatchesInDoc(
  state: EditorState,
  matches: SearchMatch[],
  replacement: string,
  lineBreakPolicy: LineBreakPolicy = 'obsidian-paragraph',
): Transaction {
  const tr = state.tr
  // Use only non-overlapping ranges (left-to-right), then replace from the end.
  const nonOverlapping: SearchMatch[] = []
  const sortedAsc = [...matches].sort((a, b) => a.from - b.from || a.to - b.to)
  let lastTo = -1
  for (const match of sortedAsc) {
    if (match.to <= match.from) continue
    if (match.from < lastTo) continue
    nonOverlapping.push(match)
    lastTo = match.to
  }

  const fragment = buildInlineFragmentReplacement(state, replacement, lineBreakPolicy)

  const sortedDesc = nonOverlapping.sort((a, b) => b.from - a.from)
  for (const match of sortedDesc) {
    const inCodeBlock = isPositionInCodeBlock(state.doc, match.from)
    if (fragment && !inCodeBlock) {
      try {
        tr.replaceWith(match.from, match.to, fragment)
        continue
      } catch {
        // Fall through to plain text replacement below.
      }
    }
    applyPlainReplacement(tr, state.schema, state.doc, match, replacement)
  }
  return tr
}
