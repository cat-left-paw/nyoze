import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'

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

function resolveCompositionEndPayload(event: Event, sentinel: HTMLElement): string {
  if (event instanceof CompositionEvent && typeof event.data === 'string') {
    const fromEvent = event.data
    if (fromEvent.length > 0) return fromEvent
  }
  const key = sentinelCompositionPendingKey(sentinel)
  const pending = boundarySentinelCompositionPending.get(key)
  if (pending != null && pending.length > 0) return pending
  return extractSpecialInlineBoundarySentinelPayload(sentinel)
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

function transferBoundarySentinelFromEvent(
  view: EditorView,
  target: EventTarget | null,
  event: Event,
): boolean {
  const useCompositionEndPayload = event.type === 'compositionend'

  for (const sentinel of collectBoundarySentinelsToInspect(view, target, event)) {
    if (!isBoundarySentinel(sentinel)) continue
    const nodeTypeName = sentinel.dataset.nyozeSpecialInlineNode ?? ''
    if (!SPECIAL_INLINE_NODE_TYPES.has(nodeTypeName)) continue

    const pendingKey = sentinelCompositionPendingKey(sentinel)
    if (shouldSuppressBoundarySentinelPostEscapeEvent(sentinel, pendingKey, event)) {
      boundarySentinelCompositionPending.delete(pendingKey)
      if (event instanceof InputEvent && event.type === 'input' && !event.isComposing) {
        clearBoundarySentinelPostEscapeSuppression(sentinel, pendingKey)
        boundarySentinelGlobalPostEscapeSuppressUntil = 0
      }
      resetBoundarySentinel(sentinel)
      return true
    }

    const payload = useCompositionEndPayload
      ? resolveCompositionEndPayload(event, sentinel)
      : extractSpecialInlineBoundarySentinelPayload(sentinel)

    if (!payload) {
      if (useCompositionEndPayload) boundarySentinelCompositionPending.delete(pendingKey)
      if (sentinel.textContent !== SPECIAL_INLINE_BOUNDARY_SENTINEL_TEXT) {
        resetBoundarySentinel(sentinel)
      }
      continue
    }

    const insertPos = resolveBoundaryInsertPos(view, sentinel)
    if (insertPos === null) {
      if (useCompositionEndPayload) boundarySentinelCompositionPending.delete(pendingKey)
      continue
    }

    const textNode = view.state.schema.text(payload)
    resetBoundarySentinel(sentinel)

    const tr = view.state.tr.replaceWith(insertPos, insertPos, textNode)
    const insertedTo = insertPos + textNode.nodeSize
    tr.setSelection(TextSelection.create(tr.doc, insertedTo))
      .setStoredMarks([])
      .scrollIntoView()
    view.dispatch(tr)
    boundarySentinelCompositionPending.delete(pendingKey)
    return true
  }

  return false
}

export function transferSpecialInlineBoundarySentinelText(
  view: EditorView,
  target: EventTarget | null,
): boolean {
  const synthetic = new Event('synthetic')
  return transferBoundarySentinelFromEvent(view, target, synthetic)
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

  const transferFromEvent = (view: EditorView, event: Event): boolean => {
    if (transferring) return false

    // OS IME: composing 中の payload（ASCII / 非 ASCII を問わず）は PM doc に入れない。
    // compositionend の確定文字列だけを一度移送する。
    // composing 中は event.data / DOM を pending に鏡像する。
    // handleDOMEvents で true を返し、PM が composing input で doc を更新しないようにする。
    if (event instanceof InputEvent && event.type === 'input' && event.isComposing) {
      const sentinel = closestBoundarySentinel(event.target)
      if (sentinel) {
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
        if (!handledEvents.has(event)) handledEvents.add(event)
        return true
      }
      if (!handledEvents.has(event)) handledEvents.add(event)
      return false
    }

    if (handledEvents.has(event)) return false

    transferring = true
    try {
      const transferred = transferBoundarySentinelFromEvent(view, event.target, event)
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
        transferFromEvent(view, event)
      }
      const handleCompositionEnd = (event: Event) => {
        transferFromEvent(view, event)
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
        compositionend: transferFromEvent,
        input: transferFromEvent,
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
