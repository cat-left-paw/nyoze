import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import {
  classifySpecialInlineStoredMarksState,
  emitSpecialInlineSentinelDecisionDiag,
  isSpecialInlineBoundaryDiagEnabled,
  selectionTouchesSpecialInlineNode,
  type SpecialInlineSentinelDecision,
  type SpecialInlineSentinelDecisionOrigin,
  type SpecialInlineSentinelPayloadSource,
  type SpecialInlineStoredMarksState,
} from '../features/specialInlineBoundaryDiagnostics'

const SPECIAL_INLINE_NODE_TYPES = new Set(['aozoraRuby', 'aozoraTcy'])
const SENTINEL_SELECTOR = '[data-nyoze-special-inline-boundary="after"]'

// 句読点行頭落ちを避けるため WORD JOINER (`\u2060`) を no-break sentinel として使う。
// 過去 DOM やコピー経路に旧 ZWSP (`\u200B`) が残る可能性があるので、payload 抽出では両方を除去する。
export const SPECIAL_INLINE_BOUNDARY_SENTINEL_TEXT = '\u2060'

export const specialInlineBoundarySentinelPluginKey = new PluginKey(
  'nyozeSpecialInlineBoundarySentinel',
)

/** composing 中は Chromium が sentinel DOM を正規化して空にすることがあり、IME バッファはここに鏡像する */
const boundarySentinelCompositionPending = new Map<string, string>()
const boundarySentinelPostEscapeSuppressUntil = new Map<string, number>()
let boundarySentinelGlobalPostEscapeSuppressUntil = 0
const POST_ESCAPE_SUPPRESSION_MS = 1000

function sentinelCompositionPendingKey(sentinel: HTMLElement): string {
  const node = sentinel.dataset.nyozeSpecialInlineNode ?? ''
  const pos = sentinel.dataset.nyozeSpecialInlineBoundaryPos ?? ''
  return `${node}:${pos}`
}

/** E2E / 診断用（単一エディタ前提） */
export function snapshotSpecialInlineBoundaryCompositionPendingForE2e(): Record<string, string> {
  return Object.fromEntries(boundarySentinelCompositionPending)
}

/** doc / widget が差し替わったあとに残る orphaned pending を落とす */
function pruneStaleBoundarySentinelPending(view: EditorView) {
  const validKeys = new Set(
    Array.from(view.dom.querySelectorAll<HTMLElement>(SENTINEL_SELECTOR)).map(
      sentinelCompositionPendingKey,
    ),
  )
  for (const key of boundarySentinelCompositionPending.keys()) {
    if (!validKeys.has(key)) boundarySentinelCompositionPending.delete(key)
  }
}

/** plugin destroy 時: DOM に sentinel が残っていると prune だけでは pending が残るため、該当 key をすべて削除する */
function clearBoundarySentinelPendingForView(view: EditorView) {
  for (const sentinel of view.dom.querySelectorAll<HTMLElement>(SENTINEL_SELECTOR)) {
    const key = sentinelCompositionPendingKey(sentinel)
    boundarySentinelCompositionPending.delete(key)
    boundarySentinelPostEscapeSuppressUntil.delete(key)
  }
  boundarySentinelGlobalPostEscapeSuppressUntil = 0
}

function markBoundarySentinelPostEscapeSuppressed(sentinel: HTMLElement, key: string): void {
  const until = Date.now() + POST_ESCAPE_SUPPRESSION_MS
  boundarySentinelPostEscapeSuppressUntil.set(key, until)
  sentinel.dataset.nyozeSpecialInlineSuppressAfterEscapeUntil = String(until)
  boundarySentinelGlobalPostEscapeSuppressUntil = Math.max(
    boundarySentinelGlobalPostEscapeSuppressUntil,
    until,
  )
}

function clearBoundarySentinelPostEscapeSuppression(sentinel: HTMLElement, key: string): void {
  boundarySentinelPostEscapeSuppressUntil.delete(key)
  delete sentinel.dataset.nyozeSpecialInlineSuppressAfterEscapeUntil
}

