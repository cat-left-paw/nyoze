import { Selection as PMSelection, TextSelection } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import {
  mirrorSpecialInlineBoundaryCompositionPayload,
  transferSpecialInlineBoundarySentinelTextAtPos,
} from '../extensions/specialInlineBoundarySentinel'

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

type RubyFrontCompositionPending = {
  insertPos: number
  originalBaseText: string
  text: string
}

const rubyFrontCompositionPending = new WeakMap<EditorView, RubyFrontCompositionPending>()

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

function isDomSelectionAtBaseStart(
  selection: globalThis.Selection,
  baseElement: Element,
): boolean {
  if (!selection.anchorNode) return false
  if (!baseElement.contains(selection.anchorNode)) return false

  try {
    const range = baseElement.ownerDocument.createRange()
    range.setStart(baseElement, 0)
    range.setEnd(selection.anchorNode, selection.anchorOffset)
    return range.toString().length === 0
  } catch {
    return selection.anchorNode === baseElement && selection.anchorOffset === 0
  }
}

function resolveRubyRangeAtBaseStartPos(
  state: EditorState,
  pos: number,
): RubyBoundaryDeleteRange | null {
  const clamped = Math.max(0, Math.min(pos, state.doc.content.size))
  const $pos = state.doc.resolve(clamped)
  const nodeAfter = $pos.nodeAfter
  if (nodeAfter?.type.name === 'aozoraRuby') {
    return {
      from: clamped,
      to: clamped + nodeAfter.nodeSize,
    }
  }

  const direct = resolveRubyAncestorRangeAtPos(state, clamped)
  if (direct && clamped <= direct.from + 1) return direct

  return null
}

function isRubyAtPos(state: EditorState, pos: number): boolean {
  if (pos < 0 || pos > state.doc.content.size) return false
  return state.doc.resolve(pos).nodeAfter?.type.name === 'aozoraRuby'
}

function resolveRubyFrontDomSelection(
  view: EditorView,
): RubyBaseDomSelection | null {
  const selection = getRootSelection(view)
  if (!selection?.isCollapsed) return null

  const anchorElement = closestElement(selection.anchorNode)
  const baseElement = anchorElement?.closest('[data-aozora-base]')
  if (!baseElement) return null
  const rubyElement = baseElement.closest('[data-aozora-ruby]')
  if (!rubyElement || !view.dom.contains(rubyElement)) return null
  if (!isDomSelectionAtBaseStart(selection, baseElement)) return null

  let pos: number
  try {
    if (!selection.anchorNode) return null
    pos = view.posAtDOM(selection.anchorNode, selection.anchorOffset)
  } catch {
    return null
  }

  const range = resolveRubyRangeAtBaseStartPos(view.state, pos)
  if (!range) return null
  const node = view.state.doc.nodeAt(range.from)
  if (node?.type.name !== 'aozoraRuby') return null
  return { pos, range }
}

function normalizeRubyFrontDomSelectionBeforeNode(
  view: EditorView,
  dispatch?: (tr: Transaction) => void,
): { from: number; to: number; pos: number } | null {
  const resolved = resolveRubyFrontDomSelection(view)
  if (!resolved) return null
  const tr = view.state.tr
    .setSelection(TextSelection.create(view.state.doc, resolved.range.from))
    .setStoredMarks([])
  if (dispatch) dispatch(tr)
  return {
    from: resolved.range.from,
    to: resolved.range.to,
    pos: resolved.pos,
  }
}

function resolveValidRubyFrontCompositionPending(
  view: EditorView,
): RubyFrontCompositionPending | null {
  const pending = rubyFrontCompositionPending.get(view)
  if (!pending) return null
  if (!isRubyAtPos(view.state, pending.insertPos)) {
    rubyFrontCompositionPending.delete(view)
    return null
  }
  return pending
}

