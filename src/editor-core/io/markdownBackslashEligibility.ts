import type { Node as PMNode } from '@tiptap/pm/model'
import { encodeAozoraInlineNode } from './clipboardSlicePlainText'
import { decodeSourceSpelling, SOURCE_SPELLING_MARK_NAME } from './sourceSpelling'

/** 保存で綴りが変わり得る、印のない見える backslash があるか。raw と code は対象外。 */
export function hasUnspelledBackslash(node: PMNode): boolean {
  if (node.type.name === 'codeBlock') return false
  if (node.marks.some((mark) => mark.type.name === 'link' &&
    [mark.attrs.href, mark.attrs.title].some((value: unknown) => typeof value === 'string' && value.includes('\\')))) return true
  if (node.isText) {
    if (node.marks.some((mark) => mark.type.name === 'code')) return false
    const spelling = node.marks.find((mark) => mark.type.name === SOURCE_SPELLING_MARK_NAME)
    return node.text!.includes('\\') && decodeSourceSpelling(spelling?.attrs.raw) !== '\\'
  }
  if (node.type.name === 'nyoze_image') {
    return [node.attrs.alt, node.attrs.src, node.attrs.title].some((value: unknown) => typeof value === 'string' && value.includes('\\'))
  }
  const encoded = encodeAozoraInlineNode(node)
  if (encoded !== null) {
    // 子すべてに共通の code も、serializer は node の code と同じに扱う。
    const code = node.marks.some((mark) => mark.type.name === 'code') ||
      node.childCount > 0 && Array.from({ length: node.childCount }, (_, i) => node.child(i))
        .every((child) => child.isText && child.marks.some((mark) => mark.type.name === 'code'))
    return !code && encoded.includes('\\')
  }
  for (let i = 0; i < node.childCount; i += 1) {
    if (hasUnspelledBackslash(node.child(i))) return true
  }
  return false
}