function shouldSuppressBoundarySentinelPostEscapeEvent(
  sentinel: HTMLElement,
  key: string,
  event: Event,
): boolean {
  const now = Date.now()
  const keyUntil = boundarySentinelPostEscapeSuppressUntil.get(key) ?? 0
  const domUntil = Number(sentinel.dataset.nyozeSpecialInlineSuppressAfterEscapeUntil)
  const until = Math.max(
    keyUntil,
    Number.isFinite(domUntil) ? domUntil : 0,
    boundarySentinelGlobalPostEscapeSuppressUntil,
  )
  if (until === 0) return false
  if (now > until) {
    clearBoundarySentinelPostEscapeSuppression(sentinel, key)
    if (now > boundarySentinelGlobalPostEscapeSuppressUntil) {
      boundarySentinelGlobalPostEscapeSuppressUntil = 0
    }
    return false
  }
  return event.type === 'compositionend' ||
    (event instanceof InputEvent && event.type === 'input' && !event.isComposing)
}

// --- IME-B1 診断（挙動非変更・診断 OFF 時はフラグ確認のみ） ---

/** sentinel が canonical（WORD JOINER 単独）か。診断の読み取り専用チェック */
function isSentinelCanonicalForDiag(sentinel: HTMLElement): boolean {
  return sentinel.textContent === SPECIAL_INLINE_BOUNDARY_SENTINEL_TEXT
}

function readSentinelBoundaryPosForDiag(sentinel: HTMLElement): number | null {
  const pos = Number(sentinel.dataset.nyozeSpecialInlineBoundaryPos)
  return Number.isInteger(pos) ? pos : null
}

type SentinelDecisionDiagInput = {
  origin: SpecialInlineSentinelDecisionOrigin
  decision: SpecialInlineSentinelDecision
  event: Event | null
  directSentinelTarget: boolean
  alreadyHandled: boolean
  viewComposingBefore?: boolean
  viewComposingAfter?: boolean | null
  storedMarksState?: SpecialInlineStoredMarksState
  payloadSource?: SpecialInlineSentinelPayloadSource
  payloadLength?: number
  pendingLength?: number
  insertPos?: number | null
  sentinelCanonicalBeforeReset?: boolean | null
  sentinelNodeType?: string | null
}

/**
 * IME-B1: sentinel の入口(origin)と分岐(decision)を診断 ring へ記録する。
 * `__NYOZE_DIAG_SPECIAL_INLINE__` が無効なら何もしない。
 * payload / pending は本文を載せず長さのみ。DOM・selection・PM state は変更しない。
 */
function emitSentinelDecisionDiag(
  view: EditorView,
  input: SentinelDecisionDiagInput,
): void {
  if (!isSpecialInlineBoundaryDiagEnabled()) return
  const event = input.event
  emitSpecialInlineSentinelDecisionDiag({
    origin: input.origin,
    decision: input.decision,
    eventType: event?.type ?? 'none',
    eventIsComposing: event instanceof InputEvent ? event.isComposing : null,
    eventCancelable: event?.cancelable ?? false,
    directSentinelTarget: input.directSentinelTarget,
    alreadyHandled: input.alreadyHandled,
    viewComposingBefore: input.viewComposingBefore ?? view.composing,
    viewComposingAfter: input.viewComposingAfter ?? null,
    storedMarksState:
      input.storedMarksState ??
      classifySpecialInlineStoredMarksState(view.state.storedMarks),
    payloadSource: input.payloadSource ?? 'none',
    payloadLength: input.payloadLength ?? 0,
    pendingLength: input.pendingLength ?? 0,
    insertPos: input.insertPos ?? null,
    sentinelCanonicalBeforeReset: input.sentinelCanonicalBeforeReset ?? null,
    sentinelNodeType: input.sentinelNodeType ?? null,
  })
}

function sentinelHasRecoverableBoundaryBuffer(sentinel: HTMLElement): boolean {
  const key = sentinelCompositionPendingKey(sentinel)
  const pending = boundarySentinelCompositionPending.get(key)
  if (pending != null && pending.length > 0) return true
  return extractSpecialInlineBoundarySentinelPayload(sentinel).length > 0
}

/**
 * Esc で sentinel / pending の異常状態から復帰する（未確定 payload は PM に入れない）。
 * IME が Esc を先に消費する環境では 2 回目で届く場合がある — 挙動を過信しないこと。
 */
