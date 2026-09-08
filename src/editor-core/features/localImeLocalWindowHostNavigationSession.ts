/**
 * LOCAL-WINDOW-LINEAXIS-NAV1 / LOCAL-WINDOW-HOSTNAV-KEYS1 —
 * Local Window close後のhost navigation session。
 *
 * 最初のwriting-mode line-axis Arrow / Home / End / PageUp / PageDownのownerはcontrollerが
 * 同期決定する。このmoduleは、close前にAUTOARM holdを取得し、以後の物理navigation key
 * keyupとoptional rearm debounceだけを追跡する。session中のnavigation keyは8種で、
 * 続くkeyはsyntheticに再配送せず通常host PM経路へ任せる。
 * timerはownership、操作完了、selection paint、scroll、原稿保全の証拠には使わない。
 * host command意味論（Home/Endの2段階、Pageのscroll）はここへ持ち込まない。
 */

export const LOCAL_WINDOW_HOST_NAVIGATION_REARM_DELAY_MS = 250

export type LocalWindowNavigationKey =
  | 'ArrowUp'
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'Home'
  | 'End'
  | 'PageUp'
  | 'PageDown'

/** controller の writing-mode mapping が通常時の開始可能 key を一意に絞る。 */
export type LocalWindowNavigationSessionStartKey = LocalWindowNavigationKey

export type LocalImeLocalWindowHostNavigationPhase =
  | 'inactive'
  | 'provisional'
  | 'navigating'
  | 'debouncing'
  | 'pointer-terminal-hold'
  | 'destroyed'

export type LocalImeLocalWindowHostNavigationCancellationReason =
  | 'initial-close-failed'
  | 'initial-adapter-failed'
  | 'dirty-close-proof-failed'
  | 'external-content-change'
  | 'non-navigation-keydown'
  | 'modified-navigation-key'
  | 'untrusted-key'
  | 'beforeinput'
  | 'compositionstart'
  | 'pointerdown'
  | 'document-action'
  | 'document-change'
  | 'identity-change'
  | 'generation-change'
  | 'window-blur'
  | 'visibility-change'
  | 'explicit-stop'
  | 'lifecycle-cancel'
  | 'force-reset'
  | 'recovery'
  | 'discard'
  | 'destroy'

export type LocalImeLocalWindowHostNavigationToken = {
  readonly sessionId: number
  readonly documentIdentity: string
  readonly controllerGeneration: number
}

export type LocalImeLocalWindowHostNavigationInitialResult = {
  readonly key: LocalWindowNavigationSessionStartKey
  readonly closeContentTransactionCount: 0 | 1
  readonly caretRestoreTransactionCount: 0 | 1
  readonly adapterCalls: 1
  readonly adapterTransactionCount: 0 | 1
  readonly moved: boolean
  /** bare Arrow だけの DOM caret 復元 proof。Home / End / Page は対象外の `null`。 */
  readonly domSelectionRestored: boolean | null
  /** PageUp / PageDown の scroll 実績。Arrow / Home / End は `null`。 */
  readonly scrollMoved?: boolean | null
}