function resolveRubyBaseTextAtPos(
  state: EditorState,
  pos: number,
): string | null {
  if (pos < 0 || pos > state.doc.content.size) return null
  const node = state.doc.nodeAt(pos)
  if (node?.type.name !== 'aozoraRuby') return null
  return node.textContent
}

function isCompositionInsertInput(event: InputEvent, inputType: string): boolean {
  return inputType.startsWith('insertComposition') ||
    (inputType.startsWith('insert') && event.isComposing)
}

function insertTextAtCurrentSelection(
  view: EditorView,
  text: string,
): void {
  const tr = view.state.tr
    .insertText(text)
    .setStoredMarks([])
    .scrollIntoView()
  view.dispatch(tr)
}

function commitTextAtRubyFrontCompositionPending(
  view: EditorView,
  pending: RubyFrontCompositionPending,
  text: string,
): void {
  const insertPos = Math.max(0, Math.min(pending.insertPos, view.state.doc.content.size))
  const currentBaseText = resolveRubyBaseTextAtPos(view.state, insertPos)
  let tr = view.state.tr

  if (
    currentBaseText != null &&
    currentBaseText.length > pending.originalBaseText.length &&
    currentBaseText.endsWith(pending.originalBaseText)
  ) {
    const pollutedPrefixLength = currentBaseText.length - pending.originalBaseText.length
    const baseStart = insertPos + 1
    tr = tr.delete(baseStart, baseStart + pollutedPrefixLength)
  }

  if (text.length > 0) {
    tr = tr.insertText(text, insertPos, insertPos)
  }
  tr = tr.setStoredMarks([]).scrollIntoView()
  view.dispatch(tr)
}

function createRubyFrontCompositionPending(
  view: EditorView,
  insertPos: number,
  text: string,
): RubyFrontCompositionPending | null {
  const originalBaseText = resolveRubyBaseTextAtPos(view.state, insertPos)
  if (originalBaseText == null) return null
  return {
    insertPos,
    originalBaseText,
    text,
  }
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

  if (isDomSelectionAtBaseStart(selection, baseElement)) {
    const front = resolveRubyRangeAtBaseStartPos(view.state, pos)
    if (front) return null
  }

  const range = resolveRubyRangeNearPos(view.state, pos)
  if (!range) return null
  const node = view.state.doc.nodeAt(range.from)
  if (node?.type.name !== 'aozoraRuby') return null
  return { pos, range }
}

function resolveRubyBaseDomTarget(
  view: EditorView,
  target: EventTarget | null,
): RubyBaseDomSelection | null {
  const anchorElement = closestElement(target instanceof Node ? target : null)
  const baseElement = anchorElement?.closest('[data-aozora-base]')
  if (!baseElement) return null
  const rubyElement = baseElement.closest('[data-aozora-ruby]')
  if (!rubyElement || !view.dom.contains(rubyElement)) return null

  const nextSibling = rubyElement.nextSibling
  if (
    nextSibling instanceof HTMLElement &&
    nextSibling.getAttribute('data-nyoze-special-inline-boundary') === 'after' &&
    nextSibling.getAttribute('data-nyoze-special-inline-node') === 'aozoraRuby'
  ) {
    const insertPos = Number(nextSibling.dataset.nyozeSpecialInlineBoundaryPos)
    if (Number.isInteger(insertPos)) {
      const range = resolveRubyRangeNearPos(view.state, insertPos)
      if (range && view.state.doc.nodeAt(range.from)?.type.name === 'aozoraRuby') {
        return { pos: insertPos, range }
      }
    }
  }

  const candidateDomPoints: Array<{ node: Node; offset: number }> = []
  const lastChild = baseElement.lastChild
  if (lastChild?.nodeType === Node.TEXT_NODE) {
    candidateDomPoints.push({
      node: lastChild,
      offset: lastChild.textContent?.length ?? 0,
    })
  }
  const firstChild = baseElement.firstChild
  if (firstChild?.nodeType === Node.TEXT_NODE) {
    candidateDomPoints.push({ node: firstChild, offset: 0 })
  }
  candidateDomPoints.push(
    { node: baseElement, offset: baseElement.childNodes.length },
    { node: baseElement, offset: 0 },
  )

  for (const point of candidateDomPoints) {
    try {
      const pos = view.posAtDOM(point.node, point.offset)
      const range = resolveRubyRangeNearPos(view.state, pos)
      if (!range) continue
      const node = view.state.doc.nodeAt(range.from)
      if (node?.type.name !== 'aozoraRuby') continue
      return { pos, range }
    } catch {
      // Try the next mapping candidate.
    }
  }

  return null
}

