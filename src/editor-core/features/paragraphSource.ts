import type { Editor } from '@tiptap/core'
import type { EditorState } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'
import { parseMarkdown } from '../io/parseMarkdown'
import { serializeMarkdown } from '../io/serializeMarkdown'
import type {
  ClientRectSnapshot,
  LineBreakPolicy,
  SelectionRange,
} from '../types'

export type ParagraphNodeContext = {
  from: number
  to: number
  node: PMNode
}

function findAncestorParagraphAt(state: EditorState, pos: number): ParagraphNodeContext | null {
  const $pos = state.doc.resolve(pos)
  for (let depth = $pos.depth; depth >= 0; depth--) {
    const node = $pos.node(depth)
    if (hasListItemAncestor($pos, depth)) continue
    if (isParagraphPlainTargetType(node.type.name)) {
      return {
        from: $pos.start(depth) - 1,
        to: $pos.end(depth) + 1,
        node,
      }
    }
  }
  return null
}

export function resolveParagraphNodeContext(
  state: EditorState,
  range: SelectionRange,
): ParagraphNodeContext | null {
  const fromContext = findAncestorParagraphAt(state, range.from)
  if (!fromContext) return null

  const toContext = findAncestorParagraphAt(state, Math.max(range.to - 1, range.from))
  if (!toContext) return null

  if (fromContext.from !== toContext.from || fromContext.to !== toContext.to) {
    return null
  }
  return fromContext
}

export function serializeParagraphNode(
  state: EditorState,
  node: PMNode,
  lineBreakPolicy: LineBreakPolicy,
): string {
  const doc = state.schema.topNodeType.createAndFill(null, [node])
  if (!doc) return ''
  return serializeMarkdown(doc, lineBreakPolicy).replace(/\n$/, '')
}

export function serializeBlockNode(
  state: EditorState,
  node: PMNode,
  pos: number,
  lineBreakPolicy: LineBreakPolicy,
): string {
  if (node.type.name === 'listItem') {
    const parent = state.doc.resolve(pos).node(-1)
    if (parent.type.name === 'bulletList' || parent.type.name === 'orderedList') {
      const listDoc = state.schema.topNodeType.createAndFill(null, [parent])
      if (!listDoc) return ''
      const full = serializeMarkdown(listDoc, lineBreakPolicy).replace(/\n$/, '')
      const items = full.split(/\n(?=(?:- |\d+\. ))/)
      const idx = state.doc.resolve(pos).index(-1)
      return items[idx] ?? ''
    }
  }

  return serializeParagraphNode(state, node, lineBreakPolicy)
}

export function parseSingleParagraphNode(
  state: EditorState,
  markdown: string,
  lineBreakPolicy: LineBreakPolicy,
): PMNode | null {
  const doc = parseMarkdown(state.schema, markdown, lineBreakPolicy)
  if (doc.childCount !== 1) return null
  const node = doc.child(0)
  if (!isParagraphPlainTargetType(node.type.name)) return null
  return node
}

export function parseReplacementNode(
  state: EditorState,
  markdown: string,
  typeName: string,
  lineBreakPolicy: LineBreakPolicy,
): PMNode | null {
  if (typeName === 'listItem') {
    // listItem source editing may legitimately include blank lines for continuation
    // paragraphs. The obsidian-paragraph parser splits those into separate top-level
    // paragraphs, so use the strict parser here to recover a single list structure.
    const parsed = parseMarkdown(state.schema, markdown, 'commonmark-strict')
    if (parsed.childCount === 1) {
      const top = parsed.child(0)
      if ((top.type.name === 'bulletList' || top.type.name === 'orderedList') && top.childCount === 1) {
        const item = top.child(0)
        if (item.type.name === 'listItem') return item
      }
    }
    return null
  }

  const parsed = parseMarkdown(state.schema, markdown, lineBreakPolicy)

  if (parsed.childCount !== 1) return null
  const node = parsed.child(0)
  if (node.type.name !== typeName) {
    const isParagraphHeadingSwap =
      (typeName === 'heading' || typeName === 'paragraph') &&
      (node.type.name === 'heading' || node.type.name === 'paragraph')
    if (!isParagraphHeadingSwap) return null
  }
  return node
}

const PARAGRAPH_PLAIN_EXIT_REPARSE_TYPES = new Set([
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'blockquote',
  'codeBlock',
  'horizontalRule',
])

