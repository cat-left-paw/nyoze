import { Editor } from '@tiptap/core'
import { Plugin, PluginKey, Selection, TextSelection } from '@tiptap/pm/state'
import type { EditorState } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Decoration, DecorationSet, EditorView } from '@tiptap/pm/view'
import { parseMarkdown } from '../io/parseMarkdown'
import type {
  LineBreakPolicy,
  ParagraphPlainModeListener,
} from '../types'
import {
  findActiveBlockPos,
  isParagraphPlainTargetType,
  parseParagraphPlainExitReplacementContent,
  parseReplacementNode,
  resolveBlockElementAtPos,
  serializeBlockNode,
} from './paragraphSource'
import {
  shouldRequestParagraphPlainOverlayMeasure,
  shouldRequestParagraphPlainOverlayPosition,
} from './paragraphPlainOverlayMeasure'
import type {
  ParagraphPlainOverlayMeasureReason,
} from './paragraphPlainOverlayMeasure'
import {
  selectReusableParagraphPlainLayoutSnapshot,
  type ParagraphPlainLayoutReuseSnapshot,
} from './paragraphPlainLayoutReuse'
import { shouldBlockShiftEnterInParagraphPlain } from './lineBreakGuards'
import {
  ensureParagraphPlainProfilerWindowApi,
  paragraphPlainProfilerBeginSession,
  paragraphPlainProfilerCancelSession,
  paragraphPlainProfilerClearEndScheduledForFlush,
  paragraphPlainProfilerCompleteSessionAfterFlush,
  paragraphPlainProfilerHasActiveSession,
  paragraphPlainProfilerMark,
  paragraphPlainProfilerMarkEndScheduledForFlush,
  paragraphPlainProfilerPeekEndScheduledForFlush,
  paragraphPlainProfilerRunPhase,
} from './paragraphPlainProfiler'
import {
  ensureParagraphPlainExperimentsWindowApi,
  isParagraphPlainReservedBlockSizeDisabled,
  isParagraphPlainScrollRepositionDisabled,
} from './paragraphPlainExperiments'
import {
  computeComfortableReservedHostTargetPx,
  paragraphPlainReserveAxisBasePx,
  resolveParagraphPlainReservedStepPx,
  type ParagraphPlainReservedStepPxCache,
} from './paragraphPlainReservedLayout'
import {
  createHorizontalEditorSurfaceWheelApplier,
  createVerticalWheelScrollController,
} from './verticalWheelScroll'

type ParagraphPlainPluginState = {
  pos: number | null
  typeName: string | null
}

type ParagraphPlainContext = {
  from: number
  to: number
  typeName: string
  originalMarkdown: string
}

type ParagraphPlainOverlayBaseRect = {
  top: number
  left: number
  width: number
  height: number
}

/** PP-L4: flush 直呼びでも read と同じ子 phase 名で block/host の GBC コストを比較する。 */
function computeParagraphPlainBlockRectRelativeToHostFromElementProfiled(
  blockElement: Element,
  host: HTMLElement,
): ParagraphPlainOverlayBaseRect {
  const rect = paragraphPlainProfilerRunPhase(
    'readParagraphPlainBlockRectRelativeToHost.blockRect',
    () => blockElement.getBoundingClientRect(),
  )
  const hostRect = paragraphPlainProfilerRunPhase(
    'readParagraphPlainBlockRectRelativeToHost.hostRect',
    () => host.getBoundingClientRect(),
  )
  return {
    top: rect.top - hostRect.top + host.scrollTop,
    left: rect.left - hostRect.left + host.scrollLeft,
    width: Math.max(1, rect.width),
    height: Math.max(1, rect.height),
  }
}

type ParagraphPlainOverlayUpdateFlags = {
  needsPosition: boolean
  needsMeasure: boolean
  deferTextMeasure: boolean
}

export type ParagraphPlainOverlayLayoutCache = {
  hasMeasurement: boolean
  baseRect: ParagraphPlainOverlayBaseRect | null
  measuredBaseWidth: number | null
  measuredBaseHeight: number | null
  text: string | null
  measuredWidth: number | null
  measuredHeight: number | null
  reservedSize: number | null
  writingMode: string | null
  /** 対象 block の computed style 由来。テーマ / フォント / 行高の DOM 変化を PM トランザクションなしで検知する。 */
  blockLayoutSignature: string | null
  /**
   * flush 直後の block 相対矩形（当時の reserved / 折返し状態を含む）。ペイン幅変化など style 指紋が
   * 不変でも getBoundingClientRect だけ変わるケースを sync で検知する。
   */
  blockLayoutLastObservedRect: ParagraphPlainOverlayBaseRect | null
  activeBlockKey: string | null
  hostIdentity: unknown
}
type ResolveSplitBeforeNodeParams = {
  state: EditorState
  typeName: string
  currentNode: PMNode
  beforeText: string
  lineBreakPolicy: LineBreakPolicy
  allowMarkdownBlockReparse?: boolean
}

export function computeOverlayReservedBlockSize(params: {
  baseWidth: number
  baseHeight: number
  scrollWidth: number
  scrollHeight: number
  writingMode: string
}): number {
  const padding = 2
  const isVertical = params.writingMode === 'vertical-rl'
  if (isVertical) {
    return Math.max(params.baseWidth, params.scrollWidth + padding)
  }
  return Math.max(params.baseHeight, params.scrollHeight + padding)
}

export function createEmptyParagraphPlainOverlayLayoutCache(): ParagraphPlainOverlayLayoutCache {
  return {
    hasMeasurement: false,
    baseRect: null,
    measuredBaseWidth: null,
    measuredBaseHeight: null,
    text: null,
    measuredWidth: null,
    measuredHeight: null,
    reservedSize: null,
    writingMode: null,
    blockLayoutSignature: null,
    blockLayoutLastObservedRect: null,
    activeBlockKey: null,
    hostIdentity: null,
  }
}

/** Block DOM の表示レイアウト指紋（computed style）。ペイン幅・折返しのみの変化は `readParagraphPlainBlockRectRelativeToHost` 側で検知する。 */
export function computeParagraphPlainBlockLayoutSignature(el: Element | null): string {
  if (!el || typeof getComputedStyle === 'undefined') return ''
  try {
    const cs = getComputedStyle(el)
    return [cs.writingMode, cs.fontSize, cs.lineHeight, cs.fontFamily, cs.letterSpacing].join(
      '\0',
    )
  } catch {
    return ''
  }
}

export function paragraphPlainOverlayBlockRectsRoughlyEqual(
  a: ParagraphPlainOverlayBaseRect | null,
  b: ParagraphPlainOverlayBaseRect | null,
  epsilon = 0.75,
): boolean {
  if (a == null || b == null) return false
  return (
    Math.abs(a.top - b.top) <= epsilon &&
    Math.abs(a.left - b.left) <= epsilon &&
    Math.abs(a.width - b.width) <= epsilon &&
    Math.abs(a.height - b.height) <= epsilon
  )
}

/**
 * 既知の block DOM と host から相対矩形を 1 回の layout read（block + host）で求める。
 * `readParagraphPlainBlockRectRelativeToHost` / flush の観測再利用の共通実体。
 */
export function computeParagraphPlainBlockRectRelativeToHostFromElement(
  blockElement: Element,
  host: HTMLElement,
): ParagraphPlainOverlayBaseRect {
  return computeParagraphPlainBlockRectRelativeToHostFromElementProfiled(blockElement, host)
}

/** 現在の DOM レイアウト（host の reserved 含む）での block 相対矩形。sync / flush 末尾の観測に使う。 */
export function readParagraphPlainBlockRectRelativeToHost(params: {
  view: EditorView
  pos: number
  typeName: string
  host: HTMLElement | null
}): ParagraphPlainOverlayBaseRect | null {
  const { view, pos, typeName, host } = params
  if (!host) return null
  const blockElement = paragraphPlainProfilerRunPhase(
    'readParagraphPlainBlockRectRelativeToHost.resolveBlockElement',
    () => resolveBlockElementAtPos(view, pos, typeName),
  )
  if (!blockElement) return null
  return computeParagraphPlainBlockRectRelativeToHostFromElement(blockElement, host)
}

/**
 * PP-L2: same-block で pm の from/to が不変でも、ホスト / 書字モード / block の style 指紋 /
 * flush 時点との相対矩形がずれていれば overlay の再配置・再計測が必要。
 */
export function shouldParagraphPlainSyncScheduleOverlayUpdate(params: {
  positionalChange: boolean
  cache: ParagraphPlainOverlayLayoutCache
  overlayHost: HTMLElement | null
  overlayWritingMode: string
  blockLayoutSignature: string
  liveBlockRect: ParagraphPlainOverlayBaseRect | null
}): boolean {
  if (params.positionalChange) return true
  const c = params.cache
  if (!c.hasMeasurement) return true
  if (c.hostIdentity !== params.overlayHost) return true
  if (c.writingMode !== params.overlayWritingMode) return true
  if (c.blockLayoutSignature == null) return true
  if (c.blockLayoutSignature !== params.blockLayoutSignature) return true
  if (params.liveBlockRect == null) return true
  if (c.blockLayoutLastObservedRect == null) return true
  return !paragraphPlainOverlayBlockRectsRoughlyEqual(
    c.blockLayoutLastObservedRect,
    params.liveBlockRect,
  )
}

export function shouldRemeasureParagraphPlainOverlay(params: {
  cache: ParagraphPlainOverlayLayoutCache
  measureRequested: boolean
  deferTextMeasure?: boolean
  text: string
  writingMode: string
  activeBlockKey: string | null
  hostIdentity: unknown
  baseWidth: number
  baseHeight: number
}): boolean {
  const { cache } = params
  if (!cache.hasMeasurement) return true
  if (cache.activeBlockKey !== params.activeBlockKey) return true
  if (cache.hostIdentity !== params.hostIdentity) return true
  if (cache.writingMode !== params.writingMode) return true
  if (
    cache.measuredBaseWidth !== params.baseWidth ||
    cache.measuredBaseHeight !== params.baseHeight
  ) {
    return true
  }
  if (cache.text !== params.text) {
    if (!params.deferTextMeasure) return true
    return params.measureRequested
  }
  return params.measureRequested
}

