import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection, type Transaction } from '@tiptap/pm/state'
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

/**
 * composing 中は Chromium が sentinel DOM を正規化して空にすることがあり、IME バッファはここに鏡像する。
 *
 * EDITOR-SPECIALINLINE-SENTINEL-PERF1: key は sentinel 要素そのもの。widget key を Ruby / TCY の
 * PM Node identity から作るため、本文の別の場所を編集しても sentinel DOM は作り直されず、
 * 要素 identity が安定する。position は使う時点で `view.posAtDOM(sentinel, 0)` から求める
 * （`resolveBoundaryInsertPos`）。DOM 属性に position は持たない。
 */
const boundarySentinelCompositionPending = new Map<HTMLElement, string>()
const boundarySentinelPostEscapeSuppressUntil = new Map<HTMLElement, number>()
/**
 * 位置を証明できなかった確定文字列（effective payload）。捨てずに sentinel の DOM に見える形で残し、
 * 位置を証明できた時点で既存の転送経路から exact 1 回だけ本文へ入れる。無関係な compositionend の
 * `event.data` で上書きされないよう、pending とは別に持つ（pending は composing 中の鏡像で、
 * compositionend で消える）。
 */
const boundarySentinelRetainedPayload = new Map<HTMLElement, string>()
let boundarySentinelGlobalPostEscapeSuppressUntil = 0
const POST_ESCAPE_SUPPRESSION_MS = 1000

/** Ruby / TCY の PM Node identity → widget key 用の番号（触れられなかった node は transaction 後も同じ object） */
const specialInlineNodeIds = new WeakMap<ProseMirrorNode, number>()
let nextSpecialInlineNodeId = 1

function buildSpecialInlineBoundarySentinelKey(node: ProseMirrorNode): string {
  let id = specialInlineNodeIds.get(node)
  if (id === undefined) {
    id = nextSpecialInlineNodeId++
    specialInlineNodeIds.set(node, id)
  }
  return `special-inline-boundary-after-${node.type.name}-${id}`
}

/** E2E / 診断用（単一エディタ前提）。key は種別と登録順で、値だけを見ること */
export function snapshotSpecialInlineBoundaryCompositionPendingForE2e(): Record<string, string> {
  const snapshot: Record<string, string> = {}
  let index = 0
  for (const [sentinel, text] of boundarySentinelCompositionPending) {
    snapshot[`${sentinel.dataset.nyozeSpecialInlineNode ?? ''}:${index++}`] = text
  }
  return snapshot
}

/**
 * 読み取り専用: この view につながっている sentinel に、Host の保留の入力が残っているか。
 * 数えるのは「変換中の記録」（空でないもの）と「位置を証明できずに保持している確定文字」だけ。
 * 「Esc の後の抑止」は時間で切れる記録なので数えない。view から外れた sentinel の entry も数えない。
 *
 * plugin view の作り直し（`registerPlugin` / `unregisterPlugin`）は、この view の帳簿を消す
 * （`clearBoundarySentinelPendingForView`）。保留が残っている間は、作り直しを起こす操作
 * （Paragraph Plain へ入る、入力面の最初の生成）を、呼び出し側が止めるために使う。
 */
export function hasPendingSpecialInlineBoundaryInput(view: EditorView): boolean {
  for (const [sentinel, text] of boundarySentinelCompositionPending) {
    if (text.length > 0 && sentinel.isConnected && view.dom.contains(sentinel)) return true
  }
  for (const sentinel of boundarySentinelRetainedPayload.keys()) {
    if (sentinel.isConnected && view.dom.contains(sentinel)) return true
  }
  return false
}

function hasBoundarySentinelBookkeeping(): boolean {
  return (
    boundarySentinelCompositionPending.size > 0 ||
    boundarySentinelPostEscapeSuppressUntil.size > 0 ||
    boundarySentinelRetainedPayload.size > 0
  )
}

/** doc / widget が差し替わったあとに残る orphaned entry（view から外れた要素）を落とす。空ならすぐ戻る */
function pruneStaleBoundarySentinelPending(view: EditorView) {
  if (!hasBoundarySentinelBookkeeping()) return
  for (const map of [
    boundarySentinelCompositionPending,
    boundarySentinelPostEscapeSuppressUntil,
    boundarySentinelRetainedPayload,
  ]) {
    for (const sentinel of map.keys()) {
      if (!sentinel.isConnected || !view.dom.contains(sentinel)) map.delete(sentinel)
    }
  }
}