/**
 * Paragraph Plain 解除時専用の置換ノード解決。
 *
 * 通常の `parseReplacementNode` は paragraph ↔ heading の swap だけを許容するが、
 * 解除時に限って overlay の Markdown を再パースし、`# 見出し` / `- list` /
 * `> quote` / `` ``` `` で書かれた block 記法を該当 PM ノードへ巻き戻す。
 *
 * スコープ:
 * - 元 block が `paragraph` または `heading` のときだけ block 再解釈を許容する。
 * - 上記以外（`codeBlock`, `html_block_atom` 等）は従来通り厳格 swap。
 * - 複数 top-level block（例: `# 見出し` + 本文）はこのスライスでは未対応で、
 *   既存の `parseReplacementNode` 経路へフォールバックする（挙動は従来同等）。
 */
export function parseParagraphPlainExitReplacementContent(
  state: EditorState,
  markdown: string,
  typeName: string,
  lineBreakPolicy: LineBreakPolicy,
): PMNode | null {
  if (typeName !== 'paragraph' && typeName !== 'heading') {
    return parseReplacementNode(state, markdown, typeName, lineBreakPolicy)
  }

  const parsed = parseMarkdown(state.schema, markdown, lineBreakPolicy)
  if (parsed.childCount !== 1) {
    return parseReplacementNode(state, markdown, typeName, lineBreakPolicy)
  }

  const node = parsed.child(0)
  if (PARAGRAPH_PLAIN_EXIT_REPARSE_TYPES.has(node.type.name)) {
    return node
  }
  return parseReplacementNode(state, markdown, typeName, lineBreakPolicy)
}

export function resolveParagraphElement(
  editor: Editor,
  context: ParagraphNodeContext,
): HTMLElement | null {
  const domAtPos = editor.view.domAtPos(context.from + 1)
  let node = domAtPos.node as Node | null
  if (!node) return null

  const root = editor.view.dom
  if (node.nodeType === Node.TEXT_NODE) {
    node = node.parentElement
  }

  while (node && node !== root) {
    if (
      node instanceof HTMLElement &&
      (node.matches('p') ||
        node.matches('h1,h2,h3,h4,h5,h6') ||
        node.matches('li') ||
        node.matches('blockquote') ||
        node.matches('pre') ||
        node.matches('[data-html-block-atom="true"]') ||
        node.matches('[data-type="htmlBlockAtom"]'))
    ) {
      return node
    }
    node = node.parentNode
  }

  return root instanceof HTMLElement ? root : null
}

export function toClientRectSnapshot(element: HTMLElement): ClientRectSnapshot {
  const rect = element.getBoundingClientRect()
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  }
}

export type ActiveBlockInfo = {
  pos: number
  typeName: string
}

function hasListItemAncestor($pos: EditorState['selection']['$from'], depth: number): boolean {
  for (let d = depth - 1; d > 0; d--) {
    if ($pos.node(d).type.name === 'listItem') return true
  }
  return false
}

export function isParagraphPlainTargetType(typeName: string): boolean {
  return (
    typeName === 'paragraph' ||
    typeName === 'heading' ||
    typeName === 'codeBlock' ||
    typeName === 'html_block_atom'
  )
}

export function findActiveBlockPos(state: EditorState): ActiveBlockInfo | null {
  const { selection } = state
  const pos = selection.from
  const $pos = state.doc.resolve(pos)

  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth)
    if (hasListItemAncestor($pos, depth)) continue
    if (isParagraphPlainTargetType(node.type.name)) {
      return {
        pos: $pos.before(depth),
        typeName: node.type.name,
      }
    }
  }

  return null
}

export function canStartParagraphPlainAtSelection(state: EditorState): boolean {
  return findActiveBlockPos(state) !== null
}

export function resolveBlockElementAtPos(
  view: EditorView,
  pos: number,
  typeName: string,
): HTMLElement | null {
  const targetSelectors: Record<string, string> = {
    paragraph: 'p',
    heading: 'h1,h2,h3,h4,h5,h6',
    listItem: 'li',
    codeBlock: 'pre',
    html_block_atom: '[data-html-block-atom="true"],[data-type="htmlBlockAtom"]',
  }

  const selector = targetSelectors[typeName]
  const root = view.dom
  if (!selector || !(root instanceof HTMLElement)) return null

  const domAt = view.domAtPos(Math.min(pos + 1, view.state.doc.content.size))
  let node: Node | null = domAt.node
  if (node.nodeType === Node.TEXT_NODE) node = node.parentNode

  while (node && node !== root) {
    if (node instanceof HTMLElement && node.matches(selector)) return node
    node = node.parentNode
  }

  return null
}