function handleEscapeSpecialInlineBoundaryRecovery(
  view: EditorView,
  event: KeyboardEvent,
): boolean {
  if (event.key !== 'Escape') return false
  if (event.altKey || event.metaKey || event.ctrlKey) return false

  const stuck: HTMLElement[] = []
  for (const el of view.dom.querySelectorAll<HTMLElement>(SENTINEL_SELECTOR)) {
    if (!isBoundarySentinel(el)) continue
    const nodeTypeName = el.dataset.nyozeSpecialInlineNode ?? ''
    if (!SPECIAL_INLINE_NODE_TYPES.has(nodeTypeName)) continue
    if (sentinelHasRecoverableBoundaryBuffer(el)) stuck.push(el)
  }
  if (stuck.length === 0) return false

  if (isSpecialInlineBoundaryDiagEnabled()) {
    for (const sentinel of stuck) {
      const key = sentinelCompositionPendingKey(sentinel)
      const pendingLength = boundarySentinelCompositionPending.get(key)?.length ?? 0
      const domPayloadLength =
        extractSpecialInlineBoundarySentinelPayload(sentinel).length
      emitSentinelDecisionDiag(view, {
        origin: 'escape-keydown',
        decision: 'escape-recovery',
        event,
        directSentinelTarget: Boolean(closestBoundarySentinel(event.target)),
        alreadyHandled: false,
        payloadSource: pendingLength > 0 ? 'pending' : domPayloadLength > 0 ? 'dom' : 'none',
        payloadLength: domPayloadLength,
        pendingLength,
        insertPos: readSentinelBoundaryPosForDiag(sentinel),
        sentinelCanonicalBeforeReset: isSentinelCanonicalForDiag(sentinel),
        sentinelNodeType: sentinel.dataset.nyozeSpecialInlineNode ?? null,
      })
    }
  }

  for (const sentinel of stuck) {
    const key = sentinelCompositionPendingKey(sentinel)
    boundarySentinelCompositionPending.delete(key)
    markBoundarySentinelPostEscapeSuppressed(sentinel, key)
    resetBoundarySentinel(sentinel)
  }

  let anchorInsertPos: number | null = null
  for (const sentinel of stuck) {
    const pos = resolveBoundaryInsertPos(view, sentinel)
    if (pos !== null) {
      anchorInsertPos = pos
      break
    }
  }

  if (anchorInsertPos !== null) {
    const tr = view.state.tr
      .setSelection(TextSelection.create(view.state.doc, anchorInsertPos))
      .setStoredMarks([])
    view.dispatch(tr)
  }

  view.focus()
  event.preventDefault()
  event.stopPropagation()
  return true
}

function createBoundarySentinel(nodeTypeName: string, boundaryPos: number): HTMLElement {
  const span = document.createElement('span')
  span.className = 'nyoze-special-inline-boundary'
  span.dataset.nyozeSpecialInlineBoundary = 'after'
  span.dataset.nyozeSpecialInlineNode = nodeTypeName
  span.dataset.nyozeSpecialInlineBoundaryPos = String(boundaryPos)
  span.setAttribute('contenteditable', 'true')
  span.spellcheck = false
  span.textContent = SPECIAL_INLINE_BOUNDARY_SENTINEL_TEXT
  return span
}

function closestElement(node: EventTarget | Node | null): Element | null {
  if (!node || !(node instanceof Node)) return null
  return node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement
}

function isBoundarySentinel(element: Element | null): element is HTMLElement {
  return Boolean(element?.matches(SENTINEL_SELECTOR))
}

function closestBoundarySentinel(target: EventTarget | Node | null): HTMLElement | null {
  const element = closestElement(target)
  const sentinel = element?.closest(SENTINEL_SELECTOR)
  return sentinel instanceof HTMLElement ? sentinel : null
}

export function extractSpecialInlineBoundarySentinelPayload(sentinel: HTMLElement): string {
  return (sentinel.textContent ?? '').replace(/[\u200B\u2060]/g, '')
}

function resetBoundarySentinel(sentinel: HTMLElement): void {
  sentinel.textContent = SPECIAL_INLINE_BOUNDARY_SENTINEL_TEXT
}

export type SpecialInlineBoundaryCompositionEndPayloadPick = {
  payload: string
  source: 'compositionend-data' | 'pending' | 'dom' | 'none'
}

/**
 * compositionend payload の優先順位（event.data → pending → DOM）を、
 * IME-B1 診断用の payload source 付きで返す純関数。優先順位は従来と同一。
 */
