import type {
  Attrs,
  AttributeSpec,
  Fragment,
  Mark,
  Node as ProseMirrorNode,
} from '@tiptap/pm/model'
import { AOZORA_TCY_BODY_PATTERN } from '../schema/aozoraTcy'
import { SPECIAL_INLINE_NODE_TYPES } from './specialInlineBoundaryDiagnostics'

/**
 * LOCAL-WINDOW-INLINE-CAP1: Local Windowが losslessに扱えるinline capabilityの
 * **単一の共有述語**。capture / local transaction filter / commit validation は
 * 別々のallowlistを持たず、必ずこのmoduleだけを参照する。
 *
 * LOCAL-WINDOW-SPECIALINLINE1で、top-level inlineに`aozoraRuby` / `aozoraTcy`を追加した。
 * 対象外（1件でもあればparagraph全体をfail-closed）:
 * note anchor / inline HTML atom / image / hard break / その他inline atom。
 */
export const LOCAL_IME_LOCAL_WINDOW_SUPPORTED_MARKS = [
  'bold',
  'italic',
  'strike',
  'highlight',
  'underline',
  'code',
  'link',
] as const

export type LocalImeLocalWindowSupportedMarkName =
  (typeof LOCAL_IME_LOCAL_WINDOW_SUPPORTED_MARKS)[number]

const SUPPORTED_MARK_NAMES: ReadonlySet<string> = new Set(LOCAL_IME_LOCAL_WINDOW_SUPPORTED_MARKS)

export type LocalImeLocalWindowCapabilityViolation =
  | 'node-type'
  | 'inline-node'
  | 'mark-type'
  | 'mark-attrs'
  | 'special-inline-attrs'
  | 'special-inline-content'
  | 'special-inline-mark'
  | 'special-inline-body'

/**
 * LOCAL-WINDOW-SPECIALINLINE1: local PMでlossless表示だけを許すinline node。
 * Local Window内ではimmutableで、内部編集・attrs変更・unwrapは提供しない。
 */
// host の special-inline 定義（sentinel / diagnostics と同じ列）をそのまま使う。
export const LOCAL_IME_LOCAL_WINDOW_SPECIAL_INLINE_NODES = SPECIAL_INLINE_NODE_TYPES

export type LocalImeLocalWindowSpecialInlineNodeName =
  (typeof LOCAL_IME_LOCAL_WINDOW_SPECIAL_INLINE_NODES)[number]

const SPECIAL_INLINE_NODE_NAMES: ReadonlySet<string> = new Set(
  LOCAL_IME_LOCAL_WINDOW_SPECIAL_INLINE_NODES,
)

export function isLocalImeLocalWindowSpecialInlineNodeName(name: string): boolean {
  return SPECIAL_INLINE_NODE_NAMES.has(name)
}

export function isLocalImeLocalWindowSupportedMarkName(name: string): boolean {
  return SUPPORTED_MARK_NAMES.has(name)
}

/**
 * ProseMirrorの`AttributeSpec.validate`は関数形式と`"string|null"`のような文字列形式を
 * どちらも許す。PM内部の`validateType`と同じ意味論で判定する（値は書き換えない）。
 */
function isAttrValueValid(validate: AttributeSpec['validate'], value: unknown): boolean {
  if (typeof validate === 'function') {
    try {
      validate(value)
    } catch {
      return false
    }
    return true
  }
  if (typeof validate === 'string') {
    const name = value === null ? 'null' : typeof value
    return validate.split('|').indexOf(name) >= 0
  }
  return true
}

/**
 * mark attrs が schema 契約を満たすかを、値を正規化・推測せずに検証する。
 * link の `href` / `title` を含め、未知key・必須attrs欠落・schema `validate`違反
 * （関数形式・文字列形式の両方）を fail-closed にするだけで、書き換えは一切しない。
 */
