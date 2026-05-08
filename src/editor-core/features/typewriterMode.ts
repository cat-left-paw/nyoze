import type { EditorView } from '@tiptap/pm/view'
import {
  resolveTypewriterScrollPlan,
  type AxisRect,
  type TypewriterWritingMode,
} from './typewriterScroll'
import {
  resolveTypewriterScrollPastEndDirection,
  shouldEnableTypewriterScrollPastEnd,
} from './typewriterScrollPastEnd'
import {
  TYPEWRITER_JUMP_NAVIGATION_SUPPRESS_MS,
  TYPEWRITER_MANUAL_SCROLL_SUPPRESS_MS,
  TYPEWRITER_POINTER_CLICK_SUPPRESS_MS,
  resolveTypewriterArrowNavigationIntent,
  resolveTypewriterInputIntent,
  type TypewriterFollowIntent,
  type TypewriterJumpNavigationSource,
  shouldRunTypewriterFollowNow,
  shouldScheduleTypewriterFollowOnUpdate,
} from './typewriterSuppression'

type GetComputedStyleLike = (element: Element) => {
  writingMode?: string
}

type RectLike = {
  left: number
  top: number
  width?: number
  height?: number
  right?: number
  bottom?: number
}

type TypewriterScrollHost = HTMLElement & {
  scrollTop: number
  scrollLeft: number
  addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void
  removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void
  getBoundingClientRect: () => RectLike
  appendChild: <T extends Node>(node: T) => T
  removeChild: <T extends Node>(node: T) => T
  setAttribute: (qualifiedName: string, value: string) => void
  removeAttribute: (qualifiedName: string) => void
}

type TypewriterPointerTarget = Pick<
  HTMLElement,
  'addEventListener' | 'removeEventListener' | 'closest' | 'ownerDocument'
>

type TypewriterDocumentTarget = Pick<
  Document,
  'addEventListener' | 'removeEventListener' | 'createElement'
>

type TypewriterViewLike = Pick<EditorView, 'state' | 'coordsAtPos'> & {
  dom: TypewriterPointerTarget
}

type CreateTypewriterModeControllerOptions = {
  view: TypewriterViewLike
  getIsEnabled?: () => boolean
  getIsComposing: () => boolean
  getIsParagraphPlainActive: () => boolean
  getIsSourceModeActive?: () => boolean
  getOffsetRatio?: () => number
  getFollowBandRatio?: () => number
  requestAnimationFrame?: (callback: FrameRequestCallback) => number
  cancelAnimationFrame?: (handle: number) => void
  getNow?: () => number
  getComputedStyle?: GetComputedStyleLike
  manualScrollSuppressMs?: number
  jumpNavigationSuppressMs?: number
  pointerClickSuppressMs?: number
}

