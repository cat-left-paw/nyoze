import { Selection as PMSelection } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

type LogPush = (event: string, detail: string) => void

export type RubyBoundaryDeleteRange = {
  from: number
  to: number
}

type RubyBaseDomSelection = {
  pos: number
  range: RubyBoundaryDeleteRange
}

type RubyBoundaryEventOptions = {
  pushLog: LogPush
}

function getRootSelection(view: EditorView): globalThis.Selection | null {
  const root = view.root as Document | ShadowRoot
  if ('getSelection' in root) {
    return root.getSelection()
  }
  return view.dom.ownerDocument.getSelection()
}

function closestElement(node: Node | null): Element | null {
  if (!node) return null
  return node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement
}

function resolveRubyAncestorRangeAtPos(
  state: EditorState,
  pos: number,
): RubyBoundaryDeleteRange | null {
  if (pos < 0 || pos > state.doc.content.size) return null
  const $pos = state.doc.resolve(pos)
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type.name !== 'aozoraRuby') continue
    return {
      from: $pos.before(depth),
      to: $pos.after(depth),
    }
  }
  return null
}

function resolveRubyRangeNearPos(
  state: EditorState,
  pos: number,
): RubyBoundaryDeleteRange | null {
  const direct = resolveRubyAncestorRangeAtPos(state, pos)
  if (direct) return direct

  for (const candidate of [pos - 1, pos + 1]) {
    const range = resolveRubyAncestorRangeAtPos(state, candidate)
    if (range) return range
  }

  const $pos = state.doc.resolve(Math.max(0, Math.min(pos, state.doc.content.size)))
  const nodeBefore = $pos.nodeBefore
  if (nodeBefore?.type.name === 'aozoraRuby') {
    return {
      from: pos - nodeBefore.nodeSize,
      to: pos,
    }
  }
  const nodeAfter = $pos.nodeAfter
  if (nodeAfter?.type.name === 'aozoraRuby') {
    return {
      from: pos,
      to: pos + nodeAfter.nodeSize,
    }
  }
  return null
}

export function resolveRubyBaseDomSelection(
  view: EditorView,
): RubyBaseDomSelection | null {
  const selection = getRootSelection(view)
  if (!selection?.isCollapsed) return null

  const anchorElement = closestElement(selection.anchorNode)
  const baseElement = anchorElement?.closest('[data-aozora-base]')
  if (!baseElement) return null
  const rubyElement = baseElement.closest('[data-aozora-ruby]')
  if (!rubyElement || !view.dom.contains(rubyElement)) return null

  let pos: number
  try {
    if (!selection.anchorNode) return null
    pos = view.posAtDOM(selection.anchorNode, selection.anchorOffset)
  } catch {
    return null
  }

  const range = resolveRubyRangeNearPos(view.state, pos)
  if (!range) return null
  const node = view.state.doc.nodeAt(range.from)
  if (node?.type.name !== 'aozoraRuby') return null
  return { pos, range }
}

export function normalizeRubyBaseDomSelectionAfterNode(
  view: EditorView,
  dispatch?: (tr: Transaction) => void,
): { from: number; to: number; pos: number } | null {
  const resolved = resolveRubyBaseDomSelection(view)
  if (!resolved) return null
  const selection = PMSelection.near(view.state.doc.resolve(resolved.range.to), 1)
  const tr = view.state.tr.setSelection(selection)
  if (dispatch) dispatch(tr)
  return {
    from: resolved.range.from,
    to: resolved.range.to,
    pos: resolved.pos,
  }
}

export function deleteRubyBaseDomSelection(
  view: EditorView,
  dispatch?: (tr: Transaction) => void,
): RubyBoundaryDeleteRange | null {
  const resolved = resolveRubyBaseDomSelection(view)
  if (!resolved) return null
  const tr = view.state.tr.delete(resolved.range.from, resolved.range.to)
  const nextPos = Math.max(0, Math.min(resolved.range.from, tr.doc.content.size))
  tr.setSelection(PMSelection.near(tr.doc.resolve(nextPos), -1))
  if (dispatch) dispatch(tr.scrollIntoView())
  return resolved.range
}

export function handleRubyBaseBackspaceKey(
  view: EditorView,
  event: KeyboardEvent,
  { pushLog }: RubyBoundaryEventOptions,
): boolean {
  if (event.key !== 'Backspace') return false
  const deleted = deleteRubyBaseDomSelection(view, (tr) => view.dispatch(tr))
  if (!deleted) return false
  event.preventDefault()
  pushLog('rubyBoundary', `deleteBaseDomSelection ${deleted.from}->${deleted.to}`)
  return true
}

export function handleRubyBaseBeforeInput(
  view: EditorView,
  event: InputEvent,
  { pushLog }: RubyBoundaryEventOptions,
): boolean {
  const inputType = event.inputType ?? ''
  if (inputType === 'deleteContentBackward') {
    const deleted = deleteRubyBaseDomSelection(view, (tr) => view.dispatch(tr))
    if (!deleted) return false
    event.preventDefault()
    pushLog('rubyBoundary', `deleteBaseDomSelection@beforeinput ${deleted.from}->${deleted.to}`)
    return true
  }

  if (!inputType.startsWith('insert')) return false
  const normalized = normalizeRubyBaseDomSelectionAfterNode(view, (tr) =>
    view.dispatch(tr),
  )
  if (!normalized) return false
  pushLog(
    'rubyBoundary',
    `normalizeBaseDomSelection@beforeinput:${inputType} pos=${normalized.pos} range=${normalized.from}->${normalized.to}`,
  )
  return false
}

export function handleRubyBaseCompositionStart(
  view: EditorView,
  { pushLog }: RubyBoundaryEventOptions,
): boolean {
  const normalized = normalizeRubyBaseDomSelectionAfterNode(view, (tr) =>
    view.dispatch(tr),
  )
  if (!normalized) return false
  pushLog(
    'rubyBoundary',
    `normalizeBaseDomSelection@compositionstart pos=${normalized.pos} range=${normalized.from}->${normalized.to}`,
  )
  return true
}