export function pickSpecialInlineBoundaryCompositionEndPayload(
  eventData: string | null,
  pending: string | null,
  domPayload: string,
): SpecialInlineBoundaryCompositionEndPayloadPick {
  if (eventData != null && eventData.length > 0) {
    return { payload: eventData, source: 'compositionend-data' }
  }
  if (pending != null && pending.length > 0) {
    return { payload: pending, source: 'pending' }
  }
  if (domPayload.length > 0) return { payload: domPayload, source: 'dom' }
  return { payload: '', source: 'none' }
}

function resolveCompositionEndPayloadPick(
  event: Event,
  sentinel: HTMLElement,
): SpecialInlineBoundaryCompositionEndPayloadPick {
  const eventData =
    event instanceof CompositionEvent && typeof event.data === 'string'
      ? event.data
      : null
  const key = sentinelCompositionPendingKey(sentinel)
  const pending = boundarySentinelCompositionPending.get(key) ?? null
  return pickSpecialInlineBoundaryCompositionEndPayload(
    eventData,
    pending,
    extractSpecialInlineBoundarySentinelPayload(sentinel),
  )
}

function resolveBoundaryInsertPosFromCandidate(
  doc: ProseMirrorNode,
  candidatePos: number,
  expectedNodeTypeName: string,
): number | null {
  if (!Number.isInteger(candidatePos)) return null
  if (candidatePos < 0 || candidatePos > doc.content.size) return null

  const $pos = doc.resolve(candidatePos)
  if ($pos.nodeBefore?.type.name === expectedNodeTypeName) return candidatePos
  if ($pos.nodeAfter?.type.name === expectedNodeTypeName) {
    return candidatePos + $pos.nodeAfter.nodeSize
  }
  return null
}

function collectBoundaryInsertPosCandidates(
  view: EditorView,
  sentinel: HTMLElement,
): number[] {
  const candidates: number[] = []
  const attrPos = Number(sentinel.dataset.nyozeSpecialInlineBoundaryPos)
  if (Number.isInteger(attrPos)) candidates.push(attrPos)

  for (const offset of [0, sentinel.childNodes.length]) {
    try {
      candidates.push(view.posAtDOM(sentinel, offset))
    } catch {
      // Try the next mapping strategy.
    }
  }

  const parent = sentinel.parentNode
  if (parent) {
    const index = Array.prototype.indexOf.call(parent.childNodes, sentinel)
    if (index >= 0) {
      for (const offset of [index, index + 1]) {
        try {
          candidates.push(view.posAtDOM(parent, offset))
        } catch {
          // Try the next mapping strategy.
        }
      }
    }
  }

  return [...new Set(candidates)]
}

function resolveBoundaryInsertPos(
  view: EditorView,
  sentinel: HTMLElement,
): number | null {
  const expectedNodeTypeName = sentinel.dataset.nyozeSpecialInlineNode ?? ''
  if (!SPECIAL_INLINE_NODE_TYPES.has(expectedNodeTypeName)) return null

  for (const candidate of collectBoundaryInsertPosCandidates(view, sentinel)) {
    const insertPos = resolveBoundaryInsertPosFromCandidate(
      view.state.doc,
      candidate,
      expectedNodeTypeName,
    )
    if (insertPos !== null) return insertPos
  }

  return null
}

function findBoundarySentinelAtPos(
  view: EditorView,
  nodeTypeName: string,
  insertPos: number,
): HTMLElement | null {
  const sentinels = [...view.dom.querySelectorAll<HTMLElement>(SENTINEL_SELECTOR)]
  const exact = view.dom.querySelector<HTMLElement>(
    `${SENTINEL_SELECTOR}[data-nyoze-special-inline-node="${nodeTypeName}"][data-nyoze-special-inline-boundary-pos="${insertPos}"]`,
  )
  if (exact && isBoundarySentinel(exact)) return exact

  for (const sentinel of sentinels) {
    if (!isBoundarySentinel(sentinel)) continue
    if ((sentinel.dataset.nyozeSpecialInlineNode ?? '') !== nodeTypeName) continue
    if (resolveBoundaryInsertPos(view, sentinel) === insertPos) return sentinel
  }

  return null
}