export type LocalImeLocalWindowHostNavigationDiagnostics = {
  readonly phase: LocalImeLocalWindowHostNavigationPhase
  readonly active: boolean
  readonly pressedNavigationKeys: readonly LocalWindowNavigationKey[]
  readonly sessionStartCount: number
  readonly sessionCancelCount: number
  readonly sessionCompleteCount: number
  readonly keydownCount: number
  readonly keyupCount: number
  readonly timerScheduledCount: number
  readonly timerCancelledCount: number
  readonly timerFiredCount: number
  readonly listenerCount: number
  readonly autoArmHoldCount: number
  readonly stableCandidateHeld: boolean
  readonly freshAcquisitionRequestCount: number
  readonly freshAcquisitionAttemptCount: number
  readonly freshAcquisitionSuccessCount: number
  readonly hostContentCancellationCount: number
  readonly lastHostContentRootDocChanged: boolean | null
  readonly lastHostContentAppendedDocChangedCount: number | null
  readonly localWindowStartCount: number
  readonly unexpectedStartCount: number
  readonly lastCancellationReason: LocalImeLocalWindowHostNavigationCancellationReason | null
  readonly firstNavigationKey: LocalWindowNavigationSessionStartKey | null
  readonly firstCloseContentDelta: 0 | 1 | null
  readonly firstCaretRestoreTransactionCount: 0 | 1 | null
  readonly firstAdapterCallCount: 0 | 1
  readonly firstAdapterTransactionCount: 0 | 1 | null
  readonly firstAdapterMoved: boolean | null
  readonly firstAdapterNoop: boolean | null
  readonly firstAdapterDomSelectionRestored: boolean | null
  readonly firstAdapterScrollMoved: boolean | null
}

export type LocalImeLocalWindowHostNavigationSession = {
  beginInitialKeyDown: (input: {
    key: LocalWindowNavigationSessionStartKey
    documentIdentity: string
    controllerGeneration: number
  }) =>
    | { readonly ok: true; readonly token: LocalImeLocalWindowHostNavigationToken }
    | { readonly ok: false; readonly reason: 'destroyed' | 'session-active' | 'autoarm-hold-rejected' }
  confirmInitialNavigation: (
    token: LocalImeLocalWindowHostNavigationToken,
    result: LocalImeLocalWindowHostNavigationInitialResult,
  ) => boolean
  cancel: (reason: LocalImeLocalWindowHostNavigationCancellationReason) => void
  cancelForHostContentChange: (notice?: {
    readonly rootDocChanged: boolean
    readonly appendedDocChangedCount: number
  }) => void
  noteLocalWindowStart: () => void
  blocksLocalWindowStart: () => boolean
  isProvisional: (token?: LocalImeLocalWindowHostNavigationToken) => boolean
  diagnostics: () => LocalImeLocalWindowHostNavigationDiagnostics
  destroy: () => void
}

type TimerHandle = ReturnType<typeof setTimeout>
type Scheduler = {
  setTimeout: (callback: () => void, delayMs: number) => TimerHandle
  clearTimeout: (handle: TimerHandle) => void
}

type EventDocument = Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>
type EventWindow = Pick<Window, 'addEventListener' | 'removeEventListener'>

const NAVIGATION_KEYS: readonly LocalWindowNavigationKey[] = [
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]

const isNavigationKey = (key: string): key is LocalWindowNavigationKey =>
  NAVIGATION_KEYS.includes(key as LocalWindowNavigationKey)

const sameToken = (
  left: LocalImeLocalWindowHostNavigationToken | null,
  right: LocalImeLocalWindowHostNavigationToken,
): boolean =>
  left !== null &&
  left.sessionId === right.sessionId &&
  left.documentIdentity === right.documentIdentity &&
  left.controllerGeneration === right.controllerGeneration