export interface ParagraphPlainModeController {
  setMode(enabled: boolean): boolean
  toggleMode(): boolean
  isActive(): boolean
  /** Commit in-overlay edits to PM Doc when Paragraph Plain is active. */
  commitIfActive(): boolean
  /** Execute native undo on the paragraph plain overlay textarea. */
  undoOverlay(): void
  /** Execute native redo on the paragraph plain overlay textarea. */
  redoOverlay(): void
  /** Select the full contents of the paragraph plain overlay textarea. */
  selectAllOverlay(): void
  onModeChange(listener: ParagraphPlainModeListener): () => void
  destroy(): void
}

export interface CreateParagraphPlainModeControllerOptions {
  editor: Editor
  getLineBreakPolicy: () => LineBreakPolicy
  pushLog: (event: string, detail: string) => void
}

export function commitParagraphPlainIfActive(params: {
  active: boolean
  commitCurrentParagraphPlain: (
    save: boolean,
    options?: { preserveSelection?: boolean },
  ) => boolean
}): boolean {
  if (!params.active) return true
  return params.commitCurrentParagraphPlain(true, {
    preserveSelection: true,
  })
}

export function resolveParagraphPlainSplitBeforeNode({
  state,
  typeName,
  currentNode,
  beforeText,
  lineBreakPolicy,
  allowMarkdownBlockReparse = false,
}: ResolveSplitBeforeNodeParams): PMNode | null {
  return paragraphPlainProfilerRunPhase('resolveParagraphPlainSplitBeforeNode', (): PMNode | null => {
    const paragraphType = state.schema.nodes.paragraph
    if (!paragraphType) return null

    if (allowMarkdownBlockReparse) {
      const reparsed = paragraphPlainProfilerRunPhase(
        'parseParagraphPlainExitReplacementContent',
        () =>
          parseParagraphPlainExitReplacementContent(
            state,
            beforeText,
            typeName,
            lineBreakPolicy,
          ),
        'split-before',
      )
      if (reparsed) return reparsed
    }

    const beforeDoc = parseMarkdown(state.schema, beforeText, lineBreakPolicy)
    if (beforeDoc.childCount === 1 && beforeDoc.child(0).type.name === typeName) {
      return beforeDoc.child(0)
    }
    if (beforeDoc.childCount === 0) {
      return typeName === 'heading'
        ? currentNode.type.create(currentNode.attrs)
        : paragraphType.create()
    }
    return typeName === 'heading'
      ? currentNode.type.create(currentNode.attrs, beforeText ? [state.schema.text(beforeText)] : undefined)
      : paragraphType.create(null, beforeText ? [state.schema.text(beforeText)] : undefined)
  })
}