type TypewriterModeController = {
  noteKeyboardNavigationIntent: (
    event: Pick<
      KeyboardEvent,
      'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'defaultPrevented'
    >,
  ) => void
  /** Home/Page/outline/search 等のジャンプ直後に follow を短時間止める（Arrow/入力で解除） */
  noteJumpNavigationSuppress: (
    source?: TypewriterJumpNavigationSource,
    durationMs?: number,
  ) => void
  noteBeforeInput: (
    event: Pick<InputEvent, 'inputType' | 'defaultPrevented'>,
  ) => boolean
  syncRuntimeState: () => void
  handleSelectionUpdate: () => boolean
  handleEditorUpdate: (params: { docChanged: boolean }) => boolean
  destroy: () => void
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isScrollHostLike(value: unknown): value is TypewriterScrollHost {
  if (!value || typeof value !== 'object') return false
  const maybe = value as Partial<TypewriterScrollHost>
  return (
    isFiniteNumber(maybe.scrollTop) &&
    isFiniteNumber(maybe.scrollLeft) &&
    typeof maybe.addEventListener === 'function' &&
    typeof maybe.removeEventListener === 'function' &&
    typeof maybe.getBoundingClientRect === 'function'
  )
}

function normalizeRect(rect: RectLike): AxisRect | null {
  if (!isFiniteNumber(rect.left) || !isFiniteNumber(rect.top)) return null
  const width =
    isFiniteNumber(rect.width)
      ? rect.width
      : isFiniteNumber(rect.right)
        ? rect.right - rect.left
        : NaN
  const height =
    isFiniteNumber(rect.height)
      ? rect.height
      : isFiniteNumber(rect.bottom)
        ? rect.bottom - rect.top
        : NaN
  if (!isFiniteNumber(width) || !isFiniteNumber(height)) return null
  if (width <= 0 || height <= 0) return null
  return {
    left: rect.left,
    top: rect.top,
    width,
    height,
  }
}

function normalizeCaretRect(rect: RectLike): AxisRect | null {
  if (!isFiniteNumber(rect.left) || !isFiniteNumber(rect.top)) return null
  const rawWidth =
    isFiniteNumber(rect.width)
      ? rect.width
      : isFiniteNumber(rect.right)
        ? rect.right - rect.left
        : NaN
  const rawHeight =
    isFiniteNumber(rect.height)
      ? rect.height
      : isFiniteNumber(rect.bottom)
        ? rect.bottom - rect.top
        : NaN
  if (!isFiniteNumber(rawWidth) || !isFiniteNumber(rawHeight)) return null
  return {
    left: rect.left,
    top: rect.top,
    width: Math.max(1, rawWidth),
    height: Math.max(1, rawHeight),
  }
}

export function resolveTypewriterWritingMode(
  element: Element,
  getComputedStyle: GetComputedStyleLike = (target) => window.getComputedStyle(target),
): TypewriterWritingMode {
  const writingMode = getComputedStyle(element).writingMode ?? ''
  if (writingMode.startsWith('vertical-lr')) return 'vertical-lr'
  if (writingMode.startsWith('vertical')) return 'vertical-rl'
  return 'horizontal-tb'
}

export function resolveTypewriterScrollHost(
  dom: Pick<HTMLElement, 'closest'>,
): TypewriterScrollHost | null {
  const host = dom.closest('.editor-surface')
  return isScrollHostLike(host) ? host : null
}

export function createTypewriterModeController({
  view,
  getIsEnabled = () => true,
  getIsComposing,
  getIsParagraphPlainActive,
  getIsSourceModeActive = () => false,
  getOffsetRatio = () => 0,
  getFollowBandRatio = () => 0.16,
  requestAnimationFrame = (callback) => window.requestAnimationFrame(callback),
  cancelAnimationFrame = (handle) => window.cancelAnimationFrame(handle),
  getNow = () => Date.now(),
  getComputedStyle = (element) => window.getComputedStyle(element),
  manualScrollSuppressMs = TYPEWRITER_MANUAL_SCROLL_SUPPRESS_MS,
  jumpNavigationSuppressMs = TYPEWRITER_JUMP_NAVIGATION_SUPPRESS_MS,
  pointerClickSuppressMs = TYPEWRITER_POINTER_CLICK_SUPPRESS_MS,
}: CreateTypewriterModeControllerOptions): TypewriterModeController {
  const scrollPastEndAttr = 'data-typewriter-scroll-past-end'
  const scrollPastEndSpacerAttr = 'data-typewriter-scroll-past-end-spacer'
  const scrollPastEndDirectionAttr = 'data-typewriter-scroll-past-end-direction'
  let rafHandle: number | null = null
  let destroyRequested = false
  let pointerSelecting = false
  let manualScrollSuppressedUntil = 0
  let programmaticScrollEventsToIgnore = 0
  let pendingFollowIntent: TypewriterFollowIntent | null = null
  let scrollHost: TypewriterScrollHost | null = null
  let scrollPastEndSpacer: HTMLElement | null = null
  let jumpNavigationSuppressedUntil = 0
  /** primary pointer が view.dom で down したか（document の up で click 系 suppress 判定） */
  let pointerDownOnEditor = false
  let pointerDownSelectionHead: number | null = null
  let pointerClickSuppressRaf: number | null = null

  const documentTarget = view.dom.ownerDocument as TypewriterDocumentTarget | null

  function isManualScrollSuppressed(): boolean {
    return getNow() < manualScrollSuppressedUntil
  }

  function isJumpNavigationSuppressed(): boolean {
    return getNow() < jumpNavigationSuppressedUntil
  }

  function clearJumpNavigationSuppress(): void {
    jumpNavigationSuppressedUntil = 0
  }

  function noteJumpNavigationSuppress(
    _source?: TypewriterJumpNavigationSource,
    durationMs?: number,
  ): void {
    const ms = durationMs ?? jumpNavigationSuppressMs
    jumpNavigationSuppressedUntil = Math.max(
      jumpNavigationSuppressedUntil,
      getNow() + ms,
    )
  }

  function onHostScroll(): void {
    if (programmaticScrollEventsToIgnore > 0) {
      programmaticScrollEventsToIgnore -= 1
      return
    }
    pendingFollowIntent = null
    manualScrollSuppressedUntil = getNow() + manualScrollSuppressMs
  }

  function bindScrollHost(): TypewriterScrollHost | null {
    const resolvedHost = resolveTypewriterScrollHost(view.dom as HTMLElement)
    if (resolvedHost === scrollHost) return scrollHost
    if (scrollHost) {
      teardownScrollPastEndSpacer(scrollHost)
      scrollHost.removeEventListener('scroll', onHostScroll)
    }
    scrollHost = resolvedHost
    if (scrollHost) {
      scrollHost.addEventListener('scroll', onHostScroll)
    }
    return scrollHost
  }

  function schedulePointerClickJumpSuppressIfMoved(headAtDown: number): void {
    if (pointerClickSuppressRaf !== null) {
      cancelAnimationFrame(pointerClickSuppressRaf)
      pointerClickSuppressRaf = null
    }
    pointerClickSuppressRaf = requestAnimationFrame(() => {
      pointerClickSuppressRaf = null
      if (!getIsEnabled()) return
      try {
        if (view.state.selection.head !== headAtDown) {
          noteJumpNavigationSuppress('pointer-click', pointerClickSuppressMs)
        }
      } catch {
        // view detached
      }
    })
  }

  function onPointerDown(event: Event): void {
    const pe = event as PointerEvent | undefined
    if (pe && pe.pointerType === 'mouse' && pe.button !== 0) return
    pendingFollowIntent = null
    pointerSelecting = true
    pointerDownOnEditor = true
    try {
      pointerDownSelectionHead = view.state.selection.head
    } catch {
      pointerDownSelectionHead = null
    }
  }

  function onPointerFinish(): void {
    pointerSelecting = false
    if (pointerDownOnEditor) {
      const headAtDown = pointerDownSelectionHead
      pointerDownOnEditor = false
      pointerDownSelectionHead = null
      if (headAtDown !== null) {
        schedulePointerClickJumpSuppressIfMoved(headAtDown)
      }
    }
  }

  function teardownScrollPastEndSpacer(host: TypewriterScrollHost): void {
    host.removeAttribute(scrollPastEndAttr)
    host.removeAttribute(scrollPastEndDirectionAttr)
    if (scrollPastEndSpacer?.parentElement === host) {
      host.removeChild(scrollPastEndSpacer)
    }
  }

  function ensureScrollPastEndSpacer(
    host: TypewriterScrollHost,
    writingMode: TypewriterWritingMode,
  ): void {
    if (!scrollPastEndSpacer && documentTarget) {
      const spacer = documentTarget.createElement('div')
      spacer.setAttribute(scrollPastEndSpacerAttr, 'true')
      spacer.setAttribute('aria-hidden', 'true')
      scrollPastEndSpacer = spacer
    }
    if (!scrollPastEndSpacer) return
    if (scrollPastEndSpacer.parentElement !== host) {
      host.appendChild(scrollPastEndSpacer)
    }
    host.setAttribute(scrollPastEndAttr, 'true')
    host.setAttribute(
      scrollPastEndDirectionAttr,
      resolveTypewriterScrollPastEndDirection(writingMode),
    )
  }

  function syncRuntimeState(): void {
    const host = bindScrollHost()
    if (!host) return
    const writingMode = resolveTypewriterWritingMode(
      view.dom as unknown as Element,
      getComputedStyle,
    )
    if (
      !shouldEnableTypewriterScrollPastEnd({
        enabled: getIsEnabled(),
        isParagraphPlainActive: getIsParagraphPlainActive(),
        isSourceModeActive: getIsSourceModeActive(),
      })
    ) {
      teardownScrollPastEndSpacer(host)
      return
    }
    ensureScrollPastEndSpacer(host, writingMode)
  }

  function noteKeyboardNavigationIntent(
    event: Pick<
      KeyboardEvent,
      'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'defaultPrevented'
    >,
  ): void {
    const arrowIntent = resolveTypewriterArrowNavigationIntent({
      key: event.key,
      selectionEmpty: view.state.selection.empty,
      isComposing: getIsComposing(),
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      defaultPrevented: event.defaultPrevented,
    })
    if (arrowIntent !== null) {
      clearJumpNavigationSuppress()
    }
    pendingFollowIntent = arrowIntent
  }

  function scheduleFollow({
    docChanged,
    followIntent,
  }: {
    docChanged: boolean
    followIntent: TypewriterFollowIntent | null
  }): boolean {
    syncRuntimeState()
    if (
      !shouldScheduleTypewriterFollowOnUpdate({
        enabled: getIsEnabled(),
        docChanged,
        followIntent,
        selectionEmpty: view.state.selection.empty,
        isParagraphPlainActive: getIsParagraphPlainActive(),
        isSourceModeActive: getIsSourceModeActive(),
        isPointerSelecting: pointerSelecting,
        isManualScrollSuppressed: isManualScrollSuppressed(),
        isJumpNavigationSuppressed: isJumpNavigationSuppressed(),
      })
    ) {
      return false
    }

    if (rafHandle !== null) return true
    rafHandle = requestAnimationFrame(() => {
      runFollow()
    })
    return true
  }

  function noteBeforeInput(
    event: Pick<InputEvent, 'inputType' | 'defaultPrevented'>,
  ): boolean {
    const followIntent = resolveTypewriterInputIntent({
      inputType: event.inputType,
      defaultPrevented: event.defaultPrevented,
    })
    if (followIntent !== null) {
      clearJumpNavigationSuppress()
    }
    pendingFollowIntent = followIntent
    const scheduled = scheduleFollow({
      docChanged: false,
      followIntent: pendingFollowIntent,
    })
    pendingFollowIntent = null
    return scheduled
  }

  function handleSelectionUpdate(): boolean {
    if (pendingFollowIntent !== 'arrow-navigation') {
      return false
    }
    const followIntent = pendingFollowIntent
    pendingFollowIntent = null
    return scheduleFollow({
      docChanged: false,
      followIntent,
    })
  }

  function runFollow(): void {
    rafHandle = null
    if (destroyRequested) return

    syncRuntimeState()
    const host = scrollHost
    if (!host) return

    const selection = view.state.selection
    if (
      !shouldRunTypewriterFollowNow({
        enabled: getIsEnabled(),
        selectionEmpty: selection.empty,
        isParagraphPlainActive: getIsParagraphPlainActive(),
        isSourceModeActive: getIsSourceModeActive(),
        isPointerSelecting: pointerSelecting,
        isManualScrollSuppressed: isManualScrollSuppressed(),
        isJumpNavigationSuppressed: isJumpNavigationSuppressed(),
      })
    ) {
      return
    }

    const viewportRect = normalizeRect(host.getBoundingClientRect())
    if (!viewportRect) return

    let caretCoords: RectLike
    try {
      caretCoords = view.coordsAtPos(selection.head)
    } catch {
      return
    }

    const caretRect = normalizeCaretRect(caretCoords)
    if (!caretRect) return

    const writingMode = resolveTypewriterWritingMode(
      view.dom as unknown as Element,
      getComputedStyle,
    )
    const plan = resolveTypewriterScrollPlan({
      viewportRect,
      caretRect,
      writingMode,
      offsetRatio: getOffsetRatio(),
      followBandRatio: getFollowBandRatio(),
    })
    if (!plan || plan.scrollDelta === 0) return

    programmaticScrollEventsToIgnore += 1
    if (plan.axis === 'y') {
      host.scrollTop += plan.scrollDelta
    } else {
      host.scrollLeft += plan.scrollDelta
    }
  }

  function handleEditorUpdate({ docChanged }: { docChanged: boolean }): boolean {
    const followIntent =
      pendingFollowIntent === 'arrow-navigation' ? null : pendingFollowIntent
    pendingFollowIntent = null
    return scheduleFollow({
      docChanged,
      followIntent,
    })
  }

  bindScrollHost()
  syncRuntimeState()
  view.dom.addEventListener('pointerdown', onPointerDown as EventListener)
  documentTarget?.addEventListener('pointerup', onPointerFinish)
  documentTarget?.addEventListener('pointercancel', onPointerFinish)

  return {
    noteKeyboardNavigationIntent,
    noteJumpNavigationSuppress,
    noteBeforeInput,
    syncRuntimeState,
    handleSelectionUpdate,
    handleEditorUpdate,
    destroy() {
      destroyRequested = true
      pendingFollowIntent = null
      jumpNavigationSuppressedUntil = 0
      pointerDownOnEditor = false
      pointerDownSelectionHead = null
      if (pointerClickSuppressRaf !== null) {
        cancelAnimationFrame(pointerClickSuppressRaf)
        pointerClickSuppressRaf = null
      }
      if (rafHandle !== null) {
        cancelAnimationFrame(rafHandle)
        rafHandle = null
      }
      if (scrollHost) {
        teardownScrollPastEndSpacer(scrollHost)
        scrollHost.removeEventListener('scroll', onHostScroll)
        scrollHost = null
      }
      view.dom.removeEventListener('pointerdown', onPointerDown as EventListener)
      documentTarget?.removeEventListener('pointerup', onPointerFinish)
      documentTarget?.removeEventListener('pointercancel', onPointerFinish)
    },
  }
}
