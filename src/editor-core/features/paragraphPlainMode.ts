import { Editor } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
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
  parseReplacementNode,
  resolveBlockElementAtPos,
  serializeBlockNode,
} from './paragraphSource'
import {
  shouldRequestParagraphPlainOverlayMeasure,
} from './paragraphPlainOverlayMeasure'
import type {
  ParagraphPlainOverlayMeasureReason,
} from './paragraphPlainOverlayMeasure'
import { shouldBlockShiftEnterInParagraphPlain } from './lineBreakGuards'

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
  activeBlockKey: string | null
  hostIdentity: unknown
}
type ResolveSplitBeforeNodeParams = {
  state: EditorState
  typeName: string
  currentNode: PMNode
  beforeText: string
  lineBreakPolicy: LineBreakPolicy
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
    activeBlockKey: null,
    hostIdentity: null,
  }
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
}: ResolveSplitBeforeNodeParams): PMNode | null {
  const paragraphType = state.schema.nodes.paragraph
  if (!paragraphType) return null

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
}

export function createParagraphPlainModeController(
  options: CreateParagraphPlainModeControllerOptions,
): ParagraphPlainModeController {
  const { editor, getLineBreakPolicy, pushLog } = options

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
  let paragraphPlainResizeHandler: (() => void) | null = null
  let paragraphPlainPendingSelection: { start: number; end: number } | null = null
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
  // CSS variable name set on the overlay host (outside ProseMirror's DOM)
  // to avoid triggering ProseMirror's MutationObserver infinite loop.
  const PP_RESERVED_BLOCK_SIZE_VAR = '--pp-reserved-block-size'

  function buildParagraphPlainActiveBlockKey(
    pos: number | null,
    typeName: string | null,
  ): string | null {
    if (pos == null || typeName == null) return null
    return `${typeName}:${pos}`
  }

  function resetParagraphPlainOverlayLayoutCache(): void {
    paragraphPlainOverlayLayoutCache = createEmptyParagraphPlainOverlayLayoutCache()
    paragraphPlainLastOverlayMeasureAt = null
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
    cancelScheduledParagraphPlainOverlayUpdate()
    paragraphPlainOverlayHost?.style.removeProperty(PP_RESERVED_BLOCK_SIZE_VAR)
    if (!paragraphPlainOverlayEl) return
    paragraphPlainOverlayEl.style.display = 'none'
    resetParagraphPlainOverlayLayoutCache()
  }

  function destroyParagraphPlainOverlay(): void {
    cancelScheduledParagraphPlainOverlayUpdate()
    paragraphPlainOverlayHost?.style.removeProperty(PP_RESERVED_BLOCK_SIZE_VAR)
    if (paragraphPlainScrollSource && paragraphPlainScrollHandler) {
      paragraphPlainScrollSource.removeEventListener('scroll', paragraphPlainScrollHandler)
    }
    if (paragraphPlainResizeHandler) {
      window.removeEventListener('resize', paragraphPlainResizeHandler)
    }
    paragraphPlainScrollSource = null
    paragraphPlainScrollHandler = null
    paragraphPlainResizeHandler = null

    if (!paragraphPlainOverlayEl) return
    paragraphPlainOverlayEl.remove()
    paragraphPlainOverlayEl = null
    paragraphPlainOverlayHost = null
    resetParagraphPlainOverlayLayoutCache()
  }

  function ensureParagraphPlainOverlay(view: EditorView): void {
    const host = (view.dom.closest('.editor-surface') ??
      view.dom.parentElement ??
      view.dom) as HTMLElement
    paragraphPlainOverlayHost = host
    paragraphPlainLastView = view

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
      if (paragraphPlainResizeHandler) {
        window.removeEventListener('resize', paragraphPlainResizeHandler)
      }
      // The visible editor scrolls on `.editor-surface` (the host), not on `.ProseMirror`.
      // Listening to the wrong node leaves the overlay stranded while the document moves.
      paragraphPlainScrollSource = host
      paragraphPlainScrollHandler = () => {
        if (!paragraphPlainLastView || !paragraphPlainActive) return
        scheduleParagraphPlainOverlayUpdateForReason('scroll')
      }
      paragraphPlainResizeHandler = () => {
        if (!paragraphPlainLastView || !paragraphPlainActive) return
        scheduleParagraphPlainOverlayUpdateForReason('resize')
      }
      paragraphPlainScrollSource.addEventListener('scroll', paragraphPlainScrollHandler)
      window.addEventListener('resize', paragraphPlainResizeHandler)
    }

    if (paragraphPlainOverlayEl) {
      if (paragraphPlainOverlayEl.parentElement !== host) {
        paragraphPlainOverlayEl.remove()
        host.appendChild(paragraphPlainOverlayEl)
      }
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
  }

  function scheduleParagraphPlainOverlayUpdate(options?: {
    measure?: boolean
    deferTextMeasure?: boolean
  }): void {
    if (!paragraphPlainActive || !paragraphPlainLastView || !paragraphPlainOverlayEl) return
    paragraphPlainOverlayPending.needsPosition = true
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
  }

  function scheduleParagraphPlainOverlayUpdateForReason(
    reason: ParagraphPlainOverlayMeasureReason,
  ): void {
    const shouldMeasure = shouldRequestParagraphPlainOverlayMeasure({
      reason,
      isComposing: paragraphPlainComposing,
      lastMeasuredAt: paragraphPlainLastOverlayMeasureAt,
      now: getParagraphPlainOverlayNow(),
    })
    scheduleParagraphPlainOverlayUpdate(
      shouldMeasure
        ? { measure: true }
        : reason === 'scroll' ||
            (paragraphPlainComposing &&
              (reason === 'input' || reason === 'compositionupdate'))
          ? { deferTextMeasure: true }
          : undefined,
    )
  }

  function resolveParagraphPlainOverlayWritingMode(): string {
    if (!paragraphPlainOverlayEl) return ''
    return (
      paragraphPlainOverlayEl.style.writingMode ||
      getComputedStyle(paragraphPlainOverlayEl).writingMode ||
      ''
    )
  }

  function captureParagraphPlainBaseRect(
    view: EditorView,
    pos: number,
    typeName: string,
  ): ParagraphPlainOverlayBaseRect | null {
    if (!paragraphPlainOverlayHost) return null
    const blockElement = resolveBlockElementAtPos(view, pos, typeName)
    if (!blockElement) return null

    // Temporarily clear reserved space (via CSS variable on host, outside PM DOM)
    // so getBoundingClientRect returns the block's natural size.
    paragraphPlainOverlayHost.style.setProperty(PP_RESERVED_BLOCK_SIZE_VAR, 'auto')

    const rect = blockElement.getBoundingClientRect()
    const hostRect = paragraphPlainOverlayHost.getBoundingClientRect()
    const top = rect.top - hostRect.top + paragraphPlainOverlayHost.scrollTop
    const left = rect.left - hostRect.left + paragraphPlainOverlayHost.scrollLeft
    const baseWidth = Math.max(1, rect.width)
    const baseHeight = Math.max(1, rect.height)

    return { top, left, width: baseWidth, height: baseHeight }
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
  ): { baseRect: ParagraphPlainOverlayBaseRect; writingMode: string } | null {
    if (!paragraphPlainOverlayEl || !paragraphPlainOverlayHost) return null
    const baseRect = captureParagraphPlainBaseRect(view, pos, typeName)
    if (!baseRect) {
      hideParagraphPlainOverlay()
      return null
    }

    const writingMode = resolveParagraphPlainOverlayWritingMode()
    const nextWidth = paragraphPlainOverlayLayoutCache.measuredWidth ?? baseRect.width
    const nextHeight = paragraphPlainOverlayLayoutCache.measuredHeight ?? baseRect.height

    applyParagraphPlainOverlayPlacement({
      baseRect,
      width: nextWidth,
      height: nextHeight,
      writingMode,
    })

    if (paragraphPlainOverlayLayoutCache.reservedSize != null) {
      paragraphPlainOverlayHost.style.setProperty(
        PP_RESERVED_BLOCK_SIZE_VAR,
        `${paragraphPlainOverlayLayoutCache.reservedSize}px`,
      )
    } else {
      paragraphPlainOverlayHost.style.setProperty(PP_RESERVED_BLOCK_SIZE_VAR, 'auto')
    }

    paragraphPlainOverlayLayoutCache = {
      ...paragraphPlainOverlayLayoutCache,
      baseRect,
    }
    return { baseRect, writingMode }
  }

  function adjustOverlaySizeToContent(params: {
    baseRect: ParagraphPlainOverlayBaseRect
    writingMode: string
    measureRequested: boolean
    deferTextMeasure: boolean
    activeBlockKey: string | null
  }): void {
    if (!paragraphPlainOverlayEl || !paragraphPlainOverlayHost) return
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
      return
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
    paragraphPlainOverlayHost.style.setProperty(
      PP_RESERVED_BLOCK_SIZE_VAR,
      `${reservedSize}px`,
    )

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
      activeBlockKey,
      hostIdentity: paragraphPlainOverlayHost,
    }
    paragraphPlainLastOverlayMeasureAt = getParagraphPlainOverlayNow()
  }

  function flushParagraphPlainOverlayUpdate(): void {
    if (!paragraphPlainActive || paragraphPlainApplying || !paragraphPlainLastView) return

    const pending = paragraphPlainOverlayPending
    paragraphPlainOverlayPending = {
      needsPosition: false,
      needsMeasure: false,
      deferTextMeasure: false,
    }
    if (!pending.needsPosition) return

    const pluginState = paragraphPlainPluginKey.getState(paragraphPlainLastView.state)
    const pos = pluginState?.pos ?? null
    const typeName = pluginState?.typeName ?? null
    if (pos == null || typeName == null) {
      hideParagraphPlainOverlay()
      return
    }

    const positioned = positionParagraphPlainOverlay(paragraphPlainLastView, pos, typeName)
    if (!positioned) return

    adjustOverlaySizeToContent({
      baseRect: positioned.baseRect,
      writingMode: positioned.writingMode,
      measureRequested: pending.needsMeasure,
      deferTextMeasure: pending.deferTextMeasure && !pending.needsMeasure,
      activeBlockKey: buildParagraphPlainActiveBlockKey(pos, typeName),
    })
  }

  function startParagraphPlain(view: EditorView, pos: number, typeName: string): void {
    const node = view.state.doc.nodeAt(pos)
    if (!node || node.type.name !== typeName) {
      paragraphPlainCurrent = null
      paragraphPlainActivePos = null
      hideParagraphPlainOverlay()
      return
    }

    const markdown = serializeBlockNode(view.state, node, pos, getLineBreakPolicy())
    paragraphPlainCurrent = {
      from: pos,
      to: pos + node.nodeSize,
      typeName,
      originalMarkdown: markdown,
    }
    paragraphPlainActivePos = pos

    // When a preceding action (currently only Enter split) requested scroll
    // follow-through, nudge the scroll host so the newly active block is
    // inside the viewport before we position the overlay against its rect.
    // Done before overlay focus so focus({ preventScroll: true }) still holds.
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

    if (!paragraphPlainOverlayEl) return
    paragraphPlainOverlayEl.value = markdown
    paragraphPlainOverlayEl.style.display = ''
    paragraphPlainOverlayEl.focus({ preventScroll: true })
    if (paragraphPlainPendingSelection) {
      const len = markdown.length
      const start = Math.min(paragraphPlainPendingSelection.start, len)
      const end = Math.min(paragraphPlainPendingSelection.end, len)
      paragraphPlainOverlayEl.setSelectionRange(start, end)
      paragraphPlainPendingSelection = null
    } else {
      paragraphPlainOverlayEl.setSelectionRange(markdown.length, markdown.length)
    }
  }

  function replaceBlockNodeInternal(
    markdown: string,
    context: ParagraphPlainContext,
    options?: { preserveSelection?: boolean },
  ): boolean {
    const nextNode = parseReplacementNode(
      editor.state,
      markdown,
      context.typeName,
      getLineBreakPolicy(),
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
      const nextCursor = Math.max(1, Math.min(tr.doc.content.size, mappedFrom + 1))
      tr.setSelection(TextSelection.create(tr.doc, nextCursor))
    }
    editor.view.dispatch(tr)
    pushLog('sourceEdit', `replaceBlock applied (${context.typeName})`)
    return true
  }

  function commitCurrentParagraphPlain(
    save: boolean,
    options?: { preserveSelection?: boolean },
  ): boolean {
    if (!paragraphPlainCurrent) {
      paragraphPlainActivePos = null
      return true
    }

    if (save && paragraphPlainOverlayEl) {
      const nextMarkdown = paragraphPlainOverlayEl.value
      if (nextMarkdown !== paragraphPlainCurrent.originalMarkdown) {
        paragraphPlainApplying = true
        try {
          const applied = replaceBlockNodeInternal(
            nextMarkdown,
            paragraphPlainCurrent,
            options,
          )
          if (!applied) {
            pushLog('sourceEdit', `replaceBlock kept editing (${paragraphPlainCurrent.typeName})`)
            return false
          }
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
      // No-target boundary arrow: treat as no-op inside Paragraph Plain so the
      // key doesn't fall through to native textarea navigation/newline.
      return true
    }

    const committed = commitCurrentParagraphPlain(true)
    if (!committed) return false

    const state = editor.state
    const target = findAdjacentPlainBlock(state, currentPos, direction)
    if (!target) {
      // Commit changed the document in a way that removed the adjacent target.
      // Recover overlay state from the fresh view instead of orphaning it.
      if (paragraphPlainLastView) {
        syncParagraphPlainStateFromView(paragraphPlainLastView)
      }
      return true
    }

    const targetMarkdown = serializeBlockNode(state, target.node, target.pos, getLineBreakPolicy())
    const offset = direction === 'prev' ? targetMarkdown.length : 0
    paragraphPlainPendingSelection = { start: offset, end: offset }

    const selectionPos = direction === 'prev'
      ? target.pos + target.node.content.size
      : target.pos + 1
    const tr = state.tr.setSelection(TextSelection.create(state.doc, selectionPos))
    editor.view.dispatch(tr)
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

    const beforeNode = resolveParagraphPlainSplitBeforeNode({
      state,
      typeName,
      currentNode: node,
      beforeText,
      lineBreakPolicy: getLineBreakPolicy(),
    })
    if (!beforeNode) return

    // Build after node (always paragraph)
    let afterNode: PMNode
    // Strip heading prefix if present (user types "## foo|bar", after should be "bar" not "## bar")
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
      const afterDoc = parseMarkdown(state.schema, afterContent, getLineBreakPolicy())
      if (afterDoc.childCount === 1 && afterDoc.child(0).type.name === 'paragraph') {
        afterNode = afterDoc.child(0)
      } else {
        afterNode = paragraphType.create(null, afterContent ? [state.schema.text(afterContent)] : undefined)
      }
    }

    const from = paragraphPlainCurrent.from
    const to = paragraphPlainCurrent.to

    paragraphPlainCurrent = null
    paragraphPlainActivePos = null
    hideParagraphPlainOverlay()

    paragraphPlainApplying = true
    try {
      const tr = state.tr.replaceWith(from, to, [beforeNode, afterNode])
      const selectionPos = from + beforeNode.nodeSize + 1
      tr.setSelection(TextSelection.create(tr.doc, selectionPos))
      editor.view.dispatch(tr)
      pushLog('sourceEdit', `enterKey split (${typeName})`)
    } finally {
      paragraphPlainApplying = false
    }

    // Request scroll follow-through for the re-entry into Paragraph Plain on
    // the freshly created after-block. Without this, splits at the viewport
    // bottom leave the new overlay / caret clipped outside .editor-surface.
    paragraphPlainScrollIntoViewPending = true

    requestAnimationFrame(() => {
      if (paragraphPlainActive && paragraphPlainLastView) {
        syncParagraphPlainStateFromView(paragraphPlainLastView)
      }
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

    paragraphPlainPendingSelection = { start: prevMarkdown.length, end: prevMarkdown.length }

    paragraphPlainApplying = true
    try {
      const from = prevPos
      const to = pos + node.nodeSize
      const tr = state.tr.replaceWith(from, to, mergedNode)
      const selectionPos = prevPos + 1
      tr.setSelection(TextSelection.create(tr.doc, selectionPos))
      editor.view.dispatch(tr)
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
      // Preserve the user's click selection so it isn't overwritten by the
      // commit transaction.  After commit, re-read the plugin state because
      // the document may have changed (e.g. different node size) and the
      // pre-commit `pos` could be stale.
      const committed = commitCurrentParagraphPlain(true, { preserveSelection: true })
      if (!committed) return
      const freshPlugin = paragraphPlainPluginKey.getState(view.state)
      const freshPos = freshPlugin?.pos ?? null
      const freshType = freshPlugin?.typeName ?? null
      if (freshPos != null && freshType != null) {
        resetParagraphPlainOverlayLayoutCache()
        startParagraphPlain(view, freshPos, freshType)
        scheduleParagraphPlainOverlayUpdate({ measure: true })
      } else {
        hideParagraphPlainOverlay()
      }
      return
    }

    if (paragraphPlainCurrent) {
      const node = view.state.doc.nodeAt(pos)
      if (node && node.type.name === paragraphPlainCurrent.typeName) {
        paragraphPlainCurrent.from = pos
        paragraphPlainCurrent.to = pos + node.nodeSize
      }
    }

    scheduleParagraphPlainOverlayUpdate()
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

    const committed = commitCurrentParagraphPlain(true)
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