export function areLocalImeLocalWindowMarkAttrsValid(mark: Mark): boolean {
  const specs = mark.type.spec.attrs ?? {}
  const attrs = (mark.attrs ?? {}) as Record<string, unknown>
  for (const key of Object.keys(attrs)) {
    if (!Object.prototype.hasOwnProperty.call(specs, key)) return false
  }
  for (const [key, spec] of Object.entries(specs)) {
    const value = attrs[key]
    if (value === undefined && !Object.prototype.hasOwnProperty.call(spec, 'default')) return false
    if (value !== undefined && !isAttrValueValid(spec.validate, value)) return false
  }
  // schema自身の契約でも再検証する。`MarkType.checkAttrs`はd.ts未公開の`@internal`なので、
  // 存在するときだけ authority として使う（`MarkType.create()`はvalidationを実行しない）。
  const checkAttrs = (mark.type as unknown as { checkAttrs?: (values: Attrs) => void }).checkAttrs
  if (typeof checkAttrs === 'function') {
    try {
      checkAttrs.call(mark.type, mark.attrs)
    } catch {
      return false
    }
  }
  return true
}

export function isLocalImeLocalWindowSupportedMark(mark: Mark): boolean {
  if (!isLocalImeLocalWindowSupportedMarkName(mark.type.name)) return false
  return areLocalImeLocalWindowMarkAttrsValid(mark)
}

/**
 * node attrs が schema 契約を満たすか。mark 側と同じ意味論で、値の正規化・補完はしない。
 * `NodeType.create()` は validation を実行しないため oracle に使わず、
 * schema 自身の `NodeType.checkAttrs()` を authority として併用する。
 */
export function areLocalImeLocalWindowNodeAttrsValid(node: ProseMirrorNode): boolean {
  const specs = node.type.spec.attrs ?? {}
  const attrs = (node.attrs ?? {}) as Record<string, unknown>
  for (const key of Object.keys(attrs)) {
    if (!Object.prototype.hasOwnProperty.call(specs, key)) return false
  }
  for (const [key, spec] of Object.entries(specs)) {
    const value = attrs[key]
    if (value === undefined && !Object.prototype.hasOwnProperty.call(spec, 'default')) return false
    if (value !== undefined && !isAttrValueValid(spec.validate, value)) return false
  }
  const checkAttrs = (node.type as unknown as { checkAttrs?: (values: Attrs) => void }).checkAttrs
  if (typeof checkAttrs === 'function') {
    try {
      checkAttrs.call(node.type, node.attrs)
    } catch {
      return false
    }
  }
  return true
}

function describeMarksViolation(
  marks: readonly Mark[],
  typeViolation: LocalImeLocalWindowCapabilityViolation,
  attrsViolation: LocalImeLocalWindowCapabilityViolation,
): LocalImeLocalWindowCapabilityViolation | null {
  for (const mark of marks) {
    if (!isLocalImeLocalWindowSupportedMarkName(mark.type.name)) return typeViolation
    if (!areLocalImeLocalWindowMarkAttrsValid(mark)) return attrsViolation
  }
  return null
}

/**
 * `aozoraRuby` / `aozoraTcy` を lossless に載せられるかを検証する。
 * 内容・attrs・markは読み取るだけで、strip / hoist / 正規化・補完は一切しない。
 */