/** plugin destroy 時: この view の sentinel に紐づく entry をすべて削除する */
function clearBoundarySentinelPendingForView(view: EditorView) {
  for (const map of [
    boundarySentinelCompositionPending,
    boundarySentinelPostEscapeSuppressUntil,
    boundarySentinelRetainedPayload,
  ]) {
    for (const sentinel of map.keys()) {
      if (view.dom.contains(sentinel)) map.delete(sentinel)
    }
  }
  boundarySentinelGlobalPostEscapeSuppressUntil = 0
}

function markBoundarySentinelPostEscapeSuppressed(sentinel: HTMLElement): void {
  const until = Date.now() + POST_ESCAPE_SUPPRESSION_MS
  boundarySentinelPostEscapeSuppressUntil.set(sentinel, until)
  sentinel.dataset.nyozeSpecialInlineSuppressAfterEscapeUntil = String(until)
  boundarySentinelGlobalPostEscapeSuppressUntil = Math.max(
    boundarySentinelGlobalPostEscapeSuppressUntil,
    until,
  )
}

function clearBoundarySentinelPostEscapeSuppression(sentinel: HTMLElement): void {
  boundarySentinelPostEscapeSuppressUntil.delete(sentinel)
  delete sentinel.dataset.nyozeSpecialInlineSuppressAfterEscapeUntil
}

