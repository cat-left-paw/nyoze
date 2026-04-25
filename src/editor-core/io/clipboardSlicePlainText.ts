import type { Fragment, Node as PMNode, Slice } from '@tiptap/pm/model'

/**
 * Encode aozoraRuby / aozoraTcy as Aozora source text (clipboard + markdown serializer).
 */
export function encodeAozoraInlineNode(node: PMNode): string | null {
  if (node.type.name === 'aozoraRuby') {
    const base = node.textContent
    const ruby = (node.attrs.ruby as string) ?? ''
    const hasDelimiter = Boolean(node.attrs.hasDelimiter)
    return hasDelimiter ? `｜${base}《${ruby}》` : `${base}《${ruby}》`
  }
  if (node.type.name === 'aozoraTcy') {
    return `｟${node.textContent}｠`
  }
  return null
}

function serializeClipboardLeafishNode(node: PMNode): string {
  const encoded = encodeAozoraInlineNode(node)
  if (encoded !== null) return encoded
  switch (node.type.name) {
    case 'html_inline_atom':
      return (node.attrs.raw as string) ?? ''
    case 'html_block_atom':
      return (node.attrs.raw as string) ?? ''
    case 'hardBreak':
      return '\n'
    default:
      return node.textContent
  }
}

/**
 * Walk inline (and nested inline) nodes. `Fragment.textBetween` skips non-leaf inlines
 * like `aozoraRuby` (empty for the wrapper, then only inner base text), so we recurse explicitly.
 */
function serializeInlineFragmentForClipboard(fragment: Fragment): string {
  let out = ''
  fragment.forEach((child) => {
    out += serializeInlineNodeForClipboard(child)
  })
  return out
}

function serializeInlineNodeForClipboard(node: PMNode): string {
  if (node.isText) return node.text ?? ''
  const encoded = encodeAozoraInlineNode(node)
  if (encoded !== null) return encoded
  if (node.type.name === 'hardBreak') return '\n'
  if (node.type.name === 'html_inline_atom') return (node.attrs.raw as string) ?? ''
  if (node.content.size > 0) {
    return serializeInlineFragmentForClipboard(node.content)
  }
  return serializeClipboardLeafishNode(node)
}

function serializeBlockNodeForClipboard(node: PMNode): string {
  const inlineEncoded = encodeAozoraInlineNode(node)
  if (inlineEncoded !== null) return inlineEncoded
  if (node.isText) return node.text ?? ''
  if (node.isTextblock) {
    return serializeInlineFragmentForClipboard(node.content)
  }
  if (node.content.size > 0) {
    const parts: string[] = []
    node.content.forEach((child) => {
      parts.push(serializeBlockNodeForClipboard(child))
    })
    return parts.join('\n')
  }
  return serializeClipboardLeafishNode(node)
}

function fragmentHasBlockChild(fragment: Fragment): boolean {
  let found = false
  fragment.forEach((child) => {
    if (child.isBlock) found = true
  })
  return found
}

/**
 * Plain-text serialization for clipboard.
 * Uses a single `\n` between top-level **block** siblings; inline-only fragments (open slices) stay one line.
 */
export function serializeClipboardSliceToPlainText(slice: Slice): string {
  if (slice.content.size > 0 && !fragmentHasBlockChild(slice.content)) {
    return serializeInlineFragmentForClipboard(slice.content)
  }
  const parts: string[] = []
  slice.content.forEach((child) => {
    parts.push(serializeBlockNodeForClipboard(child))
  })
  return parts.join('\n')
}