export function mirrorSpecialInlineBoundaryCompositionPayload(
  view: EditorView,
  nodeTypeName: string,
  insertPos: number,
  text: string,
): boolean {
  if (!SPECIAL_INLINE_NODE_TYPES.has(nodeTypeName)) return false
  const sentinel = findBoundarySentinelAtPos(view, nodeTypeName, insertPos)
  if (!sentinel) {
    emitSentinelDecisionDiag(view, {
      origin: 'ruby-bridge-mirror',
      decision: 'no-sentinel',
      event: null,
      directSentinelTarget: false,
      alreadyHandled: false,
      insertPos,
      sentinelNodeType: nodeTypeName,
    })
    return false
  }

  const sentinelCanonicalBeforeReset = isSpecialInlineBoundaryDiagEnabled()
    ? isSentinelCanonicalForDiag(sentinel)
    : null
  const key = sentinelCompositionPendingKey(sentinel)
  clearBoundarySentinelPostEscapeSuppression(sentinel, key)
  boundarySentinelGlobalPostEscapeSuppressUntil = 0
  resetBoundarySentinel(sentinel)
  boundarySentinelCompositionPending.set(key, text)
  emitSentinelDecisionDiag(view, {
    origin: 'ruby-bridge-mirror',
    decision: 'mirror',
    event: null,
    directSentinelTarget: false,
    alreadyHandled: false,
    payloadSource: text.length > 0 ? 'input-data' : 'none',
    payloadLength: text.length,
    pendingLength: text.length,
    insertPos,
    sentinelCanonicalBeforeReset,
    sentinelNodeType: nodeTypeName,
  })
  return true
}

function collectBoundarySentinelsToInspect(
  view: EditorView,
  target: EventTarget | null,
  event: Event,
): HTMLElement[] {
  const direct = closestBoundarySentinel(target)
  if (direct && view.dom.contains(direct)) return [direct]

  const isCompositionEnd = event.type === 'compositionend'
  const picked = new Set<HTMLElement>()
  for (const sentinel of view.dom.querySelectorAll<HTMLElement>(SENTINEL_SELECTOR)) {
    if (extractSpecialInlineBoundarySentinelPayload(sentinel).length > 0) {
      picked.add(sentinel)
      continue
    }
    if (!isCompositionEnd) continue
    const key = sentinelCompositionPendingKey(sentinel)
    const pending = boundarySentinelCompositionPending.get(key)
    if (pending != null && pending.length > 0) picked.add(sentinel)
  }
  return [...picked]
}

type SentinelTransferDiagContext = {
  origin: SpecialInlineSentinelDecisionOrigin
  alreadyHandled: boolean
}