function shouldSuppressBoundarySentinelPostEscapeEvent(
  sentinel: HTMLElement,
  event: Event,
): boolean {
  const now = Date.now()
  const keyUntil = boundarySentinelPostEscapeSuppressUntil.get(sentinel) ?? 0
  const domUntil = Number(sentinel.dataset.nyozeSpecialInlineSuppressAfterEscapeUntil)
  const until = Math.max(
    keyUntil,
    Number.isFinite(domUntil) ? domUntil : 0,
    boundarySentinelGlobalPostEscapeSuppressUntil,
  )
  if (until === 0) return false
  if (now > until) {
    clearBoundarySentinelPostEscapeSuppression(sentinel)
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

/** 診断表示用。position は DOM 属性ではなく、その時点の view から求める */
function readSentinelBoundaryPosForDiag(view: EditorView, sentinel: HTMLElement): number | null {
  return resolveBoundaryInsertPos(view, sentinel)
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
  const pending = boundarySentinelCompositionPending.get(sentinel)
  if (pending != null && pending.length > 0) return true
  if (boundarySentinelRetainedPayload.has(sentinel)) return true
  return extractSpecialInlineBoundarySentinelPayload(sentinel).length > 0
}

/**
 * Esc で sentinel / pending の異常状態から復帰する（未確定 payload は PM に入れない）。
 * IME が Esc を先に消費する環境では 2 回目で届く場合がある — 挙動を過信しないこと。
 *
 * 位置を証明できずに保持している確定文字列（retained）は未確定ではないので黙って捨てない。
 * 既存の転送経路で位置の証明をやり直し、証明できれば exact 1 回だけ本文へ入れ、
 * できなければ見える形のまま残す。
 */
function handleEscapeSpecialInlineBoundaryRecovery(
  view: EditorView,
  event: KeyboardEvent,
): boolean {
  if (event.key !== 'Escape') return false
  if (event.altKey || event.metaKey || event.ctrlKey) return false

  const stuck: HTMLElement[] = []
  const retained: HTMLElement[] = []
  for (const el of view.dom.querySelectorAll<HTMLElement>(SENTINEL_SELECTOR)) {
    if (!isBoundarySentinel(el)) continue
    const nodeTypeName = el.dataset.nyozeSpecialInlineNode ?? ''
    if (!SPECIAL_INLINE_NODE_TYPES.has(nodeTypeName)) continue
    if (boundarySentinelRetainedPayload.has(el)) retained.push(el)
    else if (sentinelHasRecoverableBoundaryBuffer(el)) stuck.push(el)
  }
  if (stuck.length === 0 && retained.length === 0) return false

  // 保持文字列は Esc の本来の役割（未確定 payload の破棄）とは別に、位置の証明をやり直すだけ。
  // 利用者の caret を動かさず、保持だけのときは Esc を消費しない（他の用途の Esc を横取りしない）。
  for (const sentinel of retained) {
    transferBoundarySentinelFromEvent(view, sentinel, new Event('synthetic'), {
      origin: 'escape-keydown',
      alreadyHandled: false,
      keepUserCaret: true,
    })
  }
  if (stuck.length === 0) return false

  if (isSpecialInlineBoundaryDiagEnabled()) {
    for (const sentinel of stuck) {
      const pendingLength = boundarySentinelCompositionPending.get(sentinel)?.length ?? 0
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
        insertPos: readSentinelBoundaryPosForDiag(view, sentinel),
        sentinelCanonicalBeforeReset: isSentinelCanonicalForDiag(sentinel),
        sentinelNodeType: sentinel.dataset.nyozeSpecialInlineNode ?? null,
      })
    }
  }

  for (const sentinel of stuck) {
    boundarySentinelCompositionPending.delete(sentinel)
    markBoundarySentinelPostEscapeSuppressed(sentinel)
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

/** sentinel の DOM。position は持たない（使う時点で `resolveBoundaryInsertPos` が view から求める） */
function createBoundarySentinel(nodeTypeName: string): HTMLElement {
  const span = document.createElement('span')
  span.className = 'nyoze-special-inline-boundary'
  span.dataset.nyozeSpecialInlineBoundary = 'after'
  span.dataset.nyozeSpecialInlineNode = nodeTypeName
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
  const pending = boundarySentinelCompositionPending.get(sentinel) ?? null
  return pickSpecialInlineBoundaryCompositionEndPayload(
    eventData,
    pending,
    extractSpecialInlineBoundarySentinelPayload(sentinel),
  )
}

/**
 * sentinel の境界 position を、その時点の view から求める（DOM→PM）。
 *
 * 正本は widget desc に基づく `view.posAtDOM(sentinel, 0)`（`WidgetViewDesc` は size 0 なので
 * 自身の position を返し、Ruby 約物 run wrapper のような PM desc を持たない表示専用要素の内側でも
 * 影響を受けない）。得た position を `$pos.nodeBefore` の種別と、その node の DOM が sentinel の
 * 直前の要素であること（identity）で再証明する。親要素＋index の候補と `nodeAfter` 側の救済は
 * 持たない（run wrapper の内側で別の Ruby の直後へ解決し得るため）。証明できなければ `null`。
 */
function resolveBoundaryInsertPos(
  view: EditorView,
  sentinel: HTMLElement,
): number | null {
  const expectedNodeTypeName = sentinel.dataset.nyozeSpecialInlineNode ?? ''
  if (!SPECIAL_INLINE_NODE_TYPES.has(expectedNodeTypeName)) return null
  if (!sentinel.isConnected || !view.dom.contains(sentinel)) return null

  let pos: number
  try {
    pos = view.posAtDOM(sentinel, 0)
  } catch {
    return null
  }
  const doc = view.state.doc
  if (!Number.isInteger(pos) || pos < 0 || pos > doc.content.size) return null

  const $pos = doc.resolve(pos)
  const nodeBefore = $pos.nodeBefore
  if (!nodeBefore || nodeBefore.type.name !== expectedNodeTypeName) return null

  let nodeDom: Node | null
  try {
    nodeDom = view.nodeDOM(pos - nodeBefore.nodeSize)
  } catch {
    return null
  }
  if (!nodeDom || nodeDom !== sentinel.previousElementSibling) return null
  return pos
}

/**
 * PM で決めた境界 position の sentinel を引く（PM→DOM）。`$pos.nodeBefore` の DOM の直後の要素が
 * sentinel であることと、DOM→PM の往復（`resolveBoundaryInsertPos`）が同じ position に戻ることを要求する。
 * 全 sentinel の走査は行わない（証明できなければ `null`）。
 */
function findBoundarySentinelAtPos(
  view: EditorView,
  nodeTypeName: string,
  insertPos: number,
): HTMLElement | null {
  const doc = view.state.doc
  if (!Number.isInteger(insertPos) || insertPos < 0 || insertPos > doc.content.size) return null
  const nodeBefore = doc.resolve(insertPos).nodeBefore
  if (!nodeBefore || nodeBefore.type.name !== nodeTypeName) return null

  let nodeDom: Node | null
  try {
    nodeDom = view.nodeDOM(insertPos - nodeBefore.nodeSize)
  } catch {
    return null
  }
  if (!(nodeDom instanceof Element)) return null
  const candidate = nodeDom.nextElementSibling
  if (!isBoundarySentinel(candidate)) return null
  if ((candidate.dataset.nyozeSpecialInlineNode ?? '') !== nodeTypeName) return null
  if (resolveBoundaryInsertPos(view, candidate) !== insertPos) return null
  return candidate
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

  // 位置を証明できずに保持している確定文字列があれば、先に既存の転送経路で本文へ入れる。
  // まだ証明できないなら新しい composition の受け口にはしない（保持文字を上書きしない）。
  if (boundarySentinelRetainedPayload.has(sentinel)) {
    transferBoundarySentinelFromEvent(view, sentinel, new Event('synthetic'), {
      origin: 'ruby-bridge-mirror',
      alreadyHandled: false,
    })
    if (boundarySentinelRetainedPayload.has(sentinel)) return false
  }

  const sentinelCanonicalBeforeReset = isSpecialInlineBoundaryDiagEnabled()
    ? isSentinelCanonicalForDiag(sentinel)
    : null
  clearBoundarySentinelPostEscapeSuppression(sentinel)
  boundarySentinelGlobalPostEscapeSuppressUntil = 0
  resetBoundarySentinel(sentinel)
  boundarySentinelCompositionPending.set(sentinel, text)
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
    if (boundarySentinelRetainedPayload.has(sentinel)) {
      picked.add(sentinel)
      continue
    }
    if (extractSpecialInlineBoundarySentinelPayload(sentinel).length > 0) {
      picked.add(sentinel)
      continue
    }
    if (!isCompositionEnd) continue
    const pending = boundarySentinelCompositionPending.get(sentinel)
    if (pending != null && pending.length > 0) picked.add(sentinel)
  }
  return [...picked]
}

/**
 * 位置を証明できずに保持している確定文字列（retained）の、この event での effective payload。
 * 利用者が同じ sentinel に続けて入力した分（DOM が保持文字列で始まりそれより長い）はその DOM を、
 * それ以外は保持文字列＋`compositionend` の `event.data` を使う。無関係な composition の
 * `event.data` で保持文字列を置き換えることはない。
 */
function resolveRetainedPayloadPick(
  sentinel: HTMLElement,
  retained: string,
  event: Event,
): SpecialInlineBoundaryCompositionEndPayloadPick {
  const domPayload = extractSpecialInlineBoundarySentinelPayload(sentinel)
  if (domPayload.length > retained.length && domPayload.startsWith(retained)) {
    return { payload: domPayload, source: 'dom' }
  }
  const direct = closestBoundarySentinel(event.target) === sentinel
  const eventData =
    direct && event instanceof CompositionEvent && typeof event.data === 'string'
      ? event.data
      : ''
  return { payload: `${retained}${eventData}`, source: 'pending' }
}

type SentinelTransferDiagContext = {
  origin: SpecialInlineSentinelDecisionOrigin
  alreadyHandled: boolean
  /** 保持文字列の転送で利用者の caret を動かさない（Esc 等、利用者の操作が転送の対象 sentinel と無関係なとき） */
  keepUserCaret?: boolean
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
  let transferredRetained = false

  for (const sentinel of collectBoundarySentinelsToInspect(view, target, event)) {
    if (!isBoundarySentinel(sentinel)) continue
    const nodeTypeName = sentinel.dataset.nyozeSpecialInlineNode ?? ''
    if (!SPECIAL_INLINE_NODE_TYPES.has(nodeTypeName)) continue

    const retained = boundarySentinelRetainedPayload.get(sentinel)
    const diagPendingLength = diagEnabled
      ? boundarySentinelCompositionPending.get(sentinel)?.length ?? 0
      : 0
    // 保持している確定文字列は post-Escape suppression の対象にしない（黙って捨てない）。
    if (retained === undefined && shouldSuppressBoundarySentinelPostEscapeEvent(sentinel, event)) {
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
      boundarySentinelCompositionPending.delete(sentinel)
      if (event instanceof InputEvent && event.type === 'input' && !event.isComposing) {
        clearBoundarySentinelPostEscapeSuppression(sentinel)
        boundarySentinelGlobalPostEscapeSuppressUntil = 0
      }
      resetBoundarySentinel(sentinel)
      return true
    }

    let payloadPick: SpecialInlineBoundaryCompositionEndPayloadPick
    if (retained !== undefined) {
      payloadPick = resolveRetainedPayloadPick(sentinel, retained, event)
    } else if (useCompositionEndPayload) {
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
      if (useCompositionEndPayload) boundarySentinelCompositionPending.delete(sentinel)
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
      // 位置を証明できない: effective payload（`event.data` だけにしか無い場合を含む）を捨てず、
      // sentinel の DOM に見える形で保持する。位置を証明できた時点で、この同じ経路から
      // exact 1 回だけ本文へ入れる（PM へは入れない、別の位置へも入れない）。
      boundarySentinelRetainedPayload.set(sentinel, payload)
      boundarySentinelCompositionPending.delete(sentinel)
      if (extractSpecialInlineBoundarySentinelPayload(sentinel) !== payload) {
        sentinel.textContent = `${SPECIAL_INLINE_BOUNDARY_SENTINEL_TEXT}${payload}`
      }
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
    // 保持文字列を無関係な event（別の場所での入力）を契機に入れるときは、利用者の caret を動かさない。
    const movesCaret =
      retained === undefined || (!diagCtx.keepUserCaret && closestBoundarySentinel(target) === sentinel)
    if (movesCaret) {
      tr.setSelection(TextSelection.create(tr.doc, insertedTo))
        .setStoredMarks([])
        .scrollIntoView()
    }
    view.dispatch(tr)
    boundarySentinelCompositionPending.delete(sentinel)
    boundarySentinelRetainedPayload.delete(sentinel)
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
    // 保持文字列の転送は、同じ event が本来扱う（別の sentinel や PM 自身の）処理を奪わない。
    // event の対象がこの sentinel 自身のときだけ「処理済み」と数え、本文の別の場所での
    // input / compositionend を契機にした転送では、その event の本来の結果（PM の
    // compositionend 後始末を含む）をそのまま返す。
    if (retained !== undefined) {
      if (closestBoundarySentinel(target) === sentinel) transferredRetained = true
      continue
    }
    return true
  }
  if (transferredRetained) return true

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
    boundarySentinelCompositionPending.set(sentinel, compositionEndPayload)
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

/** `[from, to]` の範囲にある Ruby / TCY の直後 widget を作る。key は PM Node identity から取る */
function collectSpecialInlineBoundarySentinelWidgets(
  doc: ProseMirrorNode,
  from: number,
  to: number,
): Decoration[] {
  const decorations: Decoration[] = []
  doc.nodesBetween(from, to, (node, pos) => {
    const nodeTypeName = node.type.name
    if (!SPECIAL_INLINE_NODE_TYPES.has(nodeTypeName)) return true
    decorations.push(
      Decoration.widget(
        pos + node.nodeSize,
        () => createBoundarySentinel(nodeTypeName),
        {
          key: buildSpecialInlineBoundarySentinelKey(node),
          raw: true,
          relaxedSide: true,
          side: -1,
        },
      ),
    )
    return false
  })
  return decorations
}

export function buildSpecialInlineBoundarySentinelDecorations(
  doc: ProseMirrorNode,
): DecorationSet {
  const decorations = collectSpecialInlineBoundarySentinelWidgets(doc, 0, doc.content.size)
  return decorations.length > 0
    ? DecorationSet.create(doc, decorations)
    : DecorationSet.empty
}

type SpecialInlineBoundarySentinelPluginState = {
  readonly doc: ProseMirrorNode
  readonly decorations: DecorationSet
}

function buildSpecialInlineBoundarySentinelPluginState(
  doc: ProseMirrorNode,
): SpecialInlineBoundarySentinelPluginState {
  return { doc, decorations: buildSpecialInlineBoundarySentinelDecorations(doc) }
}

/**
 * transaction が変更した範囲を、最終 doc の top-level block の範囲へ広げて返す（重なりは結合）。
 * 各 StepMap の新範囲を後続の map で最終 doc へ写す。深さ 0（block の間）の端は接する両側の
 * block まで広げる。
 */
function collectChangedTopLevelBlockRanges(tr: Transaction): Array<[number, number]> {
  const doc = tr.doc
  const size = doc.content.size
  const ranges: Array<[number, number]> = []
  const maps = tr.mapping.maps
  for (let index = 0; index < maps.length; index += 1) {
    const rest = tr.mapping.slice(index + 1)
    maps[index].forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      const from = Math.max(0, Math.min(size, rest.map(newStart, -1)))
      const to = Math.max(from, Math.min(size, rest.map(newEnd, 1)))
      const $from = doc.resolve(from)
      const $to = doc.resolve(to)
      let start = $from.depth > 0 ? $from.before(1) : from
      let end = $to.depth > 0 ? $to.after(1) : to
      if ($from.depth === 0 && $from.nodeBefore) start = from - $from.nodeBefore.nodeSize
      if ($to.depth === 0 && $to.nodeAfter) end = to + $to.nodeAfter.nodeSize
      ranges.push([start, end])
    })
  }
  ranges.sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const range of ranges) {
    const last = merged[merged.length - 1]
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
    else merged.push([range[0], range[1]])
  }
  return merged
}

