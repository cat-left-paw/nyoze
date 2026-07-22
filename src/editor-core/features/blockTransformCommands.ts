import { Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Selection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { collectNoteAnchorIdsInRange } from './noteAnchorProtection'

type Dispatch = (tr: Transaction) => void

const TRANSFORMABLE_TEXTBLOCK_TYPES = new Set(['paragraph', 'heading'])

type TopLevelBlockRange = {
  from: number
  to: number
  nodes: ProseMirrorNode[]
}

/**
 * Resolve the contiguous run of top-level doc children touched by the current
 * selection, restricted to plain paragraph/heading textblocks. Returns null
 * when fewer than two blocks are touched, when any touched block is not a
 * paragraph/heading (list item, blockquote, codeBlock, directive, table, ...),
 * or when the range contains a noteAnchor — callers should fall back to the
 * standard Tiptap command in all of those cases.
 */
function resolveTopLevelTextblockRange(state: EditorState): TopLevelBlockRange | null {
  const { doc, selection } = state
  const { from: selFrom, to: selTo } = selection

  let pos = 0
  let startIndex = -1
  let endIndex = -1
  let rangeFrom = 0
  let rangeTo = 0
  for (let i = 0; i < doc.childCount; i++) {
    const node = doc.child(i)
    const nodeStart = pos
    const nodeEnd = pos + node.nodeSize
    if (selTo > nodeStart && selFrom < nodeEnd) {
      if (startIndex === -1) {
        startIndex = i
        rangeFrom = nodeStart
      }
      endIndex = i
      rangeTo = nodeEnd
    }
    pos = nodeEnd
  }

  if (startIndex === -1 || endIndex - startIndex < 1) return null

  const nodes: ProseMirrorNode[] = []
  for (let i = startIndex; i <= endIndex; i++) {
    const node = doc.child(i)
    if (!TRANSFORMABLE_TEXTBLOCK_TYPES.has(node.type.name)) return null
    nodes.push(node)
  }

  if (collectNoteAnchorIdsInRange(doc, rangeFrom, rangeTo).length > 0) return null

  return { from: rangeFrom, to: rangeTo, nodes }
}

function dispatchReplacement(
  state: EditorState,
  dispatch: Dispatch | undefined,
  range: { from: number; to: number },
  replacement: ProseMirrorNode | ProseMirrorNode[],
): boolean {
  if (!dispatch) return true

  const tr = state.tr.replaceWith(range.from, range.to, replacement)
  const mappedTo = tr.mapping.map(range.to, -1)
  const newPos = Math.max(0, Math.min(mappedTo, tr.doc.content.size))
  tr.setSelection(Selection.near(tr.doc.resolve(newPos)))
  dispatch(tr.scrollIntoView())
  return true
}

type SingleTopLevelBlock = {
  from: number
  to: number
  node: ProseMirrorNode
}

/**
 * Resolve a single top-level doc child of the given type name that the
 * current selection touches — either a collapsed cursor inside it, or a
 * selection/NodeSelection spanning exactly that node. Returns null when the
 * selection touches zero or more than one top-level block, or when the sole
 * touched block isn't of the requested type — callers should fall back to
 * the standard Tiptap command in those cases.
 */
function resolveSingleTopLevelBlockOfType(
  state: EditorState,
  typeName: string,
): SingleTopLevelBlock | null {
  const { doc, selection } = state
  const { from: selFrom, to: selTo } = selection

  let pos = 0
  let touchedCount = 0
  let match: SingleTopLevelBlock | null = null

  for (let i = 0; i < doc.childCount; i++) {
    const node = doc.child(i)
    const nodeStart = pos
    const nodeEnd = pos + node.nodeSize
    if (selTo > nodeStart && selFrom < nodeEnd) {
      touchedCount++
      if (touchedCount > 1) return null
      if (node.type.name !== typeName) return null
      match = { from: nodeStart, to: nodeEnd, node }
    }
    pos = nodeEnd
  }

  return touchedCount === 1 ? match : null
}

/**
 * Split a paragraph's inline content into segments at each `hardBreak`,
 * preserving inline nodes/marks (ruby, TCY, etc.) untouched. Consecutive
 * hardBreaks (or a leading/trailing hardBreak) yield an empty segment,
 * which becomes an empty paragraph — mirroring how the multi-block apply
 * transform represents an originally-empty paragraph.
 */
function splitInlineContentByHardBreak(content: Fragment): Fragment[] {
  const segments: Fragment[] = []
  let current = Fragment.empty
  content.forEach((child) => {
    if (child.type.name === 'hardBreak') {
      segments.push(current)
      current = Fragment.empty
      return
    }
    current = current.append(Fragment.from(child))
  })
  segments.push(current)
  return segments
}

/**
 * Merge every top-level paragraph/heading textblock touched by the selection
 * into a single codeBlock, joining their plain text with `\n`. Returns false
 * (no-op) when the selection doesn't cleanly span 2+ paragraph/heading blocks,
 * so callers can fall back to the standard `toggleCodeBlock` command.
 */
export function applyObsidianParagraphCodeBlockTransform(
  state: EditorState,
  dispatch?: Dispatch,
): boolean {
  const range = resolveTopLevelTextblockRange(state)
  if (!range) return false

  const codeBlockType = state.schema.nodes.codeBlock
  if (!codeBlockType) return false

  const text = range.nodes.map((node) => node.textContent).join('\n')
  const content = text.length > 0 ? state.schema.text(text) : undefined
  const codeBlockNode = codeBlockType.create(null, content)

  return dispatchReplacement(state, dispatch, range, codeBlockNode)
}

/**
 * Merge every top-level paragraph/heading textblock touched by the selection
 * into a single blockquote containing one paragraph, joining their inline
 * content with `hardBreak` nodes so the quoted lines don't carry regular
 * paragraph spacing. Returns false (no-op) when the selection doesn't cleanly
 * span 2+ paragraph/heading blocks, so callers can fall back to the standard
 * `toggleBlockquote` command.
 */
export function applyObsidianParagraphBlockquoteTransform(
  state: EditorState,
  dispatch?: Dispatch,
): boolean {
  const range = resolveTopLevelTextblockRange(state)
  if (!range) return false

  const blockquoteType = state.schema.nodes.blockquote
  const paragraphType = state.schema.nodes.paragraph
  const hardBreakType = state.schema.nodes.hardBreak
  if (!blockquoteType || !paragraphType || !hardBreakType) return false

  let merged = Fragment.empty
  range.nodes.forEach((node, index) => {
    if (index > 0) merged = merged.append(Fragment.from(hardBreakType.create()))
    merged = merged.append(node.content)
  })

  const paragraphNode = paragraphType.create(null, merged)
  const blockquoteNode = blockquoteType.create(null, Fragment.from(paragraphNode))

  return dispatchReplacement(state, dispatch, range, blockquoteNode)
}

/**
 * Undo the multi-block codeBlock transform: when the selection touches a
 * single top-level `codeBlock` (cursor inside it, or the whole node
 * selected), split its text on `\n` and restore one top-level `paragraph`
 * per line (empty lines become empty paragraphs). Returns false (no-op)
 * when the selection isn't cleanly inside/covering a single top-level
 * codeBlock, so callers can fall back to the standard `toggleCodeBlock`
 * command.
 */
export function unwrapObsidianParagraphCodeBlockTransform(
  state: EditorState,
  dispatch?: Dispatch,
): boolean {
  const target = resolveSingleTopLevelBlockOfType(state, 'codeBlock')
  if (!target) return false

  const paragraphType = state.schema.nodes.paragraph
  if (!paragraphType) return false

  const lines = target.node.textContent.split('\n')
  const paragraphNodes = lines.map((line) =>
    paragraphType.create(null, line.length > 0 ? state.schema.text(line) : undefined),
  )

  return dispatchReplacement(state, dispatch, target, paragraphNodes)
}

/**
 * Undo the multi-block blockquote transform: when the selection touches a
 * single top-level `blockquote` containing exactly one `paragraph`, split
 * that paragraph's inline content on `hardBreak` and restore one top-level
 * `paragraph` per segment, preserving inline nodes/marks (ruby, TCY, ...).
 * Returns false (no-op) — so callers fall back to the standard
 * `toggleBlockquote` command — when the blockquote doesn't match this safe
 * shape (multiple children, a non-paragraph child, nested structure) or
 * when the blockquote's range contains a noteAnchor.
 */
export function unwrapObsidianParagraphBlockquoteTransform(
  state: EditorState,
  dispatch?: Dispatch,
): boolean {
  const target = resolveSingleTopLevelBlockOfType(state, 'blockquote')
  if (!target) return false
  if (target.node.childCount !== 1) return false

  const innerParagraph = target.node.child(0)
  if (innerParagraph.type.name !== 'paragraph') return false

  const paragraphType = state.schema.nodes.paragraph
  if (!paragraphType) return false

  if (collectNoteAnchorIdsInRange(state.doc, target.from, target.to).length > 0) return false

  const segments = splitInlineContentByHardBreak(innerParagraph.content)
  const paragraphNodes = segments.map((segment) => paragraphType.create(null, segment))

  return dispatchReplacement(state, dispatch, target, paragraphNodes)
}