function transferBoundarySentinelFromEvent(
  view: EditorView,
  target: EventTarget | null,
  event: Event,
  diagCtx: SentinelTransferDiagContext,
): boolean {
  const useCompositionEndPayload = event.type === 'compositionend'
  const diagEnabled = isSpecialInlineBoundaryDiagEnabled()
  const viewComposingBefore = view.composing
  const directSentinelTarget = diagEnabled
    ? Boolean(closestBoundarySentinel(target))
    : false
  let emittedSentinelDecision = false

  for (const sentinel of collectBoundarySentinelsToInspect(view, target, event)) {
    if (!isBoundarySentinel(sentinel)) continue
    const nodeTypeName = sentinel.dataset.nyozeSpecialInlineNode ?? ''
    if (!SPECIAL_INLINE_NODE_TYPES.has(nodeTypeName)) continue

    const pendingKey = sentinelCompositionPendingKey(sentinel)
    const diagPendingLength = diagEnabled
      ? boundarySentinelCompositionPending.get(pendingKey)?.length ?? 0
      : 0
    if (shouldSuppressBoundarySentinelPostEscapeEvent(sentinel, pendingKey, event)) {
      if (diagEnabled) {
        emittedSentinelDecision = true
        emitSentinelDecisionDiag(view, {
          origin: diagCtx.origin,
          decision: 'suppressed',
          event,
          directSentinelTarget,
          alreadyHandled: diagCtx.alreadyHandled,
          viewComposingBefore,
          pendingLength: diagPendingLength,
          sentinelCanonicalBeforeReset: isSentinelCanonicalForDiag(sentinel),
          sentinelNodeType: nodeTypeName,
        })
      }
      boundarySentinelCompositionPending.delete(pendingKey)
      if (event instanceof InputEvent && event.type === 'input' && !event.isComposing) {
        clearBoundarySentinelPostEscapeSuppression(sentinel, pendingKey)
        boundarySentinelGlobalPostEscapeSuppressUntil = 0
      }
      resetBoundarySentinel(sentinel)
      return true
    }

    let payloadPick: SpecialInlineBoundaryCompositionEndPayloadPick
    if (useCompositionEndPayload) {
      payloadPick = resolveCompositionEndPayloadPick(event, sentinel)
    } else {
      const domPayload = extractSpecialInlineBoundarySentinelPayload(sentinel)
      payloadPick =
        domPayload.length > 0
          ? { payload: domPayload, source: 'dom' }
          : { payload: '', source: 'none' }
    }
    const payload = payloadPick.payload

    if (!payload) {
      if (diagEnabled) {
        emittedSentinelDecision = true
        emitSentinelDecisionDiag(view, {
          origin: diagCtx.origin,
          decision: 'no-payload',
          event,
          directSentinelTarget,
          alreadyHandled: diagCtx.alreadyHandled,
          viewComposingBefore,
          pendingLength: diagPendingLength,
          sentinelCanonicalBeforeReset: isSentinelCanonicalForDiag(sentinel),
          sentinelNodeType: nodeTypeName,
        })
      }
      if (useCompositionEndPayload) boundarySentinelCompositionPending.delete(pendingKey)
      if (sentinel.textContent !== SPECIAL_INLINE_BOUNDARY_SENTINEL_TEXT) {
        resetBoundarySentinel(sentinel)
      }
      continue
    }

    const insertPos = resolveBoundaryInsertPos(view, sentinel)
    if (insertPos === null) {
      if (diagEnabled) {
        emittedSentinelDecision = true
        emitSentinelDecisionDiag(view, {
          origin: diagCtx.origin,
          decision: 'no-insert-pos',
          event,
          directSentinelTarget,
          alreadyHandled: diagCtx.alreadyHandled,
          viewComposingBefore,
          payloadSource: payloadPick.source,
          payloadLength: payload.length,
          pendingLength: diagPendingLength,
          sentinelCanonicalBeforeReset: isSentinelCanonicalForDiag(sentinel),
          sentinelNodeType: nodeTypeName,
        })
      }
      if (useCompositionEndPayload) boundarySentinelCompositionPending.delete(pendingKey)
      continue
    }

    const diagStoredMarksState = diagEnabled
      ? classifySpecialInlineStoredMarksState(view.state.storedMarks)
      : null
    const sentinelCanonicalBeforeReset = diagEnabled
      ? isSentinelCanonicalForDiag(sentinel)
      : null
    const textNode = view.state.schema.text(payload)
    resetBoundarySentinel(sentinel)

    const tr = view.state.tr.replaceWith(insertPos, insertPos, textNode)
    const insertedTo = insertPos + textNode.nodeSize
    tr.setSelection(TextSelection.create(tr.doc, insertedTo))
      .setStoredMarks([])
      .scrollIntoView()
    view.dispatch(tr)
    boundarySentinelCompositionPending.delete(pendingKey)
    if (diagEnabled) {
      emitSentinelDecisionDiag(view, {
        origin: diagCtx.origin,
        decision: 'transfer',
        event,
        directSentinelTarget,
        alreadyHandled: diagCtx.alreadyHandled,
        viewComposingBefore,
        viewComposingAfter: view.composing,
        storedMarksState: diagStoredMarksState ?? undefined,
        payloadSource: payloadPick.source,
        payloadLength: payload.length,
        pendingLength: diagPendingLength,
        insertPos,
        sentinelCanonicalBeforeReset,
        sentinelNodeType: nodeTypeName,
      })
    }
    return true
  }

  if (
    diagEnabled &&
    !emittedSentinelDecision &&
    (directSentinelTarget ||
      (useCompositionEndPayload && selectionTouchesSpecialInlineNode(view.state)))
  ) {
    emitSentinelDecisionDiag(view, {
      origin: diagCtx.origin,
      decision: 'ignored',
      event,
      directSentinelTarget,
      alreadyHandled: diagCtx.alreadyHandled,
      viewComposingBefore,
    })
  }

  return false
}