/**
 * 前回の `DecorationSet` を `tr.mapping` で写し、変更のあった top-level block の分だけ作り直す。
 * 触れられなかった Ruby / TCY は同じ Node object のままなので key も同じになり、PM は
 * sentinel DOM を再利用する（入力位置より後ろの sentinel を作り直さない）。
 */
function applySpecialInlineBoundarySentinelTransaction(
  previous: SpecialInlineBoundarySentinelPluginState,
  tr: Transaction,
): SpecialInlineBoundarySentinelPluginState {
  if (!tr.docChanged) {
    return previous.doc === tr.doc ? previous : { doc: tr.doc, decorations: previous.decorations }
  }
  if (previous.doc !== tr.before) return buildSpecialInlineBoundarySentinelPluginState(tr.doc)
  try {
    let decorations = previous.decorations.map(tr.mapping, tr.doc)
    for (const [from, to] of collectChangedTopLevelBlockRanges(tr)) {
      const stale = decorations.find(from, to)
      if (stale.length > 0) decorations = decorations.remove(stale)
      const fresh = collectSpecialInlineBoundarySentinelWidgets(tr.doc, from, to)
      if (fresh.length > 0) decorations = decorations.add(tr.doc, fresh)
    }
    return { doc: tr.doc, decorations }
  } catch {
    return buildSpecialInlineBoundarySentinelPluginState(tr.doc)
  }
}

