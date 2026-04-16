import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { TextSelection } from '@tiptap/pm/state'

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
// Replace helpers (pure-ish: they create transactions)
// ---------------------------------------------------------------------------

/**
 * Replace the text at the given match range with `replacement`.
 * Returns the new transaction and the position after replacement.
 */
export function replaceMatchInDoc(
  state: EditorState,
  match: SearchMatch,
  replacement: string,
): Transaction {
  const tr = state.tr
  tr.insertText(replacement, match.from, match.to)
  // Set cursor after replacement
  const afterPos = match.from + replacement.length
  const safePos = Math.min(afterPos, tr.doc.content.size)
  tr.setSelection(TextSelection.create(tr.doc, safePos))
  return tr
}

/**
 * Replace all matches with `replacement`.
 * Replaces from end to start to preserve earlier positions.
 * Returns the transaction.
 */
export function replaceAllMatchesInDoc(
  state: EditorState,
  matches: SearchMatch[],
  replacement: string,
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
  const sortedDesc = nonOverlapping.sort((a, b) => b.from - a.from)
  for (const match of sortedDesc) {
    tr.insertText(replacement, match.from, match.to)
  }
  return tr
}