export function describeLocalImeLocalWindowSpecialInlineViolation(
  node: ProseMirrorNode,
): LocalImeLocalWindowCapabilityViolation | null {
  if (!isLocalImeLocalWindowSpecialInlineNodeName(node.type.name)) return 'inline-node'
  if (!areLocalImeLocalWindowNodeAttrsValid(node)) return 'special-inline-attrs'
  const nodeMarks = describeMarksViolation(
    node.marks,
    'special-inline-mark',
    'special-inline-mark',
  )
  if (nodeMarks) return nodeMarks

  // content は text child だけ。nested node / atom は fail-closed。
  let contentViolation: LocalImeLocalWindowCapabilityViolation | null = null
  node.forEach((child) => {
    if (contentViolation !== null) return
    if (!child.isText) {
      contentViolation = 'special-inline-content'
      return
    }
    const childMarks = describeMarksViolation(
      child.marks,
      'special-inline-mark',
      'special-inline-mark',
    )
    if (childMarks) contentViolation = childMarks
  })
  if (contentViolation) return contentViolation
  if (node.content.size === 0) return 'special-inline-content'

  if (node.type.name === 'aozoraRuby') {
    const ruby = (node.attrs as { ruby?: unknown }).ruby
    const hasDelimiter = (node.attrs as { hasDelimiter?: unknown }).hasDelimiter
    if (typeof ruby !== 'string' || ruby.length === 0) return 'special-inline-attrs'
    if (typeof hasDelimiter !== 'boolean') return 'special-inline-attrs'
    return null
  }

  // TCY body は製品制約（1-4 chars / `[A-Za-z0-9!?]`）の共有正本で判定する。
  if (!AOZORA_TCY_BODY_PATTERN.test(node.textContent)) return 'special-inline-body'
  return null
}

/**
 * top-level inline は text / `aozoraRuby` / `aozoraTcy` だけ。
 * 全markがwhitelist内で、special-inlineは上の契約を満たすこと。
 */
export function describeLocalImeLocalWindowParagraphViolation(
  node: ProseMirrorNode,
): LocalImeLocalWindowCapabilityViolation | null {
  if (node.type.name !== 'paragraph') return 'node-type'
  let violation: LocalImeLocalWindowCapabilityViolation | null = null
  node.forEach((child) => {
    if (violation !== null) return
    if (child.isText) {
      violation = describeMarksViolation(child.marks, 'mark-type', 'mark-attrs')
      return
    }
    if (!isLocalImeLocalWindowSpecialInlineNodeName(child.type.name)) {
      violation = 'inline-node'
      return
    }
    violation = describeLocalImeLocalWindowSpecialInlineViolation(child)
  })
  return violation
}

function forEachSpecialInline(
  source: ProseMirrorNode | Fragment,
  visit: (node: ProseMirrorNode) => void,
): void {
  source.descendants((node) => {
    if (!isLocalImeLocalWindowSpecialInlineNodeName(node.type.name)) return true
    visit(node)
    return false
  })
}

/** 文書順のspecial-inline node列。position ではなく node identity / 値だけを見る。 */
export function collectLocalImeLocalWindowSpecialInlines(
  source: ProseMirrorNode | Fragment,
): ProseMirrorNode[] {
  const collected: ProseMirrorNode[] = []
  forEachSpecialInline(source, (node) => collected.push(node))
  return collected
}

/**
 * special-inline列が不変か。個数・文書順・node type・attrs・content・node-level marks・
 * text-child marksを`Node.eq()`でまとめて証明する。周辺textの編集やsplit / joinによる
 * position移動は許可するが、node自身は一切変わってはいけない。
 */
export function areLocalImeLocalWindowSpecialInlinesPreserved(
  before: readonly ProseMirrorNode[],
  after: readonly ProseMirrorNode[],
): boolean {
  if (before.length !== after.length) return false
  for (let index = 0; index < before.length; index += 1) {
    const left = before[index]
    const right = after[index]
    // `filterTransaction`から呼ばれるので、長さ不一致でも例外を投げず false に倒す。
    if (!left || !right || !left.eq(right)) return false
  }
  return true
}

export function isLocalImeLocalWindowCapableParagraph(node: ProseMirrorNode): boolean {
  return describeLocalImeLocalWindowParagraphViolation(node) === null
}

/** local doc全体（＝commit対象全体）が同じ契約を満たすか。 */
export function isLocalImeLocalWindowCapableDoc(doc: ProseMirrorNode): boolean {
  if (doc.childCount === 0) return false
  let capable = true
  doc.forEach((child) => {
    if (!isLocalImeLocalWindowCapableParagraph(child)) capable = false
  })
  return capable
}