function createRubyAfterSelection(
  view: EditorView,
  insertPos: number,
): PMSelection {
  try {
    return TextSelection.create(view.state.doc, insertPos)
  } catch {
    return PMSelection.near(view.state.doc.resolve(insertPos), 1)
  }
}

export function normalizeRubyBaseDomSelectionAfterNode(
  view: EditorView,
  dispatch?: (tr: Transaction) => void,
): { from: number; to: number; pos: number } | null {
  const resolved = resolveRubyBaseDomSelection(view)
  if (!resolved) return null
  const selection = createRubyAfterSelection(view, resolved.range.to)
  const tr = view.state.tr.setSelection(selection)
  if (dispatch) dispatch(tr)
  return {
    from: resolved.range.from,
    to: resolved.range.to,
    pos: resolved.pos,
  }
}

function normalizeRubyBaseDomTargetAfterNode(
  view: EditorView,
  target: EventTarget | null,
  dispatch?: (tr: Transaction) => void,
): { from: number; to: number; pos: number } | null {
  const resolved = resolveRubyBaseDomTarget(view, target)
  if (!resolved) return null
  const selection = createRubyAfterSelection(view, resolved.range.to)
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
  const normalizedFront = normalizeRubyFrontDomSelectionBeforeNode(view, (tr) =>
    view.dispatch(tr),
  )
  if (normalizedFront) {
    pushLog(
      'rubyBoundary',
      `normalizeBaseStartDomSelection@backspace pos=${normalizedFront.pos} range=${normalizedFront.from}->${normalizedFront.to}`,
    )
    return false
  }

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
  const normalizedFront = normalizeRubyFrontDomSelectionBeforeNode(view, (tr) =>
    view.dispatch(tr),
  )
  if (normalizedFront) {
    pushLog(
      'rubyBoundary',
      `normalizeBaseStartDomSelection@beforeinput:${inputType} pos=${normalizedFront.pos} range=${normalizedFront.from}->${normalizedFront.to}`,
    )
    if (
      inputType === 'insertText' &&
      typeof event.data === 'string' &&
        event.data.length > 0 &&
        !event.isComposing
    ) {
      event.preventDefault()
      insertTextAtCurrentSelection(view, event.data)
      pushLog(
        'rubyBoundary',
        `insertTextBeforeBaseStartDomSelection ${normalizedFront.from}+${event.data.length}`,
      )
      return true
    }
    if (isCompositionInsertInput(event, inputType)) {
      event.preventDefault()
      const pending = createRubyFrontCompositionPending(
        view,
        normalizedFront.from,
        typeof event.data === 'string' ? event.data : '',
      )
      if (pending) rubyFrontCompositionPending.set(view, pending)
      pushLog(
        'rubyBoundary',
        `suppressCompositionBeforeBaseStartDomSelection:${inputType} pos=${normalizedFront.from}`,
      )
      return true
    }
    return false
  }

  const pending = resolveValidRubyFrontCompositionPending(view)
  if (pending && isCompositionInsertInput(event, inputType)) {
    event.preventDefault()
    if (typeof event.data === 'string') pending.text = event.data
    pushLog(
      'rubyBoundary',
      `suppressPendingCompositionBeforeRuby:${inputType} pos=${pending.insertPos}`,
    )
    return true
  }

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
  ) ?? (
    isCompositionInsertInput(event, inputType)
      ? normalizeRubyBaseDomTargetAfterNode(view, event.target, (tr) => view.dispatch(tr))
      : null
  )
  if (!normalized) return false
  pushLog(
    'rubyBoundary',
    `normalizeBaseDomSelection@beforeinput:${inputType} pos=${normalized.pos} range=${normalized.from}->${normalized.to}`,
  )
  if (!isCompositionInsertInput(event, inputType)) return false

  const mirrored = mirrorSpecialInlineBoundaryCompositionPayload(
    view,
    'aozoraRuby',
    normalized.to,
    typeof event.data === 'string' ? event.data : '',
  )
  if (!mirrored) {
    pushLog(
      'rubyBoundary',
      `bridgeAfterRubyCompositionMirrorMiss@beforeinput:${inputType} pos=${normalized.to}`,
    )
    return false
  }

  event.preventDefault()
  pushLog(
    'rubyBoundary',
    `bridgeAfterRubyCompositionToSentinel@beforeinput:${inputType} pos=${normalized.to}`,
  )
  return true
}