export function createSpecialInlineBoundarySentinelPlugin(): Plugin {
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
        clearBoundarySentinelPostEscapeSuppression(sentinel)
        boundarySentinelGlobalPostEscapeSuppressUntil = 0
        const fromDom = extractSpecialInlineBoundarySentinelPayload(sentinel)
        const fromEvent = typeof event.data === 'string' ? event.data : ''
        const merged = fromEvent.length > 0 ? fromEvent : fromDom
        if (merged.length > 0) {
          boundarySentinelCompositionPending.set(sentinel, merged)
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
            insertPos: readSentinelBoundaryPosForDiag(view, sentinel),
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

  return new Plugin<SpecialInlineBoundarySentinelPluginState>({
    key: specialInlineBoundarySentinelPluginKey,

    state: {
      init(_config, state) {
        return buildSpecialInlineBoundarySentinelPluginState(state.doc)
      },
      apply(tr, previous) {
        return applySpecialInlineBoundarySentinelTransaction(previous, tr)
      },
    },

    appendTransaction(_trs, oldState, newState) {
      if (oldState.doc === newState.doc || !pluginView) return null
      if (!hasBoundarySentinelBookkeeping()) return null
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
        const pluginState = specialInlineBoundarySentinelPluginKey.getState(state) as
          | SpecialInlineBoundarySentinelPluginState
          | undefined
        return pluginState?.decorations ?? DecorationSet.empty
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