export function createParagraphPlainModeController(
  options: CreateParagraphPlainModeControllerOptions,
): ParagraphPlainModeController {
  const { editor, getLineBreakPolicy, pushLog } = options

  ensureParagraphPlainProfilerWindowApi()

  const paragraphPlainModeListeners = new Set<ParagraphPlainModeListener>()
  const paragraphPlainPluginKey = new PluginKey<ParagraphPlainPluginState>('nyozeParagraphPlainMode')
  let paragraphPlainActive = false
  let paragraphPlainPlugin: Plugin<ParagraphPlainPluginState> | null = null
  let paragraphPlainOverlayEl: HTMLTextAreaElement | null = null
  let paragraphPlainOverlayHost: HTMLElement | null = null
  let paragraphPlainCurrent: ParagraphPlainContext | null = null
  let paragraphPlainActivePos: number | null = null
  let paragraphPlainApplying = false
  let paragraphPlainComposing = false
  let paragraphPlainLastView: EditorView | null = null
  let paragraphPlainScrollSource: HTMLElement | null = null
  let paragraphPlainScrollHandler: (() => void) | null = null
  /** ResizeObserver 非対応環境のみ window.resize でホスト寸法変化を代替検知 */
  let paragraphPlainResizeHandler: (() => void) | null = null
  let paragraphPlainHostResizeObserver: ResizeObserver | null = null
  let paragraphPlainHostResizeObserved: HTMLElement | null = null
  let paragraphPlainHostLastClientSize: { w: number; h: number } | null = null
  let paragraphPlainOverlayWheelCleanup: (() => void) | null = null
  let paragraphPlainOverlayWheelViewDom: HTMLElement | null = null
  // 通常は textarea の選択範囲を絶対 offset で復元するが、隣接 block への
  // 矢印移動など「次の block の物理的長さに依存する終端配置」のときは
  // serialize 結果の length を事前に取らず sentinel を渡し、startParagraphPlain
  // 側で markdown.length を採用する。これで block 切替時の余計な
  // serializeBlockNode を 1 回省ける。
  type PendingOverlaySelection =
    | { kind: 'absolute'; start: number; end: number }
    | { kind: 'block-end' }
  let paragraphPlainPendingSelection: PendingOverlaySelection | null = null
  let paragraphPlainOverlayUpdateFrame: number | null = null
  let paragraphPlainOverlayPending: ParagraphPlainOverlayUpdateFlags = {
    needsPosition: false,
    needsMeasure: false,
    deferTextMeasure: false,
  }
  let paragraphPlainOverlayLayoutCache = createEmptyParagraphPlainOverlayLayoutCache()
  let paragraphPlainLastOverlayMeasureAt: number | null = null
  // One-shot flag: when true, the next startParagraphPlain() scrolls the
  // target block into view before overlay positioning. Set by Enter split so
  // that a new last-line paragraph emerging below the viewport still follows
  // the caret. Regular activations / block switches leave it false to avoid
  // gratuitous scroll jumps.
  let paragraphPlainScrollIntoViewPending = false
  /**
   * click-switch 時: overlay の配置・計測 flush を先に済ませ、その後に focus / selection を適用して
   * 同期レイアウトとブロックする時間を減らす（PP click-switch focus 遅延スライス）。
   */
  let paragraphPlainOverlayFocusDeferred = false
  // CSS variable name set on the overlay host (outside ProseMirror's DOM)
  // to avoid triggering ProseMirror's MutationObserver infinite loop.
  const PP_RESERVED_BLOCK_SIZE_VAR = '--pp-reserved-block-size'
  let paragraphPlainLayoutReuseEpoch = 0
  const paragraphPlainLayoutReuseSnapshots = new Map<
    string,
    ParagraphPlainLayoutReuseSnapshot
  >()

  /** comfortable 時: host に実際に書いた量子化済み px（ideal の `reservedSize` と別）。 */
  let comfortableReservedRaf: number | null = null
  let pendingComfortableReservedHostPx: number | null = null
  let lastComfortableReservedHostPx: number | null = null
  let comfortableReservedStepPxCache: ParagraphPlainReservedStepPxCache | null = null

  function cancelComfortableReservedHostAnimation(): void {
    if (comfortableReservedRaf != null) {
      cancelAnimationFrame(comfortableReservedRaf)
      comfortableReservedRaf = null
    }
    pendingComfortableReservedHostPx = null
  }

  /** commit / position 先頭など: 保留中の host 予約を破棄せず同期適用。 */
  function flushComfortableReservedHostPendingSync(): void {
    if (comfortableReservedRaf != null) {
      cancelAnimationFrame(comfortableReservedRaf)
      comfortableReservedRaf = null
    }
    if (isParagraphPlainReservedBlockSizeDisabled() || !paragraphPlainOverlayHost) {
      pendingComfortableReservedHostPx = null
      return
    }
    const pending = pendingComfortableReservedHostPx
    pendingComfortableReservedHostPx = null
    if (pending != null) {
      paragraphPlainOverlayHost.style.setProperty(PP_RESERVED_BLOCK_SIZE_VAR, `${pending}px`)
      lastComfortableReservedHostPx = pending
    }
  }

  /** overlay 更新 hot path: rAF で host へ 1 フレームにまとめて書く（同一値はスキップ）。 */
  function scheduleComfortableReservedHostWrite(hostTargetPx: number): void {
    if (isParagraphPlainReservedBlockSizeDisabled() || !paragraphPlainOverlayHost) return
    if (hostTargetPx === lastComfortableReservedHostPx) return
    pendingComfortableReservedHostPx = hostTargetPx
    if (comfortableReservedRaf != null) return
    comfortableReservedRaf = requestAnimationFrame(() => {
      comfortableReservedRaf = null
      const target = pendingComfortableReservedHostPx
      pendingComfortableReservedHostPx = null
      if (
        target == null ||
        !paragraphPlainOverlayHost ||
        isParagraphPlainReservedBlockSizeDisabled()
      ) {
        return
      }
      paragraphPlainOverlayHost.style.setProperty(PP_RESERVED_BLOCK_SIZE_VAR, `${target}px`)
      lastComfortableReservedHostPx = target
    })
  }

  /** position など即時整合が必要な経路。 */
  function applyComfortableReservedHostImmediate(hostTargetPx: number): void {
    cancelComfortableReservedHostAnimation()
    if (isParagraphPlainReservedBlockSizeDisabled() || !paragraphPlainOverlayHost) return
    paragraphPlainOverlayHost.style.setProperty(PP_RESERVED_BLOCK_SIZE_VAR, `${hostTargetPx}px`)
    lastComfortableReservedHostPx = hostTargetPx
  }

  function buildParagraphPlainActiveBlockKey(
    pos: number | null,
    typeName: string | null,
  ): string | null {
    if (pos == null || typeName == null) return null
    return `${typeName}:${pos}`
  }

  function computeParagraphPlainHostViewportSignature(host: HTMLElement | null): string {
    if (!host) return ''
    return [host.clientWidth, host.clientHeight].join(':')
  }

  function invalidateParagraphPlainLayoutReuseSnapshots(): void {
    paragraphPlainLayoutReuseEpoch += 1
    paragraphPlainLayoutReuseSnapshots.clear()
  }

  function rememberParagraphPlainLayoutReuseSnapshot(reason: string): void {
    if (!paragraphPlainOverlayHost) return
    const cache = paragraphPlainOverlayLayoutCache
    if (
      !cache.hasMeasurement ||
      !cache.activeBlockKey ||
      !cache.baseRect ||
      !cache.blockLayoutSignature ||
      !cache.writingMode ||
      cache.text == null
    ) {
      return
    }
    paragraphPlainLayoutReuseSnapshots.set(cache.activeBlockKey, {
      activeBlockKey: cache.activeBlockKey,
      hostIdentity: paragraphPlainOverlayHost,
      hostViewportSignature: computeParagraphPlainHostViewportSignature(
        paragraphPlainOverlayHost,
      ),
      blockLayoutSignature: cache.blockLayoutSignature,
      writingMode: cache.writingMode,
      layoutEpoch: paragraphPlainLayoutReuseEpoch,
      baseRect: cache.baseRect,
      measuredWidth: cache.measuredWidth,
      measuredHeight: cache.measuredHeight,
      reservedSize: cache.reservedSize,
      blockLayoutLastObservedRect: cache.blockLayoutLastObservedRect,
      text: cache.text,
    })
    paragraphPlainProfilerMark('pp-l8-store-layout-reuse-snapshot', reason)
  }

  function resetParagraphPlainOverlayLayoutCache(): void {
    paragraphPlainOverlayLayoutCache = createEmptyParagraphPlainOverlayLayoutCache()
    paragraphPlainLastOverlayMeasureAt = null
    cancelComfortableReservedHostAnimation()
    lastComfortableReservedHostPx = null
  }

  function cancelScheduledParagraphPlainOverlayUpdate(): void {
    if (paragraphPlainOverlayUpdateFrame != null) {
      cancelAnimationFrame(paragraphPlainOverlayUpdateFrame)
      paragraphPlainOverlayUpdateFrame = null
    }
    paragraphPlainOverlayPending = {
      needsPosition: false,
      needsMeasure: false,
      deferTextMeasure: false,
    }
  }

  function getParagraphPlainOverlayNow(): number {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now()
    }
    return Date.now()
  }

  function emitParagraphPlainModeChange(active: boolean): void {
    for (const listener of paragraphPlainModeListeners) {
      listener(active)
    }
  }

  function buildParagraphPlainDecorations(state: EditorState): DecorationSet | null {
    if (!paragraphPlainActive) return null
    const pluginState = paragraphPlainPluginKey.getState(state)
    const pos = pluginState?.pos ?? null
    const typeName = pluginState?.typeName ?? null
    if (pos == null || typeName == null) return null
    const node = state.doc.nodeAt(pos)
    if (!node || node.type.name !== typeName) return null

    const deco = Decoration.node(pos, pos + node.nodeSize, {
      class: 'tategaki-plain-overlay-target',
      'data-plain-mode': 'true',
    })
    return DecorationSet.create(state.doc, [deco])
  }

  function hideParagraphPlainOverlay(): void {
    paragraphPlainOverlayFocusDeferred = false
    cancelScheduledParagraphPlainOverlayUpdate()
    cancelComfortableReservedHostAnimation()
    invalidateParagraphPlainLayoutReuseSnapshots()
    paragraphPlainOverlayHost?.style.removeProperty(PP_RESERVED_BLOCK_SIZE_VAR)
    lastComfortableReservedHostPx = null
    if (!paragraphPlainOverlayEl) return
    paragraphPlainOverlayEl.style.display = 'none'
    resetParagraphPlainOverlayLayoutCache()
  }

  function teardownParagraphPlainHostResizeTracking(): void {
    paragraphPlainHostResizeObserver?.disconnect()
    paragraphPlainHostResizeObserver = null
    if (paragraphPlainResizeHandler) {
      window.removeEventListener('resize', paragraphPlainResizeHandler)
      paragraphPlainResizeHandler = null
    }
    paragraphPlainHostResizeObserved = null
    paragraphPlainHostLastClientSize = null
  }

  /**
   * `.editor-surface` の client 寸法が変わったときだけ overlay を再配置する。
   * ウィンドウ resize だけでは左右ペイン開閉を拾えないため ResizeObserver を使う。
   */
  function ensureParagraphPlainHostResizeObserver(host: HTMLElement): void {
    if (
      paragraphPlainHostResizeObserved === host &&
      (paragraphPlainHostResizeObserver != null || paragraphPlainResizeHandler != null)
    ) {
      return
    }
    teardownParagraphPlainHostResizeTracking()
    paragraphPlainHostResizeObserved = host

    const onHostClientSizeMaybeChanged = (): void => {
      if (!paragraphPlainLastView || !paragraphPlainActive) return
      const w = host.clientWidth
      const h = host.clientHeight
      const last = paragraphPlainHostLastClientSize
      if (last != null && last.w === w && last.h === h) return
      paragraphPlainHostLastClientSize = { w, h }
      invalidateParagraphPlainLayoutReuseSnapshots()
      scheduleParagraphPlainOverlayUpdateForReason('resize')
    }

    if (typeof ResizeObserver === 'undefined') {
      paragraphPlainResizeHandler = onHostClientSizeMaybeChanged
      window.addEventListener('resize', paragraphPlainResizeHandler)
      return
    }

    paragraphPlainHostResizeObserver = new ResizeObserver(onHostClientSizeMaybeChanged)
    paragraphPlainHostResizeObserver.observe(host)
  }

  function destroyParagraphPlainOverlay(): void {
    paragraphPlainOverlayFocusDeferred = false
    cancelScheduledParagraphPlainOverlayUpdate()
    cancelComfortableReservedHostAnimation()
    invalidateParagraphPlainLayoutReuseSnapshots()
    paragraphPlainOverlayHost?.style.removeProperty(PP_RESERVED_BLOCK_SIZE_VAR)
    lastComfortableReservedHostPx = null
    comfortableReservedStepPxCache = null
    if (paragraphPlainScrollSource && paragraphPlainScrollHandler) {
      paragraphPlainScrollSource.removeEventListener('scroll', paragraphPlainScrollHandler)
    }
    teardownParagraphPlainHostResizeTracking()
    paragraphPlainScrollSource = null
    paragraphPlainScrollHandler = null

    paragraphPlainOverlayWheelCleanup?.()
    paragraphPlainOverlayWheelCleanup = null
    paragraphPlainOverlayWheelViewDom = null

    if (!paragraphPlainOverlayEl) return
    paragraphPlainOverlayEl.remove()
    paragraphPlainOverlayEl = null
    paragraphPlainOverlayHost = null
    resetParagraphPlainOverlayLayoutCache()
  }

  function ensureParagraphPlainOverlayWheelBound(
    overlay: HTMLTextAreaElement,
    view: EditorView,
    host: HTMLElement,
  ): void {
    if (paragraphPlainOverlayWheelViewDom === view.dom && paragraphPlainOverlayWheelCleanup) return
    paragraphPlainOverlayWheelCleanup?.()
    paragraphPlainOverlayWheelViewDom = view.dom
    const verticalWheel = createVerticalWheelScrollController(view.dom)
    const horizontalWheel = createHorizontalEditorSurfaceWheelApplier()
    const onWheel = (event: WheelEvent): void => {
      verticalWheel.onWheel(event)
      if (!event.defaultPrevented) {
        horizontalWheel.apply(event, view.dom, host)
      }
    }
    overlay.addEventListener('wheel', onWheel, { passive: false })
    paragraphPlainOverlayWheelCleanup = (): void => {
      overlay.removeEventListener('wheel', onWheel)
      verticalWheel.destroy()
      horizontalWheel.destroy()
    }
  }

  function ensureParagraphPlainOverlay(view: EditorView): void {
    const host = (view.dom.closest('.editor-surface') ??
      view.dom.parentElement ??
      view.dom) as HTMLElement
    paragraphPlainOverlayHost = host
    paragraphPlainLastView = view
    ensureParagraphPlainExperimentsWindowApi(typeof window !== 'undefined' ? window : null)

    // Match Obsidian's approach: make the host the positioning context.
    // Without this, `position: absolute` may anchor to an ancestor (e.g. `.editor-panel`),
    // and `top/left` computed against `hostRect` will drift or fall back to the static flow.
    const hostComputed = getComputedStyle(host)
    if (hostComputed.position === 'static') {
      host.style.position = 'relative'
    }

    if (paragraphPlainScrollSource !== host) {
      if (paragraphPlainScrollSource && paragraphPlainScrollHandler) {
        paragraphPlainScrollSource.removeEventListener('scroll', paragraphPlainScrollHandler)
      }
      // The visible editor scrolls on `.editor-surface` (the host), not on `.ProseMirror`.
      // Listening to the wrong node leaves the overlay stranded while the document moves.
      paragraphPlainScrollSource = host
      paragraphPlainScrollHandler = () => {
        if (!paragraphPlainLastView || !paragraphPlainActive) return
        scheduleParagraphPlainOverlayUpdateForReason('scroll')
      }
      paragraphPlainScrollSource.addEventListener('scroll', paragraphPlainScrollHandler)
    }
    ensureParagraphPlainHostResizeObserver(host)

    if (paragraphPlainOverlayEl) {
      if (paragraphPlainOverlayEl.parentElement !== host) {
        paragraphPlainOverlayEl.remove()
        host.appendChild(paragraphPlainOverlayEl)
      }
      ensureParagraphPlainOverlayWheelBound(paragraphPlainOverlayEl, view, host)
      return
    }

    const overlay = document.createElement('textarea')
    overlay.className = 'tategaki-plain-overlay'
    overlay.spellcheck = false
    overlay.wrap = 'soft'
    overlay.setAttribute('autocapitalize', 'off')
    overlay.setAttribute('autocomplete', 'off')
    overlay.setAttribute('autocorrect', 'off')
    overlay.style.display = 'none'

    overlay.addEventListener('mousedown', (event) => {
      if (event.button === 2) event.preventDefault()
      event.stopPropagation()
    })
    overlay.addEventListener('pointerdown', (event) => {
      if (event.button === 2) event.preventDefault()
      event.stopPropagation()
    })
    overlay.addEventListener('compositionstart', () => {
      paragraphPlainComposing = true
    })
    overlay.addEventListener('compositionupdate', () => {
      scheduleParagraphPlainOverlayUpdateForReason('compositionupdate')
    })
    overlay.addEventListener('compositionend', () => {
      paragraphPlainComposing = false
      scheduleParagraphPlainOverlayUpdateForReason('compositionend')
    })
    overlay.addEventListener('input', () => {
      scheduleParagraphPlainOverlayUpdateForReason('input')
    })
    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (paragraphPlainComposing || isImeCompositionKey(event)) {
          return
        }
        event.preventDefault()
        setMode(false)
        return
      }
      // Block Cmd/Ctrl+Enter so it doesn't fall through to the textarea's
      // native newline insertion, which would desync the overlay content
      // from the ProseMirror document.
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key === 'Enter' &&
        !paragraphPlainComposing
      ) {
        event.preventDefault()
        return
      }
      // Arrow keys at boundaries: navigate to adjacent blocks
      if (
        event.key.startsWith('Arrow') &&
        !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey &&
        !paragraphPlainComposing && !isImeCompositionKey(event)
      ) {
        if (handleParagraphPlainArrowKey(event.key)) {
          event.preventDefault()
          return
        }
      }

      // Enter (without modifiers): split paragraph/heading
      if (
        event.key === 'Enter' &&
        !event.shiftKey && !event.metaKey && !event.ctrlKey &&
        !paragraphPlainComposing && !isImeCompositionKey(event) &&
        paragraphPlainCurrent
      ) {
        const tn = paragraphPlainCurrent.typeName
        if (tn === 'paragraph' || tn === 'heading') {
          event.preventDefault()
          handleParagraphPlainEnterKey()
          return
        }
      }

      if (
        event.key === 'Enter' &&
        event.shiftKey &&
        !paragraphPlainComposing &&
        paragraphPlainCurrent &&
        shouldBlockShiftEnterInParagraphPlain(paragraphPlainCurrent.typeName)
      ) {
        // Paragraph Plain uses a block textarea; inline hardbreaks are unstable here.
        event.preventDefault()
        pushLog('plainParagraph', 'blocked Shift+Enter in paragraph-plain block')
        return
      }

      // Backspace at start: merge with previous block
      if (
        event.key === 'Backspace' &&
        !event.shiftKey &&
        !paragraphPlainComposing && !isImeCompositionKey(event) &&
        overlay.selectionStart === 0 && overlay.selectionEnd === 0 &&
        paragraphPlainCurrent
      ) {
        const tn = paragraphPlainCurrent.typeName
        if (tn === 'paragraph' || tn === 'heading') {
          event.preventDefault()
          handleParagraphPlainBackspaceAtStart()
          return
        }
      }

      // Allow the Paragraph Plain toggle shortcut (Cmd/Ctrl + Alt/Option + P)
      // to bubble to the window-level handler so it can commit and exit
      // Paragraph Plain. All other keys stay scoped to the overlay.
      // IME 未確定中は Escape と同様に toggle を通さない（確定順依存で入力を落とす事故を防ぐ）。
      if (
        (event.metaKey || event.ctrlKey) &&
        event.altKey &&
        !event.shiftKey &&
        (event.code === 'KeyP' || event.key.toLowerCase() === 'p') &&
        !paragraphPlainComposing &&
        !isImeCompositionKey(event)
      ) {
        return
      }

      event.stopPropagation()
    })

    paragraphPlainOverlayEl = overlay
    host.appendChild(overlay)
    ensureParagraphPlainOverlayWheelBound(overlay, view, host)
  }

  function scheduleParagraphPlainOverlayUpdate(options?: {
    measure?: boolean
    deferTextMeasure?: boolean
    position?: boolean
    endProfileSessionAfterFlush?: boolean
  }): void {
    paragraphPlainProfilerRunPhase('scheduleParagraphPlainOverlayUpdate', () => {
      if (!paragraphPlainActive || !paragraphPlainLastView || !paragraphPlainOverlayEl) return
      if (options?.endProfileSessionAfterFlush) {
        paragraphPlainProfilerMarkEndScheduledForFlush()
      }
      if (options?.position !== false) {
        paragraphPlainOverlayPending.needsPosition = true
      }
      if (options?.measure) {
        paragraphPlainOverlayPending.needsMeasure = true
        paragraphPlainOverlayPending.deferTextMeasure = false
      } else if (options?.deferTextMeasure && !paragraphPlainOverlayPending.needsMeasure) {
        paragraphPlainOverlayPending.deferTextMeasure = true
      }
      if (paragraphPlainOverlayUpdateFrame != null) return
      paragraphPlainOverlayUpdateFrame = requestAnimationFrame(() => {
        paragraphPlainOverlayUpdateFrame = null
        flushParagraphPlainOverlayUpdate()
      })
    })
  }

  function scheduleParagraphPlainOverlayUpdateForReason(
    reason: ParagraphPlainOverlayMeasureReason,
  ): void {
    if (reason === 'scroll' && isParagraphPlainScrollRepositionDisabled()) {
      paragraphPlainProfilerMark('pp-experiment-disable-scroll-reposition', 'schedule-skipped')
      return
    }
    const shouldMeasure = shouldRequestParagraphPlainOverlayMeasure({
      reason,
      isComposing: paragraphPlainComposing,
      lastMeasuredAt: paragraphPlainLastOverlayMeasureAt,
      now: getParagraphPlainOverlayNow(),
    })
    // input / compositionupdate のような hot path では、cache が有効である限り
    // positionParagraphPlainOverlay (= getBoundingClientRect 走査) を skip し、
    // adjustOverlaySizeToContent だけで content サイズに追従させる。
    // scroll / resize / sync / undo / redo / compositionend / cache 無効時は
    // 従来どおり full reposition を要求する。
    const hasCachedBaseRect =
      paragraphPlainOverlayLayoutCache.hasMeasurement &&
      paragraphPlainOverlayLayoutCache.baseRect != null &&
      paragraphPlainOverlayLayoutCache.writingMode != null
    const shouldPosition = shouldRequestParagraphPlainOverlayPosition({
      reason,
      hasCachedBaseRect,
    })
    const deferTextMeasure =
      reason === 'scroll' ||
      (paragraphPlainComposing &&
        (reason === 'input' || reason === 'compositionupdate'))
    scheduleParagraphPlainOverlayUpdate({
      measure: shouldMeasure || undefined,
      deferTextMeasure: !shouldMeasure && deferTextMeasure ? true : undefined,
      position: shouldPosition ? undefined : false,
    })
  }

  function resolveParagraphPlainOverlayWritingMode(): string {
    if (!paragraphPlainOverlayEl) return ''
    return (
      paragraphPlainOverlayEl.style.writingMode ||
      getComputedStyle(paragraphPlainOverlayEl).writingMode ||
      ''
    )
  }

  function captureParagraphPlainBaseRectFromElement(
    blockElement: Element,
    blockLayoutSignature: string,
  ): {
    baseRect: ParagraphPlainOverlayBaseRect
    blockLayoutSignature: string
  } | null {
    if (!paragraphPlainOverlayHost) return null
    const rect = paragraphPlainProfilerRunPhase('positionParagraphPlainOverlay.blockRect', () => {
      // Temporarily clear reserved space (via CSS variable on host, outside PM DOM)
      // so getBoundingClientRect returns the block's natural size.
      if (!isParagraphPlainReservedBlockSizeDisabled()) {
        paragraphPlainOverlayHost!.style.setProperty(PP_RESERVED_BLOCK_SIZE_VAR, 'auto')
      }
      return blockElement.getBoundingClientRect()
    })
    const hostRect = paragraphPlainProfilerRunPhase(
      'positionParagraphPlainOverlay.hostRect',
      () => paragraphPlainOverlayHost!.getBoundingClientRect(),
    )
    const top = rect.top - hostRect.top + paragraphPlainOverlayHost.scrollTop
    const left = rect.left - hostRect.left + paragraphPlainOverlayHost.scrollLeft
    const baseWidth = Math.max(1, rect.width)
    const baseHeight = Math.max(1, rect.height)

    return {
      baseRect: { top, left, width: baseWidth, height: baseHeight },
      blockLayoutSignature,
    }
  }

  function applyParagraphPlainOverlayPlacement(params: {
    baseRect: ParagraphPlainOverlayBaseRect
    width: number
    height: number
    writingMode: string
  }): void {
    if (!paragraphPlainOverlayEl) return
    const { baseRect, width, height, writingMode } = params
    const left = writingMode === 'vertical-rl'
      ? baseRect.left + baseRect.width - width
      : baseRect.left
    paragraphPlainOverlayEl.style.top = `${baseRect.top}px`
    paragraphPlainOverlayEl.style.left = `${left}px`
    paragraphPlainOverlayEl.style.width = `${width}px`
    paragraphPlainOverlayEl.style.height = `${height}px`
  }

  function positionParagraphPlainOverlay(
    view: EditorView,
    pos: number,
    typeName: string,
  ): {
    baseRect: ParagraphPlainOverlayBaseRect
    writingMode: string
    blockElement: Element
    layoutSource: 'exact' | 'reused'
    reusedSnapshot: ParagraphPlainLayoutReuseSnapshot | null
    /** PP-L6: flush で adjust 後の net と比較し、同一なら post-position の blockRect 観測を再利用する。 */
    placementAfterPosition: {
      overlayWidth: number
      overlayHeight: number
      /** position 終了時に host に書いた量子化済み reserved px。`auto` のときは null（remeasure 後の再利用対象外）。 */
      reservedPx: number | null
    }
  } | null {
    if (!paragraphPlainOverlayEl || !paragraphPlainOverlayHost) return null
    flushComfortableReservedHostPendingSync()
    if (!isParagraphPlainReservedBlockSizeDisabled()) {
      cancelComfortableReservedHostAnimation()
      paragraphPlainOverlayHost.style.setProperty(PP_RESERVED_BLOCK_SIZE_VAR, 'auto')
      lastComfortableReservedHostPx = null
    }
    const blockElement = paragraphPlainProfilerRunPhase(
      'positionParagraphPlainOverlay.resolveBlockElement',
      () => resolveBlockElementAtPos(view, pos, typeName),
    )
    if (!blockElement) {
      hideParagraphPlainOverlay()
      return null
    }

    const blockLayoutSignature = computeParagraphPlainBlockLayoutSignature(blockElement)
    const writingMode = resolveParagraphPlainOverlayWritingMode()
    const activeBlockKey = buildParagraphPlainActiveBlockKey(pos, typeName)
    const reusableSnapshot = selectReusableParagraphPlainLayoutSnapshot({
      snapshot: activeBlockKey
        ? paragraphPlainLayoutReuseSnapshots.get(activeBlockKey) ?? null
        : null,
      activeBlockKey,
      hostIdentity: paragraphPlainOverlayHost,
      hostViewportSignature: computeParagraphPlainHostViewportSignature(
        paragraphPlainOverlayHost,
      ),
      blockLayoutSignature,
      writingMode,
      text: paragraphPlainOverlayEl.value,
      layoutEpoch: paragraphPlainLayoutReuseEpoch,
    })
    const captured = reusableSnapshot
      ? {
          baseRect: reusableSnapshot.baseRect,
          blockLayoutSignature: reusableSnapshot.blockLayoutSignature,
        }
      : captureParagraphPlainBaseRectFromElement(blockElement, blockLayoutSignature)
    if (!captured) {
      hideParagraphPlainOverlay()
      return null
    }

    const { baseRect } = captured
    const layoutSource = reusableSnapshot ? 'reused' : 'exact'
    if (layoutSource === 'reused') {
      paragraphPlainProfilerMark(
        'pp-l8-reuse-position-base-rect',
        'exact-snapshot-same-layout',
      )
    }
    const nextWidth =
      reusableSnapshot?.measuredWidth ?? paragraphPlainOverlayLayoutCache.measuredWidth ?? baseRect.width
    const nextHeight =
      reusableSnapshot?.measuredHeight ?? paragraphPlainOverlayLayoutCache.measuredHeight ?? baseRect.height

    let placementAfterPosition!: {
      overlayWidth: number
      overlayHeight: number
      reservedPx: number | null
    }

    paragraphPlainProfilerRunPhase('positionParagraphPlainOverlay.applyPlacement', () => {
      applyParagraphPlainOverlayPlacement({
        baseRect,
        width: nextWidth,
        height: nextHeight,
        writingMode,
      })

      const allowReservedHostWrites = !isParagraphPlainReservedBlockSizeDisabled()
      const idealReservedPx =
        reusableSnapshot?.reservedSize ?? paragraphPlainOverlayLayoutCache.reservedSize
      let reservedPxWritten: number | null = null
      if (allowReservedHostWrites) {
        if (idealReservedPx != null && paragraphPlainOverlayEl) {
          const basePx = paragraphPlainReserveAxisBasePx({ baseRect, writingMode })
          const { stepPx, cache } = resolveParagraphPlainReservedStepPx(
            paragraphPlainOverlayEl,
            writingMode,
            comfortableReservedStepPxCache,
          )
          comfortableReservedStepPxCache = cache
          reservedPxWritten = computeComfortableReservedHostTargetPx({
            idealPx: idealReservedPx,
            basePx,
            stepPx,
          })
          applyComfortableReservedHostImmediate(reservedPxWritten)
        } else {
          cancelComfortableReservedHostAnimation()
          paragraphPlainOverlayHost!.style.setProperty(PP_RESERVED_BLOCK_SIZE_VAR, 'auto')
          lastComfortableReservedHostPx = null
        }
      }

      placementAfterPosition = {
        overlayWidth: nextWidth,
        overlayHeight: nextHeight,
        reservedPx: allowReservedHostWrites ? reservedPxWritten : null,
      }

      paragraphPlainOverlayLayoutCache = {
        ...paragraphPlainOverlayLayoutCache,
        hasMeasurement: reusableSnapshot ? true : paragraphPlainOverlayLayoutCache.hasMeasurement,
        baseRect,
        measuredBaseWidth: reusableSnapshot?.baseRect.width ??
          paragraphPlainOverlayLayoutCache.measuredBaseWidth,
        measuredBaseHeight: reusableSnapshot?.baseRect.height ??
          paragraphPlainOverlayLayoutCache.measuredBaseHeight,
        text: reusableSnapshot?.text ?? paragraphPlainOverlayLayoutCache.text,
        measuredWidth: reusableSnapshot?.measuredWidth ??
          paragraphPlainOverlayLayoutCache.measuredWidth,
        measuredHeight: reusableSnapshot?.measuredHeight ??
          paragraphPlainOverlayLayoutCache.measuredHeight,
        reservedSize: reusableSnapshot?.reservedSize ??
          paragraphPlainOverlayLayoutCache.reservedSize,
        writingMode: reusableSnapshot?.writingMode ?? paragraphPlainOverlayLayoutCache.writingMode,
        blockLayoutSignature,
        blockLayoutLastObservedRect: reusableSnapshot?.blockLayoutLastObservedRect ??
          paragraphPlainOverlayLayoutCache.blockLayoutLastObservedRect,
        activeBlockKey: reusableSnapshot?.activeBlockKey ??
          paragraphPlainOverlayLayoutCache.activeBlockKey,
        hostIdentity: reusableSnapshot?.hostIdentity ??
          paragraphPlainOverlayLayoutCache.hostIdentity,
      }
    })

    return {
      baseRect,
      writingMode,
      blockElement,
      layoutSource,
      reusedSnapshot: reusableSnapshot,
      placementAfterPosition,
    }
  }

  /**
   * @returns true if overlay/host styles or cache were mutated (layout read / DOM write path).
   * false = early no-op; flush may reuse a post-position block↔host rect sample (PP-L3).
   */
  function adjustOverlaySizeToContent(params: {
    baseRect: ParagraphPlainOverlayBaseRect
    writingMode: string
    measureRequested: boolean
    deferTextMeasure: boolean
    activeBlockKey: string | null
  }): boolean {
    if (!paragraphPlainOverlayEl || !paragraphPlainOverlayHost) return false
    const {
      baseRect,
      writingMode,
      measureRequested,
      deferTextMeasure,
      activeBlockKey,
    } = params
    const text = paragraphPlainOverlayEl.value

    if (
      !shouldRemeasureParagraphPlainOverlay({
        cache: paragraphPlainOverlayLayoutCache,
        measureRequested,
        deferTextMeasure,
        text,
        writingMode,
        activeBlockKey,
        hostIdentity: paragraphPlainOverlayHost,
        baseWidth: baseRect.width,
        baseHeight: baseRect.height,
      })
    ) {
      return false
    }

    const padding = 2

    // Reset to base dimensions so scrollWidth/scrollHeight reflect true content size
    paragraphPlainOverlayEl.style.width = `${baseRect.width}px`
    paragraphPlainOverlayEl.style.height = `${baseRect.height}px`

    const scrollWidth = Math.ceil(paragraphPlainOverlayEl.scrollWidth)
    const scrollHeight = Math.ceil(paragraphPlainOverlayEl.scrollHeight)
    const nextWidth = Math.max(baseRect.width, scrollWidth + padding)
    const nextHeight = Math.max(baseRect.height, scrollHeight + padding)
    applyParagraphPlainOverlayPlacement({
      baseRect,
      width: nextWidth,
      height: nextHeight,
      writingMode,
    })

    // Reserve space on the underlying block so subsequent content is pushed down.
    // Set via CSS variable on the host (outside PM DOM) to avoid MutationObserver loops.
    const reservedSize = computeOverlayReservedBlockSize({
      baseWidth: baseRect.width,
      baseHeight: baseRect.height,
      scrollWidth,
      scrollHeight,
      writingMode: writingMode || '',
    })
    if (!isParagraphPlainReservedBlockSizeDisabled() && paragraphPlainOverlayEl) {
      const basePx = paragraphPlainReserveAxisBasePx({
        baseRect,
        writingMode: writingMode || '',
      })
      const { stepPx, cache } = resolveParagraphPlainReservedStepPx(
        paragraphPlainOverlayEl,
        writingMode || '',
        comfortableReservedStepPxCache,
      )
      comfortableReservedStepPxCache = cache
      const hostTargetPx = computeComfortableReservedHostTargetPx({
        idealPx: reservedSize,
        basePx,
        stepPx,
      })
      scheduleComfortableReservedHostWrite(hostTargetPx)
    }

    paragraphPlainOverlayLayoutCache = {
      hasMeasurement: true,
      baseRect,
      measuredBaseWidth: baseRect.width,
      measuredBaseHeight: baseRect.height,
      text,
      measuredWidth: nextWidth,
      measuredHeight: nextHeight,
      reservedSize,
      writingMode,
      blockLayoutSignature: paragraphPlainOverlayLayoutCache.blockLayoutSignature,
      blockLayoutLastObservedRect: paragraphPlainOverlayLayoutCache.blockLayoutLastObservedRect,
      activeBlockKey,
      hostIdentity: paragraphPlainOverlayHost,
    }
    paragraphPlainLastOverlayMeasureAt = getParagraphPlainOverlayNow()
    return true
  }

  /** PP-L4 / click-switch: overlay の focus と選択範囲（markdown はこの時点のブロックソース）。 */
  function paragraphPlainOverlayRunFocusAndSelection(markdown: string): void {
    if (!paragraphPlainOverlayEl) return
    const el = paragraphPlainOverlayEl
    const skipFocus = paragraphPlainProfilerRunPhase(
      'startParagraphPlain.overlayDom.beforeFocus',
      () => typeof document !== 'undefined' && document.activeElement === el,
    )
    paragraphPlainProfilerRunPhase('startParagraphPlain.overlayDom.focus', () => {
      if (!skipFocus) {
        el.focus({ preventScroll: true })
      } else {
        paragraphPlainProfilerMark(
          'startParagraphPlain.overlayDom.focus',
          'skipped-already-focused',
        )
      }
    })
    paragraphPlainProfilerRunPhase('startParagraphPlain.overlayDom.afterFocus', () => {
      void el.selectionStart
      void el.selectionEnd
    })
    paragraphPlainProfilerRunPhase('startParagraphPlain.overlayDom.setSelectionRange', () => {
      // If deferred re-entry focus lands after the user has already resumed typing,
      // don't rewind the caret back into the freshly typed text.
      if (document.activeElement === el && el.value !== markdown) {
        paragraphPlainPendingSelection = null
        return
      }
      if (paragraphPlainPendingSelection) {
        const len = markdown.length
        if (paragraphPlainPendingSelection.kind === 'block-end') {
          el.setSelectionRange(len, len)
        } else {
          const start = Math.min(paragraphPlainPendingSelection.start, len)
          const end = Math.min(paragraphPlainPendingSelection.end, len)
          el.setSelectionRange(start, end)
        }
        paragraphPlainPendingSelection = null
      } else {
        el.setSelectionRange(markdown.length, markdown.length)
      }
    })
  }

  function paragraphPlainApplyDeferredOverlayFocusIfNeeded(): void {
    if (!paragraphPlainOverlayFocusDeferred) return
    paragraphPlainOverlayFocusDeferred = false
    if (
      !paragraphPlainOverlayEl ||
      !paragraphPlainActive ||
      !paragraphPlainCurrent ||
      paragraphPlainOverlayEl.style.display === 'none'
    ) {
      return
    }
    paragraphPlainProfilerRunPhase('startParagraphPlain.overlayDom.deferredFocus', () => {
      paragraphPlainOverlayRunFocusAndSelection(paragraphPlainCurrent!.originalMarkdown)
    })
  }

  function flushParagraphPlainOverlayUpdate(): void {
    const finalizeProfilerAfterFlush = (): void => {
      if (paragraphPlainProfilerPeekEndScheduledForFlush()) {
        paragraphPlainProfilerClearEndScheduledForFlush()
        paragraphPlainProfilerCompleteSessionAfterFlush()
      }
    }

    if (!paragraphPlainActive || paragraphPlainApplying || !paragraphPlainLastView) {
      finalizeProfilerAfterFlush()
      return
    }

    const pending = paragraphPlainOverlayPending
    paragraphPlainOverlayPending = {
      needsPosition: false,
      needsMeasure: false,
      deferTextMeasure: false,
    }
    if (!pending.needsPosition && !pending.needsMeasure && !pending.deferTextMeasure) {
      finalizeProfilerAfterFlush()
      return
    }

    const endWanted = paragraphPlainProfilerPeekEndScheduledForFlush()
    try {
      paragraphPlainProfilerRunPhase('flushParagraphPlainOverlayUpdate', () => {
        try {
        const pluginState = paragraphPlainPluginKey.getState(paragraphPlainLastView!.state)
        const pos = pluginState?.pos ?? null
        const typeName = pluginState?.typeName ?? null
        if (pos == null || typeName == null) {
          hideParagraphPlainOverlay()
          return
        }

        const cache = paragraphPlainOverlayLayoutCache
        const cacheUsable =
          !pending.needsPosition &&
          cache.hasMeasurement &&
          cache.baseRect != null &&
          cache.writingMode != null

        let baseRect: ParagraphPlainOverlayBaseRect | null = null
        let writingMode: string | null = null
        let blockElementAfterPosition: Element | null = null
        let placementAfterPosition: {
          overlayWidth: number
          overlayHeight: number
          reservedPx: number | null
        } | null = null
        let layoutSource: 'exact' | 'reused' = 'exact'
        let reusedSnapshot: ParagraphPlainLayoutReuseSnapshot | null = null

        if (cacheUsable) {
          baseRect = cache.baseRect
          writingMode = cache.writingMode
        } else {
          const positioned = paragraphPlainProfilerRunPhase(
            'positionParagraphPlainOverlay',
            () =>
              positionParagraphPlainOverlay(paragraphPlainLastView!, pos, typeName),
          )
          if (!positioned) return
          baseRect = positioned.baseRect
          writingMode = positioned.writingMode
          blockElementAfterPosition = positioned.blockElement
          placementAfterPosition = positioned.placementAfterPosition
          layoutSource = positioned.layoutSource
          reusedSnapshot = positioned.reusedSnapshot
        }

        if (!baseRect || writingMode == null) return

        const overlayHost = paragraphPlainOverlayHost

        const didRemeasure = paragraphPlainProfilerRunPhase('adjustOverlaySizeToContent', () =>
          adjustOverlaySizeToContent({
            baseRect,
            writingMode,
            measureRequested: pending.needsMeasure,
            deferTextMeasure: pending.deferTextMeasure && !pending.needsMeasure,
            activeBlockKey: buildParagraphPlainActiveBlockKey(pos, typeName),
          }),
        )

        if (cacheUsable) {
          paragraphPlainProfilerRunPhase('readParagraphPlainBlockRectRelativeToHost', () => {
            const observed = readParagraphPlainBlockRectRelativeToHost({
              view: paragraphPlainLastView!,
              pos,
              typeName,
              host: overlayHost,
            })
            if (observed) {
              paragraphPlainOverlayLayoutCache = {
                ...paragraphPlainOverlayLayoutCache,
                blockLayoutLastObservedRect: observed,
              }
            }
          })
        } else if (blockElementAfterPosition && overlayHost) {
          // PP-L3: position で得た blockElement を使い resolveBlockElementAtPos を二重にしない。
          // 観測は adjust 後のレイアウトを反映する（同一要素への read は最大 1 回）。
          //
          // PP-L7: didRemeasure かつ post-adjust の overlay 寸法が position 時と異なる場合、
          // 以前は同一 block に対し read が 2 連続で走り、先頭の結果が破棄されていた。
          // いまは分岐ごとに 1 回だけ読む。
          let observed: ParagraphPlainOverlayBaseRect
          const cAfter = paragraphPlainOverlayLayoutCache
          const canReuseSnapshotObserved =
            layoutSource === 'reused' &&
            reusedSnapshot?.blockLayoutLastObservedRect != null &&
            cAfter.measuredWidth === reusedSnapshot.measuredWidth &&
            cAfter.measuredHeight === reusedSnapshot.measuredHeight &&
            cAfter.reservedSize === reusedSnapshot.reservedSize &&
            cAfter.text === reusedSnapshot.text

          if (canReuseSnapshotObserved && reusedSnapshot?.blockLayoutLastObservedRect) {
            observed = reusedSnapshot.blockLayoutLastObservedRect
            paragraphPlainProfilerMark(
              'pp-l8-reuse-post-position-observed',
              'exact-snapshot-same-layout',
            )
          } else if (!didRemeasure) {
            observed = paragraphPlainProfilerRunPhase(
              'readParagraphPlainBlockRectRelativeToHost',
              () =>
                computeParagraphPlainBlockRectRelativeToHostFromElement(
                  blockElementAfterPosition,
                  overlayHost,
                ),
            )
            paragraphPlainProfilerMark(
              'readParagraphPlainBlockRectRelativeToHost',
              'pp-l3-reuse-post-position-observed',
            )
          } else {
            const snap = placementAfterPosition
            const canReusePostPositionRect =
              snap != null &&
              cAfter.measuredWidth === snap.overlayWidth &&
              cAfter.measuredHeight === snap.overlayHeight

            if (canReusePostPositionRect) {
              paragraphPlainProfilerMark(
                'pp-l6-reuse-post-position-block-rect',
                'post-adjust-net-unchanged',
              )
            } else {
              paragraphPlainProfilerMark(
                'pp-l7-single-observed-after-adjust',
                'post-adjust-net-changed',
              )
            }
            observed = paragraphPlainProfilerRunPhase(
              'readParagraphPlainBlockRectRelativeToHost',
              () =>
                computeParagraphPlainBlockRectRelativeToHostFromElement(
                  blockElementAfterPosition,
                  overlayHost,
                ),
            )
          }

          paragraphPlainOverlayLayoutCache = {
            ...paragraphPlainOverlayLayoutCache,
            blockLayoutLastObservedRect: observed,
          }
        }
        rememberParagraphPlainLayoutReuseSnapshot('flush-observed')
        } finally {
          paragraphPlainApplyDeferredOverlayFocusIfNeeded()
        }
      })
    } finally {
      if (endWanted) {
        paragraphPlainProfilerClearEndScheduledForFlush()
        paragraphPlainProfilerCompleteSessionAfterFlush()
      }
    }
  }

  function startParagraphPlain(
    view: EditorView,
    pos: number,
    typeName: string,
    options?: { deferOverlayFocus?: boolean },
  ): void {
    const node = view.state.doc.nodeAt(pos)
    if (!node || node.type.name !== typeName) {
      paragraphPlainCurrent = null
      paragraphPlainActivePos = null
      hideParagraphPlainOverlay()
      return
    }

    paragraphPlainProfilerRunPhase('startParagraphPlain', () => {
      const markdown = paragraphPlainProfilerRunPhase('serializeBlockNode', () =>
        serializeBlockNode(view.state, node, pos, getLineBreakPolicy()),
      )
      paragraphPlainCurrent = {
        from: pos,
        to: pos + node.nodeSize,
        typeName,
        originalMarkdown: markdown,
      }
      paragraphPlainActivePos = pos

      if (paragraphPlainScrollIntoViewPending) {
        paragraphPlainScrollIntoViewPending = false
        const targetEl = resolveBlockElementAtPos(view, pos, typeName)
        if (targetEl) {
          try {
            targetEl.scrollIntoView({ block: 'nearest', inline: 'nearest' })
          } catch {
            // Non-fatal: older engines may reject the options bag.
          }
        }
      }

      paragraphPlainProfilerRunPhase('startParagraphPlain.overlayDom', () => {
        if (!paragraphPlainOverlayEl) return
        const el = paragraphPlainOverlayEl
        paragraphPlainProfilerRunPhase('startParagraphPlain.overlayDom.setValue', () => {
          if (el.value !== markdown) {
            el.value = markdown
          }
        })
        paragraphPlainProfilerRunPhase('startParagraphPlain.overlayDom.setDisplay', () => {
          if (el.style.display === 'none') {
            el.style.display = ''
          }
        })
        if (options?.deferOverlayFocus) {
          paragraphPlainOverlayFocusDeferred = true
          return
        }
        paragraphPlainOverlayRunFocusAndSelection(markdown)
      })
    })
  }

  function replaceBlockNodeInternal(
    markdown: string,
    context: ParagraphPlainContext,
    options?: { preserveSelection?: boolean; allowMarkdownBlockReparse?: boolean },
  ): boolean {
    const nextNode = options?.allowMarkdownBlockReparse
      ? paragraphPlainProfilerRunPhase(
          'parseParagraphPlainExitReplacementContent',
          () =>
            parseParagraphPlainExitReplacementContent(
              editor.state,
              markdown,
              context.typeName,
              getLineBreakPolicy(),
            ),
          'replace-block',
        )
      : paragraphPlainProfilerRunPhase(
          'parseReplacementNode',
          () =>
            parseReplacementNode(
              editor.state,
              markdown,
              context.typeName,
              getLineBreakPolicy(),
            ),
          'replace-block',
        )
    if (!nextNode) {
      pushLog('sourceEdit', `replaceBlock rejected: parse failed for ${context.typeName}`)
      return false
    }

    const docSize = editor.state.doc.content.size
    const from = Math.max(0, Math.min(context.from, docSize))
    const to = Math.max(0, Math.min(context.to, docSize))

    const tr = editor.state.tr.replaceWith(from, to, nextNode)
    if (!options?.preserveSelection) {
      const mappedFrom = tr.mapping.map(from)
      const safePos = Math.max(0, Math.min(tr.doc.content.size, mappedFrom + 1))
      tr.setSelection(Selection.near(tr.doc.resolve(safePos), 1))
    }
    paragraphPlainProfilerMark('dispatch.before', 'replaceBlock')
    paragraphPlainProfilerRunPhase('dispatch', () => {
      editor.view.dispatch(tr)
    }, 'replaceBlock')
    pushLog('sourceEdit', `replaceBlock applied (${context.typeName})`)
    return true
  }

  function commitCurrentParagraphPlain(
    save: boolean,
    options?: { preserveSelection?: boolean; allowMarkdownBlockReparse?: boolean },
  ): boolean {
    flushComfortableReservedHostPendingSync()

    if (!paragraphPlainCurrent) {
      paragraphPlainActivePos = null
      return true
    }

    if (save && paragraphPlainOverlayEl) {
      const nextMarkdown = paragraphPlainOverlayEl.value
      if (nextMarkdown !== paragraphPlainCurrent.originalMarkdown) {
        paragraphPlainApplying = true
        try {
          const applied = paragraphPlainProfilerRunPhase('commitCurrentParagraphPlain', () =>
            replaceBlockNodeInternal(
              nextMarkdown,
              paragraphPlainCurrent!,
              options,
            ),
          )
          if (!applied) {
            pushLog('sourceEdit', `replaceBlock kept editing (${paragraphPlainCurrent.typeName})`)
            return false
          }
          invalidateParagraphPlainLayoutReuseSnapshots()
        } finally {
          paragraphPlainApplying = false
        }
      }
    }

    paragraphPlainCurrent = null
    paragraphPlainActivePos = null
    return true
  }

  function isImeCompositionKey(event: KeyboardEvent): boolean {
    return event.isComposing || event.key === 'Process' || event.key === 'Unidentified'
  }

  function findAdjacentPlainBlock(
    state: EditorState,
    pos: number,
    direction: 'prev' | 'next',
  ): { pos: number; node: PMNode } | null {
    const currentNode = state.doc.nodeAt(pos)
    if (!currentNode) return null
    const resolved = state.doc.resolve(pos)
    const depth = resolved.depth
    const parent = resolved.parent
    const index = resolved.index(depth)

    if (direction === 'prev') {
      let cursorPos = pos
      for (let idx = index - 1; idx >= 0; idx--) {
        const node = parent.child(idx)
        cursorPos -= node.nodeSize
        if (isParagraphPlainTargetType(node.type.name)) {
          return { pos: cursorPos, node }
        }
      }
      return null
    }

    let cursorPos = pos + currentNode.nodeSize
    for (let idx = index + 1; idx < parent.childCount; idx++) {
      const node = parent.child(idx)
      if (isParagraphPlainTargetType(node.type.name)) {
        return { pos: cursorPos, node }
      }
      cursorPos += node.nodeSize
    }
    return null
  }

  function isVerticalWritingMode(): boolean {
    try {
      const wm = window.getComputedStyle(editor.view.dom).writingMode
      return wm.startsWith('vertical')
    } catch {
      return true
    }
  }

  function getArrowMoveDirection(
    key: string,
    atStart: boolean,
    atEnd: boolean,
  ): 'prev' | 'next' | null {
    if (isVerticalWritingMode()) {
      if (atEnd && key === 'ArrowLeft') return 'next'
      if (atStart && key === 'ArrowRight') return 'prev'
    } else {
      if (atEnd && key === 'ArrowDown') return 'next'
      if (atStart && key === 'ArrowUp') return 'prev'
    }
    return null
  }

  function handleParagraphPlainArrowKey(key: string): boolean {
    if (!paragraphPlainOverlayEl || !paragraphPlainCurrent) return false

    const text = paragraphPlainOverlayEl.value
    const selStart = paragraphPlainOverlayEl.selectionStart ?? 0
    const selEnd = paragraphPlainOverlayEl.selectionEnd ?? selStart
    if (selStart !== selEnd) return false

    const atStart = selStart === 0
    const atEnd = selStart === text.length
    if (!atStart && !atEnd) return false

    const direction = getArrowMoveDirection(key, atStart, atEnd)
    if (!direction) return false

    const currentPos = paragraphPlainCurrent.from

    // Preflight: only commit when there is actually an adjacent plain block.
    // Committing first at a no-target boundary would clear paragraphPlainCurrent
    // while leaving the overlay visible, which orphans the overlay state and
    // causes the next Enter to fall through to the native textarea newline.
    const preflightTarget = findAdjacentPlainBlock(editor.state, currentPos, direction)
    if (!preflightTarget) {
      const restoreSelection = () => {
        if (!paragraphPlainOverlayEl) return
        paragraphPlainOverlayEl.focus({ preventScroll: true })
        paragraphPlainOverlayEl.setSelectionRange(selStart, selEnd)
      }
      restoreSelection()
      queueMicrotask(restoreSelection)
      requestAnimationFrame(restoreSelection)
      return true
    }

    paragraphPlainProfilerBeginSession('arrow-switch')

    const committed = commitCurrentParagraphPlain(true, {
      allowMarkdownBlockReparse: true,
    })
    if (!committed) {
      paragraphPlainProfilerCancelSession('commit-failed')
      return false
    }

    const state = editor.state
    const target = findAdjacentPlainBlock(state, currentPos, direction)
    if (!target) {
      paragraphPlainProfilerCancelSession('no-target-after-commit')
      if (paragraphPlainLastView) {
        syncParagraphPlainStateFromView(paragraphPlainLastView)
      }
      return true
    }

    paragraphPlainPendingSelection =
      direction === 'prev'
        ? { kind: 'block-end' }
        : { kind: 'absolute', start: 0, end: 0 }

    // For 'prev', land at the inside-end of the target block. Using
    // `target.pos + target.node.content.size` collapses to `target.pos`
    // (the parent boundary BEFORE the block) when the target is an empty
    // paragraph (`content.size === 0`), which causes findActiveBlockPos
    // to lose the paragraph target on re-entry and the overlay disappears.
    // `target.pos + target.node.nodeSize - 1` resolves to the inside-end
    // for both empty (== inside-start) and non-empty paragraphs.
    const selectionPos = direction === 'prev'
      ? target.pos + target.node.nodeSize - 1
      : target.pos + 1
    const tr = state.tr.setSelection(TextSelection.create(state.doc, selectionPos))
    paragraphPlainProfilerMark('dispatch.before', 'arrow-selection')
    paragraphPlainProfilerRunPhase('dispatch', () => {
      editor.view.dispatch(tr)
    }, 'arrow-selection')
    return true
  }

  function handleParagraphPlainEnterKey(): void {
    if (!paragraphPlainOverlayEl || !paragraphPlainCurrent || !paragraphPlainLastView) return
    const typeName = paragraphPlainCurrent.typeName
    if (typeName !== 'paragraph' && typeName !== 'heading') return

    const text = paragraphPlainOverlayEl.value
    const selStart = paragraphPlainOverlayEl.selectionStart ?? text.length
    const selEnd = paragraphPlainOverlayEl.selectionEnd ?? selStart
    const beforeText = text.slice(0, selStart)
    const afterText = text.slice(selEnd)

    const state = editor.state
    const pos = paragraphPlainCurrent.from
    const node = state.doc.nodeAt(pos)
    if (!node) return

    const paragraphType = state.schema.nodes.paragraph
    if (!paragraphType) return

    paragraphPlainProfilerBeginSession('enter-reentry')

    const beforeNode = resolveParagraphPlainSplitBeforeNode({
      state,
      typeName,
      currentNode: node,
      beforeText,
      lineBreakPolicy: getLineBreakPolicy(),
      allowMarkdownBlockReparse: true,
    })
    if (!beforeNode) {
      paragraphPlainProfilerCancelSession('split-before-null')
      return
    }

    let afterNode: PMNode
    let afterContent = afterText
    if (typeName === 'heading') {
      const headingMatch = afterContent.match(/^#{1,6}\s+(.*)$/)
      if (headingMatch) {
        afterContent = headingMatch[1] ?? ''
      }
    }
    if (!afterContent) {
      afterNode = paragraphType.create()
    } else {
      afterNode = paragraphPlainProfilerRunPhase('parseMarkdown.afterSplit', () => {
        const afterDoc = parseMarkdown(state.schema, afterContent, getLineBreakPolicy())
        if (afterDoc.childCount === 1 && afterDoc.child(0).type.name === 'paragraph') {
          return afterDoc.child(0)
        }
        return paragraphType.create(null, afterContent ? [state.schema.text(afterContent)] : undefined)
      })
    }

    const from = paragraphPlainCurrent.from
    const to = paragraphPlainCurrent.to

    paragraphPlainCurrent = null
    paragraphPlainActivePos = null
    hideParagraphPlainOverlay()
    paragraphPlainPendingSelection = {
      kind: 'absolute',
      start: 0,
      end: 0,
    }

    paragraphPlainApplying = true
    try {
      const tr = state.tr.replaceWith(from, to, [beforeNode, afterNode])
      const selectionPos = from + beforeNode.nodeSize + 1
      tr.setSelection(TextSelection.create(tr.doc, selectionPos))
      paragraphPlainProfilerMark('dispatch.before', 'enter-split')
      paragraphPlainProfilerRunPhase('dispatch', () => {
        editor.view.dispatch(tr)
      }, 'enter-split')
      paragraphPlainProfilerMark('dispatch.after', 'enter-split')
      pushLog('sourceEdit', `enterKey split (${typeName})`)
    } finally {
      paragraphPlainApplying = false
    }

    // Request scroll follow-through for the re-entry into Paragraph Plain on
    // the freshly created after-block. Without this, splits at the viewport
    // bottom leave the new overlay / caret clipped outside .editor-surface.
    paragraphPlainScrollIntoViewPending = true

    requestAnimationFrame(() => {
      paragraphPlainProfilerRunPhase('enter-reentry.postDispatchRaf', () => {
        if (paragraphPlainActive && paragraphPlainLastView) {
          syncParagraphPlainStateFromView(paragraphPlainLastView)
        }
      })
    })
  }

  function handleParagraphPlainBackspaceAtStart(): void {
    if (!paragraphPlainOverlayEl || !paragraphPlainCurrent || !paragraphPlainLastView) return
    const typeName = paragraphPlainCurrent.typeName
    if (typeName !== 'paragraph' && typeName !== 'heading') return

    const state = editor.state
    const pos = paragraphPlainCurrent.from
    const node = state.doc.nodeAt(pos)
    if (!node) return

    const resolved = state.doc.resolve(pos)
    const index = resolved.index(resolved.depth)
    if (index === 0) return

    const parent = resolved.parent
    const prevNode = parent.child(index - 1)
    if (!prevNode || !prevNode.isTextblock) return

    const prevPos = pos - prevNode.nodeSize
    const prevMarkdown = serializeBlockNode(state, prevNode, prevPos, getLineBreakPolicy())
    const currentMarkdown = paragraphPlainOverlayEl.value
    const mergedMarkdown = prevMarkdown + currentMarkdown

    // Parse merged content as the previous node's type
    const mergedDoc = parseMarkdown(state.schema, mergedMarkdown, getLineBreakPolicy())
    let mergedNode: PMNode
    if (mergedDoc.childCount === 1 && mergedDoc.child(0).type.name === prevNode.type.name) {
      mergedNode = mergedDoc.child(0)
    } else {
      // Fallback: create a paragraph with merged text
      const paragraphType = state.schema.nodes.paragraph
      if (!paragraphType) return
      mergedNode = paragraphType.create(null, mergedMarkdown ? [state.schema.text(mergedMarkdown)] : undefined)
    }

    paragraphPlainCurrent = null
    paragraphPlainActivePos = null

    paragraphPlainPendingSelection = {
      kind: 'absolute',
      start: prevMarkdown.length,
      end: prevMarkdown.length,
    }

    paragraphPlainApplying = true
    try {
      const from = prevPos
      const to = pos + node.nodeSize
      const tr = state.tr.replaceWith(from, to, mergedNode)
      const selectionPos = prevPos + 1
      tr.setSelection(TextSelection.create(tr.doc, selectionPos))
      editor.view.dispatch(tr)
      invalidateParagraphPlainLayoutReuseSnapshots()
      pushLog('sourceEdit', 'backspaceAtStart merge')
    } finally {
      paragraphPlainApplying = false
    }

    requestAnimationFrame(() => {
      if (paragraphPlainActive && paragraphPlainLastView) {
        syncParagraphPlainStateFromView(paragraphPlainLastView)
      }
    })
  }

  function syncParagraphPlainStateFromView(view: EditorView): void {
    paragraphPlainLastView = view
    if (!paragraphPlainActive || paragraphPlainApplying) return
    ensureParagraphPlainOverlay(view)
    const pluginState = paragraphPlainPluginKey.getState(view.state)
    const pos = pluginState?.pos ?? null
    const typeName = pluginState?.typeName ?? null

    if (pos == null || typeName == null) {
      const committed = commitCurrentParagraphPlain(true, { preserveSelection: true })
      if (!committed) return
      hideParagraphPlainOverlay()
      return
    }

    if (
      paragraphPlainActivePos !== pos ||
      paragraphPlainCurrent?.typeName !== typeName ||
      !paragraphPlainCurrent
    ) {
      const hadPriorTarget =
        paragraphPlainCurrent != null || paragraphPlainActivePos != null
      const dirty =
        paragraphPlainOverlayEl != null &&
        paragraphPlainCurrent != null &&
        paragraphPlainOverlayEl.value !== paragraphPlainCurrent.originalMarkdown

      if (!paragraphPlainProfilerHasActiveSession() && hadPriorTarget) {
        paragraphPlainProfilerBeginSession('click-switch', {
          sessionMeta: dirty ? 'dirty' : 'clean',
        })
      }

      paragraphPlainProfilerRunPhase('syncParagraphPlainStateFromView.blockSwitch', () => {
        if (!dirty) {
          rememberParagraphPlainLayoutReuseSnapshot('clean-block-switch')
        }
        const committed = commitCurrentParagraphPlain(true, { preserveSelection: true })
        if (!committed) {
          paragraphPlainProfilerCancelSession('commit-failed-block-switch')
          return
        }
        const freshPlugin = paragraphPlainPluginKey.getState(view.state)
        const freshPos = freshPlugin?.pos ?? null
        const freshType = freshPlugin?.typeName ?? null
        if (freshPos != null && freshType != null) {
          resetParagraphPlainOverlayLayoutCache()
          startParagraphPlain(view, freshPos, freshType, { deferOverlayFocus: true })
          scheduleParagraphPlainOverlayUpdate({
            measure: true,
            endProfileSessionAfterFlush: paragraphPlainProfilerHasActiveSession(),
          })
        } else {
          hideParagraphPlainOverlay()
          paragraphPlainProfilerCancelSession('no-fresh-block')
        }
      })
      return
    }

    // PP-L2: same-block で PM の from/to が不変なら、毎回 schedule は不要。
    // ただし overlay host / 書字モード / block の表示スタイル（テーマ・フォント等）
    // だけが変わると PM は動かずに DOM レイアウトだけ変わるので、cache と live の
    // 不整合を検知したときだけ再配置を許可する（input / composition hot path の
    // PP-L1 は別経路で維持）。
    let positionalChange = false
    if (paragraphPlainCurrent) {
      const node = view.state.doc.nodeAt(pos)
      if (node && node.type.name === paragraphPlainCurrent.typeName) {
        const nextFrom = pos
        const nextTo = pos + node.nodeSize
        positionalChange =
          paragraphPlainCurrent.from !== nextFrom ||
          paragraphPlainCurrent.to !== nextTo
        paragraphPlainCurrent.from = nextFrom
        paragraphPlainCurrent.to = nextTo
      } else {
        positionalChange = true
      }
    } else {
      positionalChange = true
    }

    const overlayWritingMode = resolveParagraphPlainOverlayWritingMode()

    // PP-L5: positionalChange === true では should* が先頭で true を返すため、
    // liveBlockRect / blockLayoutSignature / resolve は不要（無駄な blockRect read を避ける）。
    let liveBlockSignature = ''
    let liveBlockRect: ParagraphPlainOverlayBaseRect | null = null
    if (!positionalChange) {
      const blockEl = paragraphPlainProfilerRunPhase(
        'readParagraphPlainBlockRectRelativeToHost.resolveBlockElement',
        () => resolveBlockElementAtPos(view, pos, typeName),
      )
      if (blockEl && paragraphPlainOverlayHost) {
        liveBlockSignature = computeParagraphPlainBlockLayoutSignature(blockEl)
        liveBlockRect = computeParagraphPlainBlockRectRelativeToHostFromElement(
          blockEl,
          paragraphPlainOverlayHost,
        )
      }
    } else {
      paragraphPlainProfilerMark('pp-l5-skip-same-block-live-block-rect', 'positional-change')
    }

    if (
      shouldParagraphPlainSyncScheduleOverlayUpdate({
        positionalChange,
        cache: paragraphPlainOverlayLayoutCache,
        overlayHost: paragraphPlainOverlayHost,
        overlayWritingMode,
        blockLayoutSignature: liveBlockSignature,
        liveBlockRect,
      })
    ) {
      scheduleParagraphPlainOverlayUpdate()
    }
  }

  function createParagraphPlainPlugin(): Plugin<ParagraphPlainPluginState> {
    return new Plugin<ParagraphPlainPluginState>({
      key: paragraphPlainPluginKey,
      state: {
        init: (_config, state) => {
          const info = findActiveBlockPos(state)
          return { pos: info?.pos ?? null, typeName: info?.typeName ?? null }
        },
        apply: (_tr, _prev, _oldState, state) => {
          const info = findActiveBlockPos(state)
          return { pos: info?.pos ?? null, typeName: info?.typeName ?? null }
        },
      },
      props: {
        decorations: (state) => buildParagraphPlainDecorations(state),
      },
      view: (view) => {
        ensureParagraphPlainOverlay(view)
        syncParagraphPlainStateFromView(view)
        return {
          update: (nextView) => syncParagraphPlainStateFromView(nextView),
          destroy: () => destroyParagraphPlainOverlay(),
        }
      },
    })
  }

  function setMode(enabled: boolean): boolean {
    if (enabled === paragraphPlainActive) return paragraphPlainActive

    if (enabled) {
      if (editor.state && !findActiveBlockPos(editor.state)) {
        pushLog('plainParagraph', 'enable skipped: unsupported block')
        return false
      }
      paragraphPlainActive = true
      paragraphPlainPlugin = createParagraphPlainPlugin()
      editor.registerPlugin(paragraphPlainPlugin)
      emitParagraphPlainModeChange(true)
      pushLog('plainParagraph', 'enabled')
      return true
    }

    // Paragraph Plain 解除時は overlay の Markdown を block 記法として再解釈する。
    // 通常 commit / 隣接 block 移動 / click target preserve からは
    // allowMarkdownBlockReparse を渡さないので影響しない。
    const committed = commitCurrentParagraphPlain(true, {
      allowMarkdownBlockReparse: true,
    })
    if (!committed) {
      // Never trap the editor in Paragraph Plain. If the current block markdown
      // is no longer representable, discard the in-overlay edits and exit.
      commitCurrentParagraphPlain(false)
      pushLog('plainParagraph', 'disable fallback: discarded unresolved block markdown')
    }
    if (paragraphPlainPlugin) {
      editor.unregisterPlugin(paragraphPlainPluginKey)
      paragraphPlainPlugin = null
    }
    destroyParagraphPlainOverlay()
    paragraphPlainScrollIntoViewPending = false
    paragraphPlainActive = false
    emitParagraphPlainModeChange(false)
    pushLog('plainParagraph', 'disabled')
    return false
  }

  function toggleMode(): boolean {
    return setMode(!paragraphPlainActive)
  }

  function isActive(): boolean {
    return paragraphPlainActive
  }

  function commitIfActive(): boolean {
    return commitParagraphPlainIfActive({
      active: paragraphPlainActive,
      commitCurrentParagraphPlain,
    })
  }

  function onModeChange(listener: ParagraphPlainModeListener): () => void {
    paragraphPlainModeListeners.add(listener)
    return () => {
      paragraphPlainModeListeners.delete(listener)
    }
  }

  function destroy(): void {
    setMode(false)
    destroyParagraphPlainOverlay()
    paragraphPlainModeListeners.clear()
  }

  function undoOverlay(): void {
    if (!paragraphPlainActive || !paragraphPlainOverlayEl) return
    paragraphPlainOverlayEl.focus()
    document.execCommand('undo')
    scheduleParagraphPlainOverlayUpdateForReason('undo')
  }

  function redoOverlay(): void {
    if (!paragraphPlainActive || !paragraphPlainOverlayEl) return
    paragraphPlainOverlayEl.focus()
    document.execCommand('redo')
    scheduleParagraphPlainOverlayUpdateForReason('redo')
  }

  function selectAllOverlay(): void {
    if (!paragraphPlainActive || !paragraphPlainOverlayEl) return
    paragraphPlainOverlayEl.focus({ preventScroll: true })
    paragraphPlainOverlayEl.select()
  }

  return {
    setMode,
    toggleMode,
    isActive,
    commitIfActive,
    undoOverlay,
    redoOverlay,
    selectAllOverlay,
    onModeChange,
    destroy,
  }
}