export function handleRubyBaseCompositionStart(
  view: EditorView,
  event: CompositionEvent,
  { pushLog }: RubyBoundaryEventOptions,
): boolean {
  const normalizedFront = normalizeRubyFrontDomSelectionBeforeNode(view, (tr) =>
    view.dispatch(tr),
  )
  if (normalizedFront) {
    const pending = createRubyFrontCompositionPending(view, normalizedFront.from, '')
    if (pending) rubyFrontCompositionPending.set(view, pending)
    pushLog(
      'rubyBoundary',
      `normalizeBaseStartDomSelection@compositionstart pos=${normalizedFront.pos} range=${normalizedFront.from}->${normalizedFront.to}`,
    )
    return true
  }

  const normalized = normalizeRubyBaseDomSelectionAfterNode(view, (tr) =>
    view.dispatch(tr),
  ) ?? normalizeRubyBaseDomTargetAfterNode(view, event.target, (tr) =>
    view.dispatch(tr),
  )
  if (!normalized) return false
  const primed = mirrorSpecialInlineBoundaryCompositionPayload(
    view,
    'aozoraRuby',
    normalized.to,
    '',
  )
  if (!primed) {
    pushLog(
      'rubyBoundary',
      `bridgeAfterRubyCompositionMirrorMiss@compositionstart pos=${normalized.pos} range=${normalized.from}->${normalized.to}`,
    )
    return false
  }

  pushLog(
    'rubyBoundary',
    `bridgeAfterRubyCompositionToSentinel@compositionstart pos=${normalized.pos} range=${normalized.from}->${normalized.to}`,
  )
  return true
}

export function handleRubyBaseCompositionEnd(
  view: EditorView,
  event: CompositionEvent,
  { pushLog }: RubyBoundaryEventOptions,
): boolean {
  const pending = resolveValidRubyFrontCompositionPending(view)
  if (pending) {
    rubyFrontCompositionPending.delete(view)
    const text = event.data && event.data.length > 0 ? event.data : pending.text
    commitTextAtRubyFrontCompositionPending(view, pending, text)
    pushLog(
      'rubyBoundary',
      `commitCompositionBeforeRuby pos=${pending.insertPos}+${text.length}`,
    )
    return true
  }

  const normalized = normalizeRubyBaseDomSelectionAfterNode(view, (tr) =>
    view.dispatch(tr),
  ) ?? normalizeRubyBaseDomTargetAfterNode(view, event.target, (tr) =>
    view.dispatch(tr),
  )
  if (!normalized) return false

  const transferred = transferSpecialInlineBoundarySentinelTextAtPos(
    view,
    'aozoraRuby',
    normalized.to,
    event.data ?? null,
  )
  pushLog(
    'rubyBoundary',
    transferred
      ? `bridgeAfterRubyCompositionToSentinel@compositionend pos=${normalized.to}`
      : `bridgeAfterRubyCompositionTransferMiss@compositionend pos=${normalized.to}`,
  )
  return transferred
}
