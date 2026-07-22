import type { EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

export const SPECIAL_INLINE_NODE_TYPES = ['aozoraRuby', 'aozoraTcy'] as const

export type SpecialInlineNodeTypeName = (typeof SPECIAL_INLINE_NODE_TYPES)[number]

export type SpecialInlineAdjacentPmInspection = {
  collapsed: boolean
  /** DOM キャレットが当該ノード直下の「外側・直後」にあればその種類 */
  adjacentKind: SpecialInlineNodeTypeName | null
  anchorPos: number
  headPos: number
}

type LogPush = (event: string, detail: string) => void

function readDiagFlag(): boolean {
  return (
    typeof globalThis !== 'undefined' &&
    Boolean(
      (globalThis as unknown as { __NYOZE_DIAG_SPECIAL_INLINE__?: boolean })
        .__NYOZE_DIAG_SPECIAL_INLINE__,
    )
  )
}

let lastPointerSample: {
  clientX: number
  clientY: number
  type: string
  phase: string
  ts: number
} | null = null

const diagRing: string[] = []
const RING_CAP = 120
/** pushLog / ring 共通の上限（超える場合は縮小ペイロードで必ずパース可能な JSON に収める） */
const DETAIL_MAX = 1900

type PayloadShrink = 'full' | 'compact' | 'minimal'

function clampStr(value: string | null | undefined, max: number): string | null {
  if (value == null) return null
  if (value === '') return ''
  return value.length <= max ? value : value.slice(0, max)
}

export function setSpecialInlineBoundaryDiagEnabled(enabled: boolean): void {
  if (typeof globalThis === 'undefined') return
  ;(globalThis as unknown as { __NYOZE_DIAG_SPECIAL_INLINE__?: boolean }).__NYOZE_DIAG_SPECIAL_INLINE__ =
    enabled
}

export function isSpecialInlineBoundaryDiagEnabled(): boolean {
  return readDiagFlag()
}

export function recordSpecialInlinePointerSample(event: PointerEvent): void {
  if (!isSpecialInlineBoundaryDiagEnabled()) return
  lastPointerSample = {
    clientX: event.clientX,
    clientY: event.clientY,
    type: event.pointerType,
    phase: event.type,
    ts: performance.now(),
  }
}

export function consumeSpecialInlineDiagLines(): string[] {
  const copy = diagRing.slice()
  diagRing.length = 0
  return copy
}

function pushDiagRing(line: string): void {
  diagRing.push(line)
  while (diagRing.length > RING_CAP) diagRing.shift()
}

function closestElement(node: Node | null): Element | null {
  if (!node) return null
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
}

function getRootSelection(view: EditorView): globalThis.Selection | null {
  const root = view.root as Document | ShadowRoot
  if ('getSelection' in root) return root.getSelection()
  return view.dom.ownerDocument.getSelection()
}

function summarizeDomSelection(
  sel: globalThis.Selection | null,
  snippetMax: number,
): Record<string, unknown> {
  if (!sel?.anchorNode) return { absent: true }
  const anchorEl = closestElement(sel.anchorNode)
  return {
    collapsed: sel.isCollapsed,
    anchorOffset: sel.anchorOffset,
    focusOffset: sel.focusOffset,
    anchorNodeType: sel.anchorNode.nodeType,
    anchorTag: anchorEl?.tagName ?? null,
    inRubyWrap: Boolean(anchorEl?.closest('[data-aozora-ruby]')),
    inRubyBase: Boolean(anchorEl?.closest('[data-aozora-base]')),
    inRubyRt: Boolean(anchorEl?.closest('.tategaki-aozora-ruby-rt')),
    inTcy: Boolean(anchorEl?.closest('[data-tategaki-tcy]')),
    anchorSnippet:
      sel.anchorNode.nodeType === Node.TEXT_NODE
        ? clampStr(String(sel.anchorNode.textContent ?? ''), snippetMax)
        : null,
  }
}

function caretFromPointPayload(doc: Document, x: number, y: number): Record<string, unknown> | null {
  const anyDoc = doc as Document & {
    caretPositionFromPoint?(ix: number, iy: number): CaretPosition | null
    caretRangeFromPoint?(ix: number, iy: number): Range | null
  }
  if (anyDoc.caretPositionFromPoint) {
    const cp = anyDoc.caretPositionFromPoint(x, y)
    if (cp?.offsetNode) {
      const el = closestElement(cp.offsetNode)
      return {
        mode: 'caretPositionFromPoint',
        offset: cp.offset,
        tag: el?.tagName ?? null,
        inRubyWrap: Boolean(el?.closest('[data-aozora-ruby]')),
        inTcy: Boolean(el?.closest('[data-tategaki-tcy]')),
      }
    }
  }
  if (anyDoc.caretRangeFromPoint) {
    const r = anyDoc.caretRangeFromPoint(x, y)
    if (r?.startContainer) {
      const el = closestElement(r.startContainer)
      return {
        mode: 'caretRangeFromPoint',
        startOffset: r.startOffset,
        tag: el?.tagName ?? null,
        inRubyWrap: Boolean(el?.closest('[data-aozora-ruby]')),
        inTcy: Boolean(el?.closest('[data-tategaki-tcy]')),
      }
    }
  }
  return null
}

function summarizePmNeighbors(state: EditorState): Record<string, unknown> {
  const sel = state.selection
  const $h = sel.$head
  const nb = $h.nodeBefore
  const na = $h.nodeAfter
  return {
    anchor: sel.anchor,
    head: sel.head,
    empty: sel.empty,
    depth: $h.depth,
    parentOffset: $h.parentOffset,
    nodeBefore: nb ? { type: nb.type.name, nodeSize: nb.nodeSize } : null,
    nodeAfter: na ? { type: na.type.name, nodeSize: na.nodeSize } : null,
  }
}

function compactRect(el: Element): { x: number; y: number; w: number; h: number } {
  const r = el.getBoundingClientRect()
  return {
    x: Math.round(r.left * 10) / 10,
    y: Math.round(r.top * 10) / 10,
    w: Math.round(r.width * 10) / 10,
    h: Math.round(r.height * 10) / 10,
  }
}

function collectSpecialInlineRects(
  view: EditorView,
  maxRuby: number,
  maxTcy: number,
): Record<string, unknown> {
  const root = view.dom
  const ruby = [...root.querySelectorAll('[data-aozora-ruby]')]
    .slice(0, maxRuby)
    .map(compactRect)
  const tcy = [...root.querySelectorAll('[data-tategaki-tcy]')]
    .slice(0, maxTcy)
    .map(compactRect)
  return { rubyRects: ruby, tcyRects: tcy }
}

function summarizeEventTarget(target: EventTarget | null | undefined): Record<string, unknown> {
  const node = target instanceof Node ? target : null
  const el = closestElement(node)
  if (!el) return { absent: true }
  return {
    tag: el.tagName,
    inRubyWrap: Boolean(el.closest('[data-aozora-ruby]')),
    inRubyBase: Boolean(el.closest('[data-aozora-base]')),
    inTcy: Boolean(el.closest('[data-tategaki-tcy]')),
    ce: el instanceof HTMLElement ? el.contentEditable : null,
  }
}

/** PM キャレットが特殊 inline の直上・直後か（ece6e5c の ruby 検査を TCY に一般化） */
export function inspectPmCollapsedAfterSpecialInline(
  state: EditorState,
): SpecialInlineAdjacentPmInspection {
  const sel = state.selection
  if (!sel.empty) {
    return {
      collapsed: false,
      adjacentKind: null,
      anchorPos: sel.anchor,
      headPos: sel.head,
    }
  }
  const nb = sel.$head.nodeBefore
  const name = nb?.type.name
  const adjacentKind =
    name === 'aozoraRuby' || name === 'aozoraTcy' ? name : null
  return {
    collapsed: true,
    adjacentKind,
    anchorPos: sel.anchor,
    headPos: sel.head,
  }
}

export function selectionTouchesSpecialInlineNode(state: EditorState): boolean {
  const sel = state.selection
  if (!sel.empty) return false
  const nb = sel.$head.nodeBefore?.type.name
  const na = sel.$head.nodeAfter?.type.name
  return (
    nb === 'aozoraRuby' ||
    nb === 'aozoraTcy' ||
    na === 'aozoraRuby' ||
    na === 'aozoraTcy'
  )
}

export type SpecialInlineDiagContext = {
  view: EditorView
  state: EditorState
  appComposing: boolean
  phase: string
  compositionData?: string
  inputType?: string
  inputData?: string | null
  key?: string
  code?: string
  eventTarget?: EventTarget | null
}

function buildDiagPayload(ctx: SpecialInlineDiagContext, shrink: PayloadShrink): Record<string, unknown> {
  const domSel = getRootSelection(ctx.view)
  const px = lastPointerSample?.clientX ?? null
  const py = lastPointerSample?.clientY ?? null

  const snippetMax = shrink === 'full' ? 40 : shrink === 'compact' ? 24 : 12
  const maxRubyRects = shrink === 'full' ? 2 : shrink === 'compact' ? 1 : 0
  const maxTcyRects = maxRubyRects
  const compMax = shrink === 'full' ? 96 : shrink === 'compact' ? 48 : 24
  const inputMax = shrink === 'full' ? 96 : shrink === 'compact' ? 48 : 24

  const caretProbe =
    shrink !== 'minimal' && px != null && py != null
      ? caretFromPointPayload(ctx.view.dom.ownerDocument, px, py)
      : null

  const payload: Record<string, unknown> = {
    phase: ctx.phase,
    ts: Math.round(performance.now()),
    pmViewComposing: ctx.view.composing,
    appComposingFlag: ctx.appComposing,
    pm: summarizePmNeighbors(ctx.state),
    domSel: summarizeDomSelection(domSel, snippetMax),
    rects: collectSpecialInlineRects(ctx.view, maxRubyRects, maxTcyRects),
    eventTarget: summarizeEventTarget(ctx.eventTarget),
  }

  if (shrink !== 'minimal') {
    payload.caretFromLastPointer = caretProbe
    payload.lastPointer = lastPointerSample
  }

  if (ctx.compositionData !== undefined) {
    payload.compositionData = clampStr(ctx.compositionData, compMax)
  }
  if (ctx.inputType !== undefined) payload.inputType = ctx.inputType
  if (ctx.inputData !== undefined) payload.inputData = clampStr(ctx.inputData ?? '', inputMax)
  if (ctx.key !== undefined) payload.key = ctx.key
  if (ctx.code !== undefined) payload.code = ctx.code

  return payload
}

export function emitSpecialInlineBoundaryDiag(
  pushLog: LogPush,
  ctx: SpecialInlineDiagContext,
): void {
  if (!isSpecialInlineBoundaryDiagEnabled()) return

  const order: PayloadShrink[] = ['full', 'compact', 'minimal']
  let line = ''
  for (const shrink of order) {
    try {
      line = JSON.stringify(buildDiagPayload(ctx, shrink))
    } catch {
      line = ''
    }
    if (line.length > 0 && line.length <= DETAIL_MAX) break
  }

  if (line.length === 0 || line.length > DETAIL_MAX) {
    line = JSON.stringify({
      phase: ctx.phase,
      ts: Math.round(performance.now()),
      diagError: 'serialize_overflow',
      pmAnchor: ctx.state.selection.anchor,
      pmHead: ctx.state.selection.head,
    })
  }

  pushLog('specialInlineDiag', line)
  pushDiagRing(line)
}

// --- IME-B1: special inline boundary sentinel decision diagnostics ---
//
// sentinel 経路の「入口(origin)」と「分岐(decision)」を実機で判別するための
// 構造化ログ。`__NYOZE_DIAG_SPECIAL_INLINE__` が無効なら一切記録しない。
// IME payload 本文は記録せず、長さのみを載せる。

export type SpecialInlineSentinelDecisionOrigin =
  | 'native-capture-input'
  | 'native-capture-compositionend'
  | 'pm-handle-dom-input'
  | 'pm-handle-dom-compositionend'
  | 'ruby-bridge-mirror'
  | 'ruby-bridge-transfer'
  | 'synthetic-transfer'
  | 'escape-keydown'

export type SpecialInlineSentinelDecision =
  | 'mirror'
  | 'transfer'
  | 'suppressed'
  | 'no-payload'
  | 'no-insert-pos'
  | 'no-sentinel'
  | 'ignored'
  | 'already-handled'
  | 'reentrant'
  | 'escape-recovery'

export type SpecialInlineSentinelPayloadSource =
  | 'compositionend-data'
  | 'input-data'
  | 'pending'
  | 'dom'
  | 'none'

export type SpecialInlineStoredMarksState = 'null' | 'empty' | 'marks'

/**
 * `state.storedMarks` の診断分類。`[]` と `null` は ProseMirror の
 * compositionstart 判定（truthiness）で挙動が異なるため、同値と見なさない。
 */
export function classifySpecialInlineStoredMarksState(
  storedMarks: readonly unknown[] | null | undefined,
): SpecialInlineStoredMarksState {
  if (storedMarks == null) return 'null'
  return storedMarks.length === 0 ? 'empty' : 'marks'
}

export type SpecialInlineSentinelDecisionDiag = {
  origin: SpecialInlineSentinelDecisionOrigin
  decision: SpecialInlineSentinelDecision
  eventType: string
  /** InputEvent のときのみ boolean、それ以外（CompositionEvent / synthetic / null）は null */
  eventIsComposing: boolean | null
  eventCancelable: boolean
  directSentinelTarget: boolean
  alreadyHandled: boolean
  viewComposingBefore: boolean
  /** transfer dispatch 後の `view.composing`。transfer 以外は null */
  viewComposingAfter: boolean | null
  storedMarksState: SpecialInlineStoredMarksState
  payloadSource: SpecialInlineSentinelPayloadSource
  /** 文字列本文は載せず長さのみ */
  payloadLength: number
  pendingLength: number
  insertPos: number | null
  /** reset 直前に sentinel が WORD JOINER 単独（canonical）だったか */
  sentinelCanonicalBeforeReset: boolean | null
  sentinelNodeType: string | null
}

let sentinelDecisionSeq = 0

/** 純関数: sentinel decision 1 件を ring 用 JSON 行へ整形する（unit test 対象） */
export function buildSpecialInlineSentinelDecisionLine(
  diag: SpecialInlineSentinelDecisionDiag,
  seq: number,
  ts: number,
): string {
  return JSON.stringify({ phase: 'sentinelDecision', seq, ts, ...diag })
}

export function emitSpecialInlineSentinelDecisionDiag(
  diag: SpecialInlineSentinelDecisionDiag,
): void {
  if (!isSpecialInlineBoundaryDiagEnabled()) return
  sentinelDecisionSeq += 1
  let line = ''
  try {
    line = buildSpecialInlineSentinelDecisionLine(
      diag,
      sentinelDecisionSeq,
      Math.round(performance.now()),
    )
  } catch {
    line = ''
  }
  if (line.length === 0 || line.length > DETAIL_MAX) {
    line = JSON.stringify({
      phase: 'sentinelDecision',
      seq: sentinelDecisionSeq,
      ts: Math.round(performance.now()),
      diagError: 'serialize_overflow',
      origin: diag.origin,
      decision: diag.decision,
    })
  }
  pushDiagRing(line)
}

let compositionUpdateDiagCounter = 0

export function emitSpecialInlineCompositionUpdateDiag(
  pushLog: LogPush,
  ctx: Omit<SpecialInlineDiagContext, 'phase'> & { phase: 'compositionupdate'; compositionData?: string },
): void {
  if (!isSpecialInlineBoundaryDiagEnabled()) return
  compositionUpdateDiagCounter += 1
  const noisy =
    selectionTouchesSpecialInlineNode(ctx.state) ||
    Boolean(
      closestElement(getRootSelection(ctx.view)?.anchorNode ?? null)?.closest(
        '[data-aozora-ruby],[data-tategaki-tcy]',
      ),
    )
  // ノイズ削減: 境界に無関係そうなら 10 回に 1 回だけサンプル
  if (!noisy && compositionUpdateDiagCounter % 10 !== 1) return
  emitSpecialInlineBoundaryDiag(pushLog, ctx)
}