export function createLocalImeLocalWindowHostNavigationSession(options: {
  document: EventDocument
  window: EventWindow
  getCurrentIdentity: () => string
  getCurrentControllerGeneration: () => number
  beginAutoArmHold: (token: LocalImeLocalWindowHostNavigationToken) => boolean
  cancelAutoArmHold: (
    token: LocalImeLocalWindowHostNavigationToken,
    reason: LocalImeLocalWindowHostNavigationCancellationReason,
  ) => void
  completeAutoArmHold: (token: LocalImeLocalWindowHostNavigationToken) => boolean
  readAutoArmDiagnostics: () => {
    navigationHoldActive: boolean
    navigationStableCandidateHeld: boolean
    attemptCount: number
    successCount: number
  }
  scheduler?: Scheduler
  delayMs?: number
}): LocalImeLocalWindowHostNavigationSession {
  const scheduler: Scheduler = options.scheduler ?? {
    setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimeout: (handle) => clearTimeout(handle),
  }
  const delayMs = options.delayMs ?? LOCAL_WINDOW_HOST_NAVIGATION_REARM_DELAY_MS
  let phase: LocalImeLocalWindowHostNavigationPhase = 'inactive'
  let token: LocalImeLocalWindowHostNavigationToken | null = null
  let nextSessionId = 1
  const pressed = new Set<LocalWindowNavigationKey>()
  let pointerId: number | null = null
  let timer: TimerHandle | null = null
  let listenersAttached = false
  let sessionStartCount = 0
  let sessionCancelCount = 0
  let sessionCompleteCount = 0
  let keydownCount = 0
  let keyupCount = 0
  let timerScheduledCount = 0
  let timerCancelledCount = 0
  let timerFiredCount = 0
  let autoArmHoldCount = 0
  let freshAcquisitionRequestCount = 0
  let hostContentCancellationCount = 0
  let lastHostContentRootDocChanged: boolean | null = null
  let lastHostContentAppendedDocChangedCount: number | null = null
  let localWindowStartCount = 0
  let unexpectedStartCount = 0
  let lastCancellationReason: LocalImeLocalWindowHostNavigationCancellationReason | null = null
  let firstNavigationKey: LocalWindowNavigationSessionStartKey | null = null
  let firstCloseContentDelta: 0 | 1 | null = null
  let firstCaretRestoreTransactionCount: 0 | 1 | null = null
  let firstAdapterCallCount: 0 | 1 = 0
  let firstAdapterTransactionCount: 0 | 1 | null = null
  let firstAdapterMoved: boolean | null = null
  let firstAdapterNoop: boolean | null = null
  let firstAdapterDomSelectionRestored: boolean | null = null
  let firstAdapterScrollMoved: boolean | null = null

  const cancelTimer = () => {
    if (timer === null) return
    scheduler.clearTimeout(timer)
    timer = null
    timerCancelledCount += 1
  }

  const detachListeners = () => {
    if (!listenersAttached) return
    listenersAttached = false
    options.document.removeEventListener('keydown', onDocumentKeyDown, true)
    options.document.removeEventListener('keyup', onDocumentKeyUp, true)
    options.document.removeEventListener('beforeinput', onBeforeInput, true)
    options.document.removeEventListener('compositionstart', onCompositionStart, true)
    options.document.removeEventListener('pointerdown', onPointerDown, true)
    options.document.removeEventListener('pointerup', onPointerTerminal, true)
    options.document.removeEventListener('pointercancel', onPointerTerminal, true)
    options.document.removeEventListener('visibilitychange', onVisibilityChange, true)
    options.window.removeEventListener('blur', onWindowBlur, true)
  }

  const currentTokenIsValid = (): boolean => {
    if (!token) return false
    if (options.getCurrentIdentity() !== token.documentIdentity) {
      cancelSession('identity-change')
      return false
    }
    if (options.getCurrentControllerGeneration() !== token.controllerGeneration) {
      cancelSession('generation-change')
      return false
    }
    return true
  }

  const clearLocalState = () => {
    cancelTimer()
    pressed.clear()
    pointerId = null
    detachListeners()
  }

  const cancelSession = (
    reason: LocalImeLocalWindowHostNavigationCancellationReason,
    releaseHold = true,
  ) => {
    if (phase === 'inactive' || phase === 'destroyed') return
    const cancelledToken = token
    clearLocalState()
    sessionCancelCount += 1
    lastCancellationReason = reason
    phase = 'inactive'
    token = null
    if (releaseHold && cancelledToken) options.cancelAutoArmHold(cancelledToken, reason)
  }

  const complete = () => {
    if (!token || phase !== 'debouncing' || !currentTokenIsValid()) return
    const completedToken = token
    timer = null
    timerFiredCount += 1
    freshAcquisitionRequestCount += 1
    clearLocalState()
    phase = 'inactive'
    token = null
    sessionCompleteCount += 1
    options.completeAutoArmHold(completedToken)
  }

  const scheduleCompletion = () => {
    if (!token || timer !== null || pressed.size !== 0 || phase === 'destroyed') return
    phase = 'debouncing'
    timerScheduledCount += 1
    timer = scheduler.setTimeout(complete, delayMs)
  }

  function onDocumentKeyDown(event: KeyboardEvent) {
    if (phase !== 'navigating' && phase !== 'debouncing') return
    if (!currentTokenIsValid()) return
    if (!event.isTrusted) {
      cancelSession('untrusted-key')
      return
    }
    const bare =
      !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey &&
      !event.isComposing && event.keyCode !== 229
    if (!isNavigationKey(event.key)) {
      cancelSession('non-navigation-keydown')
      return
    }
    if (!bare) {
      cancelSession('modified-navigation-key')
      return
    }
    keydownCount += 1
    if (phase === 'debouncing') cancelTimer()
    phase = 'navigating'
    pressed.add(event.key)
  }

  function onDocumentKeyUp(event: KeyboardEvent) {
    if (phase !== 'navigating' || !isNavigationKey(event.key)) return
    // `keyup`は物理navigation key解放の正本なので、script生成eventはpressed setへ触れない。
    // 無視して次の実trusted keyupを待ち、timer開始根拠へ昇格させない。
    if (!event.isTrusted) return
    if (!currentTokenIsValid()) return
    if (!pressed.delete(event.key)) return
    keyupCount += 1
    if (pressed.size === 0) scheduleCompletion()
  }

  function onBeforeInput() {
    cancelSession('beforeinput')
  }

  function onCompositionStart() {
    cancelSession('compositionstart')
  }

  function onPointerDown(event: PointerEvent) {
    if (phase !== 'navigating' && phase !== 'debouncing') return
    if (!currentTokenIsValid()) return
    cancelTimer()
    pressed.clear()
    pointerId = event.pointerId
    phase = 'pointer-terminal-hold'
    sessionCancelCount += 1
    lastCancellationReason = 'pointerdown'
  }

  function onPointerTerminal(event: PointerEvent) {
    if (phase !== 'pointer-terminal-hold' || pointerId !== event.pointerId) return
    // pointer selection transactionのstable pointを再利用せず、terminal後もoffを維持する。
    const heldToken = token
    clearLocalState()
    phase = 'inactive'
    token = null
    if (heldToken) options.cancelAutoArmHold(heldToken, 'pointerdown')
  }

  function onVisibilityChange() {
    if (options.document.visibilityState !== 'visible') cancelSession('visibility-change')
  }

  function onWindowBlur(event: Event) {
    // descendant blurはLocal→host focus handoffで発生する。真のwindow blurだけを見る。
    if (event.target === (options.window as unknown as EventTarget)) cancelSession('window-blur')
  }

  const attachListeners = () => {
    if (listenersAttached) return
    listenersAttached = true
    options.document.addEventListener('keydown', onDocumentKeyDown, true)
    options.document.addEventListener('keyup', onDocumentKeyUp, true)
    options.document.addEventListener('beforeinput', onBeforeInput, true)
    options.document.addEventListener('compositionstart', onCompositionStart, true)
    options.document.addEventListener('pointerdown', onPointerDown, true)
    options.document.addEventListener('pointerup', onPointerTerminal, true)
    options.document.addEventListener('pointercancel', onPointerTerminal, true)
    options.document.addEventListener('visibilitychange', onVisibilityChange, true)
    options.window.addEventListener('blur', onWindowBlur, true)
  }

  return {
    beginInitialKeyDown(input) {
      if (phase === 'destroyed') return { ok: false, reason: 'destroyed' }
      if (phase !== 'inactive') return { ok: false, reason: 'session-active' }
      const nextToken: LocalImeLocalWindowHostNavigationToken = {
        sessionId: nextSessionId++,
        documentIdentity: input.documentIdentity,
        controllerGeneration: input.controllerGeneration,
      }
      if (!options.beginAutoArmHold(nextToken)) {
        return { ok: false, reason: 'autoarm-hold-rejected' }
      }
      token = nextToken
      phase = 'provisional'
      pressed.add(input.key)
      keydownCount += 1
      autoArmHoldCount += 1
      firstNavigationKey = input.key
      firstCloseContentDelta = null
      firstCaretRestoreTransactionCount = null
      firstAdapterCallCount = 0
      firstAdapterTransactionCount = null
      firstAdapterMoved = null
      firstAdapterNoop = null
      firstAdapterDomSelectionRestored = null
      firstAdapterScrollMoved = null
      attachListeners()
      return { ok: true, token: nextToken }
    },
    confirmInitialNavigation(expected, result) {
      if (phase !== 'provisional' || !sameToken(token, expected) || !currentTokenIsValid()) {
        return false
      }
      firstCloseContentDelta = result.closeContentTransactionCount
      firstCaretRestoreTransactionCount = result.caretRestoreTransactionCount
      firstAdapterCallCount = result.adapterCalls
      firstAdapterTransactionCount = result.adapterTransactionCount
      firstAdapterMoved = result.moved
      firstAdapterNoop = !result.moved
      firstAdapterDomSelectionRestored = result.domSelectionRestored
      firstAdapterScrollMoved = result.scrollMoved ?? null
      phase = 'navigating'
      sessionStartCount += 1
      return true
    },
    cancel: (reason) => cancelSession(reason),
    cancelForHostContentChange(notice) {
      if (phase === 'inactive' || phase === 'destroyed') return
      hostContentCancellationCount += 1
      lastHostContentRootDocChanged = notice?.rootDocChanged ?? null
      lastHostContentAppendedDocChangedCount = notice?.appendedDocChangedCount ?? null
      cancelSession('external-content-change')
    },
    noteLocalWindowStart() {
      localWindowStartCount += 1
      if (phase !== 'inactive' && phase !== 'destroyed') unexpectedStartCount += 1
    },
    blocksLocalWindowStart: () => phase !== 'inactive' && phase !== 'destroyed',
    isProvisional: (expected) =>
      phase === 'provisional' && (expected === undefined || sameToken(token, expected)),
    diagnostics() {
      const autoArm = options.readAutoArmDiagnostics()
      return {
        phase,
        active: phase !== 'inactive' && phase !== 'destroyed',
        pressedNavigationKeys: NAVIGATION_KEYS.filter((key) => pressed.has(key)),
        sessionStartCount,
        sessionCancelCount,
        sessionCompleteCount,
        keydownCount,
        keyupCount,
        timerScheduledCount,
        timerCancelledCount,
        timerFiredCount,
        listenerCount: listenersAttached ? 9 : 0,
        autoArmHoldCount,
        stableCandidateHeld: autoArm.navigationStableCandidateHeld,
        freshAcquisitionRequestCount,
        freshAcquisitionAttemptCount: autoArm.attemptCount,
        freshAcquisitionSuccessCount: autoArm.successCount,
        hostContentCancellationCount,
        lastHostContentRootDocChanged,
        lastHostContentAppendedDocChangedCount,
        localWindowStartCount,
        unexpectedStartCount,
        lastCancellationReason,
        firstNavigationKey,
        firstCloseContentDelta,
        firstCaretRestoreTransactionCount,
        firstAdapterCallCount,
        firstAdapterTransactionCount,
        firstAdapterMoved,
        firstAdapterNoop,
        firstAdapterDomSelectionRestored,
        firstAdapterScrollMoved,
      }
    },
    destroy() {
      if (phase === 'destroyed') return
      cancelSession('destroy')
      phase = 'destroyed'
      token = null
    },
  }
}