export function transferSpecialInlineBoundarySentinelText(
  view: EditorView,
  target: EventTarget | null,
): boolean {
  const synthetic = new Event('synthetic')
  return transferBoundarySentinelFromEvent(view, target, synthetic, {
    origin: 'synthetic-transfer',
    alreadyHandled: false,
  })
}

export function transferSpecialInlineBoundarySentinelTextAtPos(
  view: EditorView,
  nodeTypeName: string,
  insertPos: number,
  compositionEndPayload?: string | null,
): boolean {
  if (!SPECIAL_INLINE_NODE_TYPES.has(nodeTypeName)) return false
  const sentinel = findBoundarySentinelAtPos(view, nodeTypeName, insertPos)
  if (!sentinel) {
    emitSentinelDecisionDiag(view, {
      origin: 'ruby-bridge-transfer',
      decision: 'no-sentinel',
      event: null,
      directSentinelTarget: false,
      alreadyHandled: false,
      insertPos,
      sentinelNodeType: nodeTypeName,
    })
    return false
  }

  if (typeof compositionEndPayload === 'string' && compositionEndPayload.length > 0) {
    boundarySentinelCompositionPending.set(
      sentinelCompositionPendingKey(sentinel),
      compositionEndPayload,
    )
  }

  const syntheticEvent =
    typeof CompositionEvent !== 'undefined'
      ? new CompositionEvent('compositionend', {
          bubbles: false,
          data: typeof compositionEndPayload === 'string' ? compositionEndPayload : '',
        })
      : new Event('compositionend')
  return transferBoundarySentinelFromEvent(view, sentinel, syntheticEvent, {
    origin: 'ruby-bridge-transfer',
    alreadyHandled: false,
  })
}

export function buildSpecialInlineBoundarySentinelDecorations(
  doc: ProseMirrorNode,
): DecorationSet {
  const decorations: Decoration[] = []

  doc.descendants((node, pos) => {
    const nodeTypeName = node.type.name
    if (!SPECIAL_INLINE_NODE_TYPES.has(nodeTypeName)) return true

    decorations.push(
      Decoration.widget(
        pos + node.nodeSize,
        () => createBoundarySentinel(nodeTypeName, pos + node.nodeSize),
        {
          key: `special-inline-boundary-after-${nodeTypeName}-${pos}`,
          raw: true,
          relaxedSide: true,
          side: -1,
        },
      ),
    )
    return false
  })

  return decorations.length > 0
    ? DecorationSet.create(doc, decorations)
    : DecorationSet.empty
}

