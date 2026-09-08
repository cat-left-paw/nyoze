import { NodeSelection, TextSelection, type EditorState, type Selection } from '@tiptap/pm/state'
import {
  selectionTouchesSpecialInlineNode,
  type SpecialInlineNodeTypeName,
} from './specialInlineBoundaryDiagnostics'
import { isLocalImeLocalWindowSpecialInlineNodeName } from './localImeLocalWindowCapability'

/**
 * LOCAL-WINDOW-SPECIALINLINE1: document capability（paragraphが載せられるか）とは別に、
 * **caret位置**がLocal Windowの安全領域かを明示判定する。
 *
 * Ruby / TCYが同じparagraphやwindow内の別paragraphに存在するだけでは拒否しない。
 * 拒否するのはannotation内部・NodeSelection・exactな直前/直後境界だけである。
 *
 * 直前/直後を拒否する理由は、その位置のhost DOMに`SpecialInlineBoundarySentinel`の
 * widget（WJ payload）が居り、Start時点のDOM↔PM caret対応が一意でないためである。
 * localへsentinelを複製しない方針なので、開始位置としては受け付けない。
 */
export type LocalImeLocalWindowCaretCapabilityReason =
  | 'selection-kind'
  | 'node-selection'
  | 'selection-not-collapsed'
  | 'selection-depth'
  | 'special-inline-ancestor'
  | 'special-inline-adjacent'

export type LocalImeLocalWindowCaretCapability =
  | { safe: true }
  | { safe: false; reason: LocalImeLocalWindowCaretCapabilityReason }

/** selectionの祖先にRuby / TCYが居るか（annotation内部・TCY内部）。 */
export function isLocalImeLocalWindowSelectionInsideSpecialInline(selection: Selection): boolean {
  for (const $pos of [selection.$anchor, selection.$head]) {
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      if (isLocalImeLocalWindowSpecialInlineNodeName($pos.node(depth).type.name)) return true
    }
  }
  return false
}

/** Ruby / TCY そのもののNodeSelectionか。 */
export function isLocalImeLocalWindowSpecialInlineNodeSelection(selection: Selection): boolean {
  return (
    selection instanceof NodeSelection &&
    isLocalImeLocalWindowSpecialInlineNodeName(selection.node.type.name)
  )
}

/**
 * Start可能なcaret位置か。document capabilityは別述語で判定する。
 * sentinel-sensitiveな直前/直後判定はhostの`selectionTouchesSpecialInlineNode()`をそのまま使い、
 * Local Window専用の第二定義を作らない。
 */
export function resolveLocalImeLocalWindowCaretCapability(
  state: EditorState,
): LocalImeLocalWindowCaretCapability {
  const selection = state.selection
  if (isLocalImeLocalWindowSpecialInlineNodeSelection(selection)) {
    return { safe: false, reason: 'node-selection' }
  }
  if (!(selection instanceof TextSelection)) return { safe: false, reason: 'selection-kind' }
  if (!selection.empty) return { safe: false, reason: 'selection-not-collapsed' }
  if (isLocalImeLocalWindowSelectionInsideSpecialInline(selection)) {
    return { safe: false, reason: 'special-inline-ancestor' }
  }
  if (selection.$anchor.depth !== 1 || selection.$head.depth !== 1) {
    return { safe: false, reason: 'selection-depth' }
  }
  if (selectionTouchesSpecialInlineNode(state)) {
    return { safe: false, reason: 'special-inline-adjacent' }
  }
  return { safe: true }
}

export function isLocalImeLocalWindowSafeStartCaret(state: EditorState): boolean {
  return resolveLocalImeLocalWindowCaretCapability(state).safe
}

/**
 * active session中に許すlocal selection。Start時と違い、直前/直後境界はlocal PMに
 * sentinelが存在しないため一意であり、commit builderがdepth 1 collapsedとして
 * mappedできるので許可する。annotation内部とNodeSelectionだけをfail-closedにする。
 */
export function isLocalImeLocalWindowAllowedLocalSelection(selection: Selection): boolean {
  if (isLocalImeLocalWindowSpecialInlineNodeSelection(selection)) return false
  return !isLocalImeLocalWindowSelectionInsideSpecialInline(selection)
}

/**
 * caretのすぐ手前 / 直後にあるspecial-inline node名。現在stateだけから決まり、
 * 移動先の推測（endpoint追跡）はしない。
 */
export function readLocalImeLocalWindowAdjacentSpecialInline(
  selection: Selection,
  side: 'before' | 'after',
): SpecialInlineNodeTypeName | null {
  if (!(selection instanceof TextSelection) || !selection.empty) return null
  const node = side === 'before' ? selection.$head.nodeBefore : selection.$head.nodeAfter
  const name = node?.type.name
  if (!name || !isLocalImeLocalWindowSpecialInlineNodeName(name)) return null
  return name as SpecialInlineNodeTypeName
}
