import type { Editor } from '@tiptap/core'
import { Fragment, type Node as PMNode } from '@tiptap/pm/model'
import { NodeSelection, Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import {
  BLANK_PAGE_MAX_COUNT,
  BLANK_PAGE_MIN_COUNT,
  classifyDirectiveToken,
  formatDirectiveToken,
  NYOZE_BLANK_PAGE_NODE_NAME,
  NYOZE_DIRECTIVE_NODE_NAME,
  NYOZE_PAGE_BREAK_NODE_NAME,
  type DirectiveDescriptor,
} from '../io/customBlockDirective'

/**
 * Nyoze 独自ブロック装飾 (custom block directive) の apply / remove / query。
 *
 * WYSIWYG から現在ブロックまたは選択範囲の top-level block を装飾する。
 * - 既存 directive 内なら attrs を置き換える (UI は基本「現在の装飾を置換」)。
 * - directive 外なら対象 top-level block 群を 1 つの directive で wrap する。
 *   範囲内に既存 directive があれば、その中身を取り出して flatten し、
 *   不要な nested directive を増やさない。
 * - remove は wrapper を外して中身の block を残す。
 *
 * すべて通常の ProseMirror transaction として dispatch するため、
 * Undo / Redo は history plugin によって通常どおり効く。
 * Markdown 文字列は組み立てず、保存時の serializer に任せる。
 */

type Dispatch = (tr: Transaction) => void
type LogPush = (event: string, detail: string) => void

export interface EnclosingDirective {
  node: PMNode
  pos: number
  depth: number
}

/** selection の祖先のうち最も内側の directive block を返す。なければ null。 */
export function findEnclosingDirective(state: EditorState): EnclosingDirective | null {
  const { $from } = state.selection
  for (let depth = $from.depth; depth >= 1; depth--) {
    const node = $from.node(depth)
    if (node.type.name === NYOZE_DIRECTIVE_NODE_NAME) {
      return { node, pos: $from.before(depth), depth }
    }
  }
  return null
}

/** 現在 selection が属する directive の descriptor を返す。なければ null。 */
export function resolveCurrentDirectiveDescriptor(state: EditorState): DirectiveDescriptor | null {
  const enclosing = findEnclosingDirective(state)
  if (!enclosing) return null
  return {
    kind: enclosing.node.attrs.kind,
    name: enclosing.node.attrs.name,
    level: enclosing.node.attrs.level ?? null,
  }
}

function descriptorEquals(a: DirectiveDescriptor, attrs: PMNode['attrs']): boolean {
  return a.kind === attrs.kind && a.name === attrs.name && (a.level ?? null) === (attrs.level ?? null)
}

/**
 * selection が跨ぐ top-level block の範囲 (doc 直下) を返す。
 * collapsed のときは現在の top-level block。なければ null。
 */
function resolveTopLevelWrapRange(state: EditorState): { from: number; to: number } | null {
  const { from: selFrom, to: selTo } = state.selection
  const doc = state.doc
  const collapsed = selFrom === selTo
  let wrapFrom: number | null = null
  let wrapTo: number | null = null

  doc.forEach((child, offset) => {
    const start = offset
    const end = offset + child.nodeSize
    const intersects = collapsed
      ? start < selFrom && selFrom < end
      : start < selTo && end > selFrom
    if (!intersects) return
    if (wrapFrom === null) wrapFrom = start
    wrapTo = end
  })

  if (wrapFrom === null || wrapTo === null) return null
  return { from: wrapFrom, to: wrapTo }
}

/**
 * directive を適用する。
 * 既存 directive 内なら attrs を置換、外なら対象 top-level block 群を wrap する。
 * 何も変化しなければ false。
 */
export function applyCustomBlockDirective(
  state: EditorState,
  dispatch: Dispatch | undefined,
  descriptor: DirectiveDescriptor,
): boolean {
  const directiveType = state.schema.nodes[NYOZE_DIRECTIVE_NODE_NAME]
  if (!directiveType) return false

  const attrs = {
    kind: descriptor.kind,
    name: descriptor.name,
    level: descriptor.level ?? null,
  }

  // --- 既存 directive 内: attrs を置き換える ---
  const enclosing = findEnclosingDirective(state)
  if (enclosing) {
    if (descriptorEquals(descriptor, enclosing.node.attrs)) return false
    if (dispatch) {
      const tr = state.tr.setNodeMarkup(enclosing.pos, undefined, attrs)
      dispatch(tr.scrollIntoView())
    }
    return true
  }

  // --- directive 外: 対象 top-level block 群を wrap (既存 directive は flatten) ---
  const range = resolveTopLevelWrapRange(state)
  if (!range) return false
  const { from, to } = range

  const children: PMNode[] = []
  state.doc.forEach((child, offset) => {
    if (offset < from || offset >= to) return
    if (child.type.name === NYOZE_DIRECTIVE_NODE_NAME) {
      // 不要な nesting を避けるため既存 directive は中身を取り出す。
      child.forEach((inner) => children.push(inner))
    } else {
      children.push(child)
    }
  })
  if (children.length === 0) return false

  let directiveNode: PMNode
  try {
    directiveNode = directiveType.create(attrs, Fragment.fromArray(children))
  } catch {
    return false
  }
  if (!dispatch) return true

  const { from: selFrom, to: selTo } = state.selection
  const tr = state.tr.replaceWith(from, to, directiveNode)
  const docSize = tr.doc.content.size
  const contentStart = from + 1
  const contentEnd = from + directiveNode.nodeSize - 1
  if (selFrom === selTo) {
    const pos = Math.min(Math.max(selFrom + 1, contentStart), Math.min(contentEnd, docSize))
    tr.setSelection(Selection.near(tr.doc.resolve(pos)))
  } else {
    const a = Math.min(Math.max(selFrom + 1, contentStart), docSize)
    const b = Math.min(Math.max(selTo + 1, contentStart), Math.min(contentEnd, docSize))
    tr.setSelection(TextSelection.between(tr.doc.resolve(a), tr.doc.resolve(b)))
  }
  dispatch(tr.scrollIntoView())
  return true
}

/** 現在の directive wrapper を外し、中身の block を残す。なければ false。 */
export function removeCustomBlockDirective(
  state: EditorState,
  dispatch: Dispatch | undefined,
): boolean {
  const enclosing = findEnclosingDirective(state)
  if (!enclosing) return false
  if (!dispatch) return true

  const { node, pos } = enclosing
  const { from: selFrom, to: selTo } = state.selection
  const tr = state.tr.replaceWith(pos, pos + node.nodeSize, node.content)
  const docSize = tr.doc.content.size
  const newFrom = Math.min(Math.max(selFrom - 1, 0), docSize)
  const newTo = Math.min(Math.max(selTo - 1, 0), docSize)
  tr.setSelection(TextSelection.between(tr.doc.resolve(newFrom), tr.doc.resolve(newTo)))
  dispatch(tr.scrollIntoView())
  return true
}

/**
 * selection を含む top-level block (doc 直下、depth 1 の祖先) の直後の位置を返す。
 * selection が top-level node 自体 (NodeSelection、例: nyozePageBreak を直接選択中)
 * の場合、その位置の $from は depth 0 (doc の子として直接解決される) になるため、
 * selection.to (node の直後) をそのまま使う。
 */
function resolveTopLevelInsertPos(state: EditorState): number {
  const { $from } = state.selection
  if ($from.depth === 0) {
    return state.selection.to
  }
  const topLevelNode = $from.node(1)
  return $from.before(1) + topLevelNode.nodeSize
}

/**
 * 改ページ marker (`nyozePageBreak`) を挿入する。
 *
 * 保守的な挙動:
 * - 現在の top-level block (depth 1 の祖先) の直後へ挿入する。selection が
 *   nyozePageBreak 自体 (NodeSelection) ならその直後へもう1つ挿入する。
 * - insert のみを使い、selection 範囲の本文を削除・置換しない。
 * - 挿入後、直後に既存の textblock があればその先頭へ selection を寄せる。
 *   textblock が無ければ (文末、または次が非 textblock) 空 paragraph を追加し、
 *   そこへ selection を置く。`TextSelection.create` で非 textblock へ無理に
 *   置かず `Selection.near` を使う。
 * - 常に新しい node を追加するだけなので、既存 directive の apply/remove の
 *   ような no-op 判定は行わない (再挿入も許可する)。
 */
export function insertPageBreak(
  state: EditorState,
  dispatch: Dispatch | undefined,
): boolean {
  const pageBreakType = state.schema.nodes[NYOZE_PAGE_BREAK_NODE_NAME]
  if (!pageBreakType) return false

  let pageBreakNode: PMNode
  try {
    pageBreakNode = pageBreakType.create()
  } catch {
    return false
  }

  if (!dispatch) return true

  const insertPos = resolveTopLevelInsertPos(state)
  const tr = state.tr.insert(insertPos, pageBreakNode)
  const afterPageBreak = insertPos + pageBreakNode.nodeSize

  const nextNode = tr.doc.nodeAt(afterPageBreak)
  if (!nextNode || !nextNode.isTextblock) {
    const paragraphType = state.schema.nodes.paragraph
    if (paragraphType) {
      tr.insert(afterPageBreak, paragraphType.create())
    }
  }

  const selectionPos = Math.min(afterPageBreak + 1, tr.doc.content.size)
  tr.setSelection(Selection.near(tr.doc.resolve(selectionPos), 1))
  dispatch(tr.scrollIntoView())
  return true
}

/**
 * `insertBlankPage` の count 引数を安全な範囲へ正規化する。
 * `externalExportOptions.ts` の `resolvePageBreakBeforeHeadingMaxLevel` と同じ方針。
 * - 数値でない・有限でない値（`undefined` / `NaN` / `Infinity` 等）は既定値
 *   `BLANK_PAGE_MIN_COUNT`（1）へフォールバックする。
 * - 有限値は最も近い整数へ丸めたうえで `BLANK_PAGE_MIN_COUNT`〜`BLANK_PAGE_MAX_COUNT`
 *   （1〜20）にクランプする（例: `0` → `1`、`999` → `20`、`2.5` → `3`）。
 */
export function normalizeBlankPageInsertCount(count: number | undefined): number {
  if (typeof count !== 'number' || !Number.isFinite(count)) {
    return BLANK_PAGE_MIN_COUNT
  }
  const rounded = Math.round(count)
  return Math.min(Math.max(rounded, BLANK_PAGE_MIN_COUNT), BLANK_PAGE_MAX_COUNT)
}

/**
 * 空白ページ marker (`nyozeBlankPage`) を挿入する。
 *
 * 挙動は `insertPageBreak` と同じ (保守的な挙動):
 * - 現在の top-level block (depth 1 の祖先) の直後へ挿入する。selection が
 *   nyozeBlankPage / nyozePageBreak 自体 (NodeSelection) ならその直後へ挿入する
 *   (`resolveTopLevelInsertPos` はどちらの node 種別でも同じロジックで動く)。
 * - insert のみを使い、selection 範囲の本文を削除・置換しない。
 * - 挿入後、直後に既存の textblock があればその先頭へ selection を寄せる。
 *   textblock が無ければ (文末、または次が非 textblock) 空 paragraph を追加し、
 *   そこへ selection を置く。
 * - 常に新しい node を追加するだけなので、既存 directive の apply/remove の
 *   ような no-op 判定は行わない (再挿入も許可する)。
 *
 * `count` は省略時 1（既存の count=1 固定挙動と後方互換）。範囲外・非数値は
 * `normalizeBlankPageInsertCount` で 1〜20 へ安全に正規化する（warning + clamp
 * ではなく、常に有効な node を挿入できる値へ寄せるだけ。parser の
 * `blank-page-999` 等 plain text 温存方針とは別の経路であり、挿入 UI からは
 * そもそも 1〜20 の選択肢しか渡らない前提）。
 */
export function insertBlankPage(
  state: EditorState,
  dispatch: Dispatch | undefined,
  count: number = 1,
): boolean {
  const blankPageType = state.schema.nodes[NYOZE_BLANK_PAGE_NODE_NAME]
  if (!blankPageType) return false

  const normalizedCount = normalizeBlankPageInsertCount(count)

  let blankPageNode: PMNode
  try {
    blankPageNode = blankPageType.create({ count: normalizedCount })
  } catch {
    return false
  }

  if (!dispatch) return true

  const insertPos = resolveTopLevelInsertPos(state)
  const tr = state.tr.insert(insertPos, blankPageNode)
  const afterBlankPage = insertPos + blankPageNode.nodeSize

  const nextNode = tr.doc.nodeAt(afterBlankPage)
  if (!nextNode || !nextNode.isTextblock) {
    const paragraphType = state.schema.nodes.paragraph
    if (paragraphType) {
      tr.insert(afterBlankPage, paragraphType.create())
    }
  }

  const selectionPos = Math.min(afterBlankPage + 1, tr.doc.content.size)
  tr.setSelection(Selection.near(tr.doc.resolve(selectionPos), 1))
  dispatch(tr.scrollIntoView())
  return true
}

/** selection が改ページ marker (`nyozePageBreak`) を NodeSelection として選択しているか。 */
export function isPageBreakNodeSelected(state: EditorState): boolean {
  const { selection } = state
  return selection instanceof NodeSelection && selection.node.type.name === NYOZE_PAGE_BREAK_NODE_NAME
}

/**
 * 改ページ marker (`nyozePageBreak`) を削除する。
 *
 * selection がその node を NodeSelection として選択している場合だけ動作する
 * (保守的な挙動。paragraph 内 cursor 等では no-op)。削除後は `Selection.near`
 * で削除位置に最も近い有効な selection へ寄せる。
 */
export function deletePageBreak(
  state: EditorState,
  dispatch: Dispatch | undefined,
): boolean {
  if (!isPageBreakNodeSelected(state)) return false
  if (!dispatch) return true

  const { from, to } = state.selection
  const tr = state.tr.delete(from, to)
  const pos = Math.min(from, tr.doc.content.size)
  tr.setSelection(Selection.near(tr.doc.resolve(pos)))
  dispatch(tr.scrollIntoView())
  return true
}

/**
 * EditorCore から使う薄い controller。
 * IME composition 中は安全側で拒否する (false)。
 */
export function createCustomBlockDirectiveController(options: {
  editor: Editor
  getIsComposing: () => boolean
  pushLog: LogPush
}): {
  applyToken: (token: string) => boolean
  remove: () => boolean
  getToken: () => string | null
  insertPageBreak: () => boolean
  deletePageBreak: () => boolean
  insertBlankPage: (count?: number) => boolean
} {
  const { editor, getIsComposing, pushLog } = options
  const dispatch: Dispatch = (tr) => editor.view.dispatch(tr)

  return {
    applyToken(token: string): boolean {
      if (getIsComposing()) return false
      const descriptor = classifyDirectiveToken(token)
      if (!descriptor) return false
      const changed = applyCustomBlockDirective(editor.state, dispatch, descriptor)
      if (changed) {
        editor.view.focus()
        pushLog('command', `customBlockDirectiveApply ${token}`)
      }
      return changed
    },
    remove(): boolean {
      if (getIsComposing()) return false
      const changed = removeCustomBlockDirective(editor.state, dispatch)
      if (changed) {
        editor.view.focus()
        pushLog('command', 'customBlockDirectiveRemove')
      }
      return changed
    },
    getToken(): string | null {
      const descriptor = resolveCurrentDirectiveDescriptor(editor.state)
      return descriptor ? formatDirectiveToken(descriptor) : null
    },
    insertPageBreak(): boolean {
      if (getIsComposing()) return false
      const changed = insertPageBreak(editor.state, dispatch)
      if (changed) {
        editor.view.focus()
        pushLog('command', 'customBlockDirectiveInsertPageBreak')
      }
      return changed
    },
    deletePageBreak(): boolean {
      if (getIsComposing()) return false
      const changed = deletePageBreak(editor.state, dispatch)
      if (changed) {
        editor.view.focus()
        pushLog('command', 'customBlockDirectiveDeletePageBreak')
      }
      return changed
    },
    insertBlankPage(count?: number): boolean {
      if (getIsComposing()) return false
      const changed = insertBlankPage(editor.state, dispatch, count)
      if (changed) {
        editor.view.focus()
        pushLog(
          'command',
          `customBlockDirectiveInsertBlankPage count=${normalizeBlankPageInsertCount(count)}`,
        )
      }
      return changed
    },
  }
}