export function createSpecialInlineBoundarySentinelPlugin(): Plugin {
  let cachedDoc: ProseMirrorNode | null = null
  let cachedDecorations: DecorationSet = DecorationSet.empty
  let pluginView: EditorView | null = null
  const handledEvents = new WeakSet<Event>()
  let transferring = false

  const transferFromEvent = (
    view: EditorView,
    event: Event,
    origin: SpecialInlineSentinelDecisionOrigin,
  ): boolean => {
    const diagEnabled = isSpecialInlineBoundaryDiagEnabled()
    if (transferring) {
      if (diagEnabled) {
        emitSentinelDecisionDiag(view, {
          origin,
          decision: 'reentrant',
          event,
          directSentinelTarget: Boolean(closestBoundarySentinel(event.target)),
          alreadyHandled: handledEvents.has(event),
        })
      }
      return false
    }

    // OS IME: composing 中の payload（ASCII / 非 ASCII を問わず）は PM doc に入れない。
    // compositionend の確定文字列だけを一度移送する。
    // composing 中は event.data / DOM を pending に鏡像する。
    // handleDOMEvents で true を返し、PM が composing input で doc を更新しないようにする。
    if (event instanceof InputEvent && event.type === 'input' && event.isComposing) {
      const sentinel = closestBoundarySentinel(event.target)
      if (sentinel) {
        const wasHandledForDiag = diagEnabled ? handledEvents.has(event) : false
        const sentinelCanonicalForDiag = diagEnabled
          ? isSentinelCanonicalForDiag(sentinel)
          : null
        clearBoundarySentinelPostEscapeSuppression(
          sentinel,
          sentinelCompositionPendingKey(sentinel),
        )
        boundarySentinelGlobalPostEscapeSuppressUntil = 0
        const fromDom = extractSpecialInlineBoundarySentinelPayload(sentinel)
        const fromEvent = typeof event.data === 'string' ? event.data : ''
        const merged = fromEvent.length > 0 ? fromEvent : fromDom
        if (merged.length > 0) {
          boundarySentinelCompositionPending.set(sentinelCompositionPendingKey(sentinel), merged)
        }
        if (diagEnabled) {
          emitSentinelDecisionDiag(view, {
            origin,
            decision: 'mirror',
            event,
            directSentinelTarget: true,
            alreadyHandled: wasHandledForDiag,
            payloadSource:
              fromEvent.length > 0 ? 'input-data' : merged.length > 0 ? 'dom' : 'none',
            payloadLength: merged.length,
            pendingLength: merged.length,
            insertPos: readSentinelBoundaryPosForDiag(sentinel),
            sentinelCanonicalBeforeReset: sentinelCanonicalForDiag,
            sentinelNodeType: sentinel.dataset.nyozeSpecialInlineNode ?? null,
          })
        }
        if (!handledEvents.has(event)) handledEvents.add(event)
        return true
      }
      if (!handledEvents.has(event)) handledEvents.add(event)
      return false
    }

    if (handledEvents.has(event)) {
      if (diagEnabled) {
        const directSentinelTarget = Boolean(closestBoundarySentinel(event.target))
        if (
          directSentinelTarget ||
          (event.type === 'compositionend' &&
            selectionTouchesSpecialInlineNode(view.state))
        ) {
          emitSentinelDecisionDiag(view, {
            origin,
            decision: 'already-handled',
            event,
            directSentinelTarget,
            alreadyHandled: true,
          })
        }
      }
      return false
    }

    transferring = true
    try {
      const transferred = transferBoundarySentinelFromEvent(view, event.target, event, {
        origin,
        alreadyHandled: false,
      })
      handledEvents.add(event)
      return transferred
    } finally {
      transferring = false
    }
  }

  return new Plugin({
    key: specialInlineBoundarySentinelPluginKey,

    appendTransaction(_trs, oldState, newState) {
      if (oldState.doc === newState.doc || !pluginView) return null
      const view = pluginView
      queueMicrotask(() => {
        pruneStaleBoundarySentinelPending(view)
      })
      return null
    },

    view(view) {
      pluginView = view
      const handleInput = (event: Event) => {
        transferFromEvent(view, event, 'native-capture-input')
      }
      const handleCompositionEnd = (event: Event) => {
        transferFromEvent(view, event, 'native-capture-compositionend')
      }
      const handleKeyDown = (event: KeyboardEvent) => {
        handleEscapeSpecialInlineBoundaryRecovery(view, event)
      }
      view.dom.addEventListener('input', handleInput, true)
      view.dom.addEventListener('compositionend', handleCompositionEnd, true)
      view.dom.addEventListener('keydown', handleKeyDown, true)
      return {
        destroy() {
          clearBoundarySentinelPendingForView(view)
          if (pluginView === view) pluginView = null
          view.dom.removeEventListener('input', handleInput, true)
          view.dom.removeEventListener('compositionend', handleCompositionEnd, true)
          view.dom.removeEventListener('keydown', handleKeyDown, true)
        },
      }
    },
    props: {
      handleDOMEvents: {
        compositionend(view, event) {
          return transferFromEvent(view, event, 'pm-handle-dom-compositionend')
        },
        input(view, event) {
          return transferFromEvent(view, event, 'pm-handle-dom-input')
        },
        keydown(view, event) {
          if (!(event instanceof KeyboardEvent)) return false
          return handleEscapeSpecialInlineBoundaryRecovery(view, event)
        },
      },
      decorations(state) {
        if (cachedDoc === state.doc) return cachedDecorations
        if (pluginView) pruneStaleBoundarySentinelPending(pluginView)
        cachedDoc = state.doc
        cachedDecorations = buildSpecialInlineBoundarySentinelDecorations(state.doc)
        return cachedDecorations
      },
    },
  })
}

export const SpecialInlineBoundarySentinel = Extension.create({
  name: 'specialInlineBoundarySentinel',

  addProseMirrorPlugins() {
    return [createSpecialInlineBoundarySentinelPlugin()]
  },
})
