import { TextSelection, type Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import {
  cancelPendingLocalImeDocumentAction,
  continuePendingLocalImeDocumentAction,
  isLocalImeDocumentActionPending,
  registerLocalImeLocalWindowDocumentActionParticipant,
  unregisterLocalImeLocalWindowDocumentActionParticipant,
  type LocalImeDocumentActionParticipant,
} from './localImeDocumentActionBarrier'
import {
  createLocalImeLocalWindowAutoArmScheduler,
  type LocalImeLocalWindowAutoArmScheduler,
  type LocalImeLocalWindowBoundaryFreshAcquisitionProof,
  type LocalImeLocalWindowTransitionKind,
} from './localImeLocalWindowAutoArm'
import {
  createLocalImeLocalWindowController,
  type LocalImeLocalWindowControllerHandle,
  type LocalImeLocalWindowSnapshot,
} from './localImeLocalWindowController'
import {
  createLocalImeLocalWindowResizeExit,
  LOCAL_IME_LOCAL_WINDOW_RESIZE_EXIT_REASON,
  type LocalImeLocalWindowResizeExitHandle,
} from './localImeLocalWindowResizeExit'
import {
  createLocalImeLocalWindowPointerHandoff,
  LOCAL_IME_LOCAL_WINDOW_POINTER_HANDOFF_REASON,
  type LocalImeLocalWindowPointerHandoffHandle,
} from './localImeLocalWindowPointerHandoff'
import {
  attemptLocalImeLocalWindowFreshAcquisition,
  canScheduleLocalImeLocalWindowFreshAcquisition,
  isLocalImeLocalWindowRequested,
  isLocalImeLocalWindowProductEntryRequested,
  consumeLocalImeLocalWindowExplicitEnableActivation,
  clearLocalImeLocalWindowExplicitEnableActivation,
  notifyLocalImeDraftDirty,
  notifyLocalImePilotSessionMode,
  registerLocalImeLocalWindowPilotTarget,
  unregisterLocalImeLocalWindowPilotTarget,
  type LocalImePilotTarget,
} from './localImePilotRuntime'
import type { LocalImeEditMenuCommandResult, LocalImeEditMenuOperation } from './localImeEditMenuCommandState'
import type { LocalImeLocalWindowPseudoCaretGeometrySource } from './localImePseudoCaretGeometrySource'
import {
  createLocalImeLocalWindowHostNavigationSession,
  type LocalImeLocalWindowHostNavigationSession,
} from './localImeLocalWindowHostNavigationSession'
import type {
  LocalImeHostContentChangeNotice,
  LocalImeHostInputCycleToken,
  LocalImeHostInputSelectionStableNotice,
} from './localImeHostTransactionNotice'
import type { LocalImeHostHistoryTransactionBatch } from './localImeLocalWindowHistoryHandoff'
import {
  buildLocalImeLocalWindowRecoveryMarkdown,
  copyLocalImeLocalWindowRecoveryMarkdown,
  type LocalImeLocalWindowRecoveryExportResult,
} from './localImeLocalWindowRecoveryExport'
import {
  registerLocalImeLocalWindowRecoveryPort,
  unregisterLocalImeLocalWindowRecoveryPort,
  type LocalImeLocalWindowRecoveryDiagnostics,
  type LocalImeLocalWindowRecoveryPort,
} from './localImeLocalWindowRecoveryRuntime'
import {
  canEnableLocalImeLocalWindowRuntime,
  isLocalImeLocalWindowRecoveryRuntimeAlive,
  isLocalImeLocalWindowRuntimeEpochCurrent,
  isLocalImeLocalWindowRuntimeToggleOn,
  LOCAL_IME_LOCAL_WINDOW_INITIAL_RUNTIME_EPOCH,
  nextLocalImeLocalWindowRuntimeEpoch,
  resolveLocalImeLocalWindowProductRuntimeState,
  resolveLocalImeLocalWindowRecoveryDiscard,
  resolveLocalImeLocalWindowRecoveryRetry,
  runLocalImeLocalWindowRestartSequence,
  type LocalImeLocalWindowProductRuntimeState,
} from './localImeLocalWindowRuntimeState'
import type { LineBreakPolicy, MarkdownDocumentOptions } from '../types'

function captureHostDomCollapsedSelection(
  view: EditorView,
): { anchor: number; head: number } | null {
  const domSelection = view.dom.ownerDocument.defaultView?.getSelection()
  if (
    !domSelection?.isCollapsed ||
    !domSelection.anchorNode ||
    !domSelection.focusNode ||
    !domSelection.anchorNode.isConnected ||
    !domSelection.focusNode.isConnected ||
    !view.dom.contains(domSelection.anchorNode) ||
    !view.dom.contains(domSelection.focusNode)
  ) return null
  try {
    return {
      anchor: view.posAtDOM(domSelection.anchorNode, domSelection.anchorOffset, 1),
      head: view.posAtDOM(domSelection.focusNode, domSelection.focusOffset, 1),
    }
  } catch {
    return null
  }
}

/**
 * host view の実 computed writing-mode。React state ではなく、controller の `start()`
 * と同じ authority（`getComputedStyle(hostView.dom).writingMode`）を使う。
 */
function readHostComputedWritingMode(view: EditorView): string | null {
  const ownerWindow = view.dom.ownerDocument.defaultView
  if (!ownerWindow || !view.dom.isConnected) return null
  const writingMode = ownerWindow.getComputedStyle(view.dom).writingMode
  return writingMode ? writingMode : null
}

/**
 * pointer terminal後のhost caret proof。terminalで固定したDOM position、最終PM Selection、
 * 現在の実DOM Selectionをexact照合し、detached / range / host外はfail-closed。
 */
function proveHostPmDomCollapsedSelection(
  view: EditorView,
  expected: { anchor: number; head: number },
): boolean {
  const pmSelection = view.state.selection
  const currentDom = captureHostDomCollapsedSelection(view)
  return (
    pmSelection instanceof TextSelection &&
    pmSelection.empty &&
    currentDom !== null &&
    currentDom.anchor === expected.anchor &&
    currentDom.head === expected.head &&
    pmSelection.anchor === expected.anchor &&
    pmSelection.head === expected.head
  )
}

export type LocalImeLocalWindowIntegrationHandle = {
  attach: (options: {
    view: EditorView
    editorSurface: HTMLElement | null
    getDocumentIdentity: () => string
    getHostContentGeneration: () => number
    getHostTransactionCounts: () => { total: number; docChanged: number; selectionOnly: number }
    getHostTransactionSequence: () => number
    getHostTransactionBatchesSince: (sequence: number) => readonly LocalImeHostHistoryTransactionBatch[]
    getIsSourceModeActive: () => boolean
    getIsParagraphPlainActive: () => boolean
    getHostCompositionActive: () => boolean
    getOtherStrategyActive: () => boolean
    schedulePseudoCaretLocalWindowUpdate?: () => void
    notePseudoCaretLocalWindowKeyboardIntent?: (
      event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>,
    ) => void
    onBareArrowNavigationDisplayHandoff?: (event: KeyboardEvent) => void
    /** HOSTNAV-KEYS1: bare Home / End handled成功後の既存Typewriter / pseudo caret通知。 */
    onHomeEndNavigationHandoff?: (event: KeyboardEvent) => void
    /** HOSTNAV-KEYS1: bare PageUp / PageDown handled成功後の既存Typewriter通知。 */
    onPageUpDownNavigationHandoff?: (event: KeyboardEvent) => void
    /** RECOVERY-RESTART1: recovery exportで使う既存canonical Markdown設定。 */
    getLineBreakPolicy?: () => LineBreakPolicy
    getDocumentMarkdownOptions?: () => MarkdownDocumentOptions
  }) => void
  notifyDocumentChange: (reason: string) => boolean
  /**
   * LOCAL-WINDOW-PACKAGED-REARM-POLISH1: 設定 ON 継続中の明示操作（writing-mode 切替 /
   * 同一 tab document 切替）の開始・取消・完了を、既存 AUTOARM scheduler の bounded
   * token として渡す 3 入口。新しい scheduler / timer は作らない。
   */
  beginTransition: (kind: LocalImeLocalWindowTransitionKind) => boolean
  cancelTransition: (kind: LocalImeLocalWindowTransitionKind) => void
  completeTransition: (
    kind: LocalImeLocalWindowTransitionKind,
    expectedWritingMode?: string | null,
  ) => boolean
  notifyHostInputCycleStart: (cycle: LocalImeHostInputCycleToken) => void
  notifyHostDirectInputConfirmed: (cycle: LocalImeHostInputCycleToken) => void
  notifyHostInputSelectionStablePoint: (
    notice: LocalImeHostInputSelectionStableNotice<Transaction>,
  ) => void
  cancelHostInputCycle: (cycle: LocalImeHostInputCycleToken) => void
  notifyHostContentChange: (notice?: LocalImeHostContentChangeNotice<Transaction>) => void
  notifyHostSelectionStablePoint: (fromHistory?: boolean) => void
  notifyHostCompositionStart: (cycle?: LocalImeHostInputCycleToken) => void
  notifyHostCompositionEnd: (cycle?: LocalImeHostInputCycleToken) => void
  requestFreshAcquisitionFromBoundary: (
    proof: LocalImeLocalWindowBoundaryFreshAcquisitionProof,
  ) => void
  isActive: () => boolean
  isPayloadBearing: () => boolean
  /** RECOVERY-RESTART1: 製品非依存のrecovery / restart port（未attachならnull）。 */
  recoveryPort: () => LocalImeLocalWindowRecoveryPort | null
  /**
   * RECOVERY-RESTART1 test only: restartのStart経路へone-shot failureを仕込む。
   *
   * 製品portには載せない。既存`...ForE2e`と同じ経路（packaging gateの対象）を通し、
   * `PUBLIC-ENTRY1`が再利用するport型へtest capabilityを混ぜないためである。
   */
  injectRestartStartFailureForTest: (
    kind: 'start-wiring' | 'start-wiring-and-settlement',
  ) => void
  getPseudoCaretExternalGeometrySource: () => LocalImeLocalWindowPseudoCaretGeometrySource | null
  snapshot: () => LocalImeLocalWindowSnapshot | null
  getNavigationPerformanceSelectionForTest: () =>
    | import('./localImeNavigationPerformanceSnapshot').LocalImeNavigationPerformanceSelectionSnapshot
    | null
  setFailureForTest: (failure: Parameters<LocalImeLocalWindowControllerHandle['setFailureForTest']>[0]) => void
  dispatchHostContentChangeForTest: (
    kind: Parameters<LocalImeLocalWindowControllerHandle['dispatchHostContentChangeForTest']>[0],
  ) => boolean
  setLocalSelectionForTest: (anchor: number, head?: number) => boolean
  dispatchLocalGrowthForTest: (additionalBlocks: number, text?: string) => boolean
  destroy: () => boolean
  routeEditMenuCommand: (operation: LocalImeEditMenuOperation) => LocalImeEditMenuCommandResult
  readSearchCloseFocusLive: () => ReturnType<
    LocalImeLocalWindowControllerHandle['readSearchCloseFocusLive']
  > | null
  tryFocusLocalWindowRoot: (
    proof: Parameters<LocalImeLocalWindowControllerHandle['tryFocusLocalWindowRoot']>[0],
  ) => boolean
}

export function createLocalImeLocalWindowIntegration(): LocalImeLocalWindowIntegrationHandle {
  let controller: LocalImeLocalWindowControllerHandle | null = null
  let participant: LocalImeDocumentActionParticipant | null = null
  let pilotTarget: LocalImePilotTarget | null = null
  let resizeExit: LocalImeLocalWindowResizeExitHandle | null = null
  let pointerHandoff: LocalImeLocalWindowPointerHandoffHandle | null = null
  let autoArm: LocalImeLocalWindowAutoArmScheduler | null = null
  let hostNavigation: LocalImeLocalWindowHostNavigationSession | null = null
  let setProductEntryListenersEnabled: ((enabled: boolean) => void) | null = null
  let productEntryListenerCount = 0
  let productEntryPointerAssociationCount = 0
  // --- RECOVERY-RESTART1 runtime -------------------------------------------
  // 表示上のON/OFF（`enabledIntent`）と、draftを持つrecovery runtimeの生存を
  // 同じbooleanにしない。後者はcontrollerのrecovery stateが正本である。
  let enabledIntent = false
  let runtimeEpoch = LOCAL_IME_LOCAL_WINDOW_INITIAL_RUNTIME_EPOCH
  /** 現在のlive sessionが属するepoch。旧epoch由来のboundary callbackを落とす。 */
  let sessionEpoch = runtimeEpoch
  let recoveryPort: LocalImeLocalWindowRecoveryPort | null = null
  let lastRetryHostTransactionDelta: number | null = null
  let lastRetryHostContentDelta: number | null = null
  let retryCallCount = 0
  let retryCommitCount = 0
  let copyCallCount = 0
  let discardCallCount = 0
  let discardCompletedCount = 0
  let restartCallCount = 0
  let restartStartCount = 0
  let staleEpochRejectCount = 0
  const isSessionEpochCurrent = () => sessionEpoch === runtimeEpoch
  /**
   * E2E gate内のone-shot injection。`active.start()`成功**後**のlifecycle配線で
   * 例外が起きる状況（controllerだけactiveのまま残り得る）を再現するために使う。
   * production経路からは立てない。
   */
  let restartStartWiringFailureArmed = false
  /** E2E gate内のone-shot injection。stop / force resetの両方を失敗させる。 */
  let restartSettlementFailureArmed = false
  let lastRestartStartFailure: 'settled-off' | 'recovery-retained' | 'still-active' | null = null
  return {
    attach(options) {
      if (controller) return
      controller = createLocalImeLocalWindowController({
        hostView: options.view,
        editorSurface: options.editorSurface,
        getDocumentIdentity: options.getDocumentIdentity,
        getHostContentGeneration: options.getHostContentGeneration,
        getHostTransactionCounts: options.getHostTransactionCounts,
        getHostTransactionSequence: options.getHostTransactionSequence,
        getHostTransactionBatchesSince: options.getHostTransactionBatchesSince,
        getDocumentActionPending: isLocalImeDocumentActionPending,
        getIsSourceModeActive: options.getIsSourceModeActive,
        getIsParagraphPlainActive: options.getIsParagraphPlainActive,
        getEnabled: isLocalImeLocalWindowRequested,
        schedulePseudoCaretLocalWindowUpdate: options.schedulePseudoCaretLocalWindowUpdate,
        notePseudoCaretLocalWindowKeyboardIntent: options.notePseudoCaretLocalWindowKeyboardIntent,
        onBareArrowNavigationDisplayHandoff: options.onBareArrowNavigationDisplayHandoff,
        onHomeEndNavigationDisplayHandoff: options.onHomeEndNavigationHandoff,
        onPageUpDownNavigationDisplayHandoff: options.onPageUpDownNavigationHandoff,
        onBareArrowBoundaryAdapterCall: () => autoArm?.noteBareArrowAdapterCall(),
        // RECOVERY-RESTART1: 旧runtime epochに属するboundary callbackからは
        // fresh acquisitionを起こさない。
        onArrowBoundaryFreshAcquisition: (proof) => {
          if (!isSessionEpochCurrent()) return
          autoArm?.requestBoundaryFreshAcquisition(proof)
        },
        onBoundedBoundaryFreshAcquisition: (proof) => {
          if (!isSessionEpochCurrent()) return
          autoArm?.requestBoundaryFreshAcquisition(proof)
        },
        onShrinkBoundaryFreshAcquisition: (proof) => {
          if (!isSessionEpochCurrent()) return
          autoArm?.requestBoundaryFreshAcquisition(proof)
        },
        onHostHistoryHandoffCloseTerminated: () => {
          hostNavigation?.cancel('document-action')
          autoArm?.disableContinuity()
          resizeExit?.disarm()
        },
        onArrowBoundaryFreshAcquisitionCancel: () => autoArm?.cancelPending(),
        onHostNavigationSessionBegin: (input) =>
          hostNavigation?.beginInitialKeyDown(input) ?? { ok: false },
        onHostNavigationSessionConfirm: (token, result) =>
          hostNavigation?.confirmInitialNavigation(token, result) === true,
        onHostNavigationSessionCancel: (reason) => {
          hostNavigation?.cancel(reason)
          // close / adapter / typed dirty proof失敗後に、同task由来の遅延selection
          // stable pointが通常AUTOARMとして再取得されないようcontinuityも閉じる。
          if (
            reason === 'initial-close-failed' ||
            reason === 'initial-adapter-failed' ||
            reason === 'dirty-close-proof-failed' ||
            reason === 'external-content-change'
          ) autoArm?.disableContinuity()
        },
        continuePendingDocumentAction: (reason) =>
          participant ? continuePendingLocalImeDocumentAction(participant, reason) : false,
        cancelPendingDocumentAction: () =>
          participant ? cancelPendingLocalImeDocumentAction(participant) : false,
        onModeChange: (mode) => {
          if (mode === 'recovery-required') {
            // RECOVERY-RESTART1: recovery突入で「新規acquisitionを起こし得る
            // lifecycle」だけを同期停止する。controller / local PM draft /
            // recovery subscriptionは**破棄しない**（通常OFF cleanupへ合流しない）。
            hostNavigation?.cancel('recovery')
            // RESIZEEXIT1の既存契約どおり、listener / observerは保持したまま
            // baselineを落として監視をinertにする（armed=falseではboundaryは0）。
            resizeExit?.disarm()
            // AUTOARM continuity / candidate / pending microtask / hold を破棄する
            // （`disableContinuity()`がlifecycle generationも進めるので、旧callback
            // は同期的に失効する）。
            autoArm?.cancelPending()
            autoArm?.disableContinuity()
            // recovery では host gesture を渡さない。session listener を外し、
            // 取得済み lease も同期解除する。
            pointerHandoff?.detachSessionListener()
            pointerHandoff?.releaseLease('recovery')
            setProductEntryListenersEnabled?.(false)
            // 表示上はOFFへ戻す。draft runtimeの生存とは別のbooleanである。
            enabledIntent = false
          }
          if (mode === 'off') {
            resizeExit?.detach()
            // handoff 成功直後もここを通る。session listener だけを外し、
            // terminal lease（pointerup / pointercancel）は gesture 終端まで残す。
            pointerHandoff?.detachSessionListener()
          }
          notifyLocalImePilotSessionMode(mode)
        },
        // Local Windowとparagraph overlayはgateで排他。既存のstrategy-neutralな
        // boolean + document identity noticeを共有し、canonical tab.dirtyは触らない。
        onDraftDirtyChange: ({ dirty, documentIdentity }) => {
          if (controller !== active) return
          notifyLocalImeDraftDirty({ dirty, documentIdentity })
        },
      })
      const active = controller
      resizeExit = createLocalImeLocalWindowResizeExit({
        getSessionActive: () => {
          const mode = active.getSessionMode()
          return mode === 'armed' || mode === 'composing'
        },
        getGeneration: () => active.snapshot().generation,
        getDocumentIdentity: options.getDocumentIdentity,
        requestBoundary: () => {
          active.prepareForDocumentAction(LOCAL_IME_LOCAL_WINDOW_RESIZE_EXIT_REASON)
        },
      })
      const armResizeExitFromLiveDom = (generation: number) => {
        resizeExit?.attach(options.editorSurface)
        resizeExit?.armFromLiveDom({
          generation,
          identity: options.getDocumentIdentity(),
        })
      }
      const closeForDocumentAction = (reason?: string) => {
        hostNavigation?.cancel('document-action')
        resizeExit?.disarm()
        return active.prepareForDocumentAction(reason)
      }
      pointerHandoff = createLocalImeLocalWindowPointerHandoff({
        getHostRoot: () => options.view.dom,
        getDocumentIdentity: options.getDocumentIdentity,
        getControllerGeneration: () => active.snapshot().generation,
        getSessionActive: () => active.isActive(),
        resolveHostFirst: () => active.resolvePointerSelectionHandoffEligibility(),
        // 既存 close / commit 経路を exact 1 回だけ呼ぶ。pointer 専用の commit や
        // selection-only transaction は作らない。
        prepareHandoff: () =>
          closeForDocumentAction(LOCAL_IME_LOCAL_WINDOW_POINTER_HANDOFF_REASON),
        getSessionMode: () => active.getSessionMode(),
        getHostContentTransactionCount: () => options.getHostTransactionCounts().docChanged,
        getHostSelectionOnlyTransactionCount: () =>
          options.getHostTransactionCounts().selectionOnly,
        onProductEntryPointerAssociation: () => {
          const associated = autoArm?.beginProductEntryPointerAssociation() === true
          if (associated) productEntryPointerAssociationCount += 1
          return associated
        },
        onLeaseRelease: ({ mode, reason, stale }) => {
          autoArm?.notifyPointerLeaseTerminal(
            mode === 'handoff' && reason === 'pointerup' && !stale,
          )
        },
      })
      participant = {
        id: 'local-window',
        prepareForDocumentAction: (reason) => closeForDocumentAction(reason),
        hasPayloadBearingState: () => active.isPayloadBearing(),
      }
      registerLocalImeLocalWindowDocumentActionParticipant(participant)
      pilotTarget = {
        getEditorSurface: () => options.editorSurface,
        getSessionMode: () => active.getSessionMode(),
        getRetainedPayloadLength: () => active.getRetainedDraftLength(),
        startSession: () => {
          if (hostNavigation?.blocksLocalWindowStart() === true) {
            return { ok: false, reason: 'navigation-session-active' as const }
          }
          // lease 中（handoff 済み gesture の継続中）は明示 Start でも再取得しない。
          if (pointerHandoff?.isGestureActive() === true) {
            return { ok: false, reason: 'already-active' as const }
          }
          const result = active.start()
          if (result.ok) {
            hostNavigation?.noteLocalWindowStart()
            armResizeExitFromLiveDom(result.sessionGeneration)
            if (restartStartWiringFailureArmed) {
              // test only: 配線途中で落ちる。controllerは既にactiveなので、
              // 呼び出し側がoff / recovery / still-activeへ正直に分類できることをここで検査する。
              restartStartWiringFailureArmed = false
              throw new Error('local-window-restart-start-wiring')
            }
            pointerHandoff?.attach()
            autoArm?.noteSuccessfulStart()
            // RECOVERY-RESTART1: 成功したStartを現在のruntime epochへ束ねる。
            sessionEpoch = runtimeEpoch
            enabledIntent = true
            if (isLocalImeLocalWindowProductEntryRequested()) {
              notifyLocalImePilotSessionMode(active.getSessionMode())
            }
          }
          return result
        },
        stopSession: () => {
          enabledIntent = false
          setProductEntryListenersEnabled?.(false)
          hostNavigation?.cancel('explicit-stop')
          autoArm?.disableContinuity()
          resizeExit?.disarm()
          pointerHandoff?.detachSessionListener()
          pointerHandoff?.releaseLease('lifecycle-cancel')
          return active.stop('explicit-stop')
        },
        notifyExternalOwnershipLoss: () => ({ outcome: 'ignored', mode: active.getSessionMode() }),
        // Kill / Preview OFF / pilot target 切替が共有する lifecycle 入口。
        // continuityとpointer session listener / leaseを同じ境界で落とす。
        cancelAutoArm: () => {
          hostNavigation?.cancel('lifecycle-cancel')
          autoArm?.disableContinuity()
          pointerHandoff?.detachSessionListener()
          pointerHandoff?.releaseLease('lifecycle-cancel')
          setProductEntryListenersEnabled?.(false)
        },
        resolveRecoveryDiscard: () => {
          enabledIntent = false
          hostNavigation?.cancel('discard')
          autoArm?.disableContinuity()
          pointerHandoff?.detachSessionListener()
          pointerHandoff?.releaseLease('lifecycle-cancel')
          return active.resolveRecoveryDiscard()
        },
        // RECOVERY-RESTART1: Local Windowは旧`retryRecovery()`（armedへ戻す経路）を
        // 実装しない。作者HUDの汎用Retryボタンはこの未実装で自動的に出なくなり、
        // Retryはtyped retry-to-off portだけが持つ。1-block paragraph overlayは
        // 従来どおり旧経路を実装したままにする。
        forceResetController: (reason) => {
          enabledIntent = false
          hostNavigation?.cancel('force-reset')
          autoArm?.disableContinuity()
          pointerHandoff?.detachSessionListener()
          pointerHandoff?.releaseLease('force-reset')
          active.forceReset(reason)
        },
        getAutoArmSnapshot: () => {
          const snapshot = active.snapshot()
          const selection = options.view.state.selection
          return {
            documentIdentity: options.getDocumentIdentity(),
            controllerGeneration: snapshot.generation,
            sessionMode: active.getSessionMode(),
            hostFocused: document.activeElement === options.view.dom,
            sourceModeActive: options.getIsSourceModeActive(),
            paragraphPlainActive: options.getIsParagraphPlainActive(),
            documentActionPending: isLocalImeDocumentActionPending(),
            hostSelectionCollapsed: selection.empty,
            hostCompositionActive: options.getHostCompositionActive(),
            hostViewReady: options.view.editable && options.view.dom.isConnected,
            otherStrategyActive: options.getOtherStrategyActive(),
          }
        },
      }
      registerLocalImeLocalWindowPilotTarget(pilotTarget)
      const autoArmTarget = pilotTarget
      autoArm = createLocalImeLocalWindowAutoArmScheduler({
        target: {
          getSnapshot: () => {
            const snapshot = autoArmTarget.getAutoArmSnapshot?.()
            if (!snapshot) return null
            const selection = options.view.state.selection
            return {
              ...snapshot,
              hostSelectionCollapsed: selection.empty,
              hostCompositionActive: options.getHostCompositionActive(),
              hostViewReady: options.view.editable && options.view.dom.isConnected,
              otherStrategyActive: options.getOtherStrategyActive(),
            }
          },
          canSchedule: () =>
            canScheduleLocalImeLocalWindowFreshAcquisition(autoArmTarget),
          isPointerGestureActive: () => pointerHandoff?.isGestureActive() === true,
          captureHostDomCollapsedSelection: () =>
            captureHostDomCollapsedSelection(options.view),
          proveHostPmDomSelectionAlignment: (expected) =>
            proveHostPmDomCollapsedSelection(options.view, expected),
          readHostWritingMode: () => readHostComputedWritingMode(options.view),
          attemptFreshAcquisition: (expected) =>
            attemptLocalImeLocalWindowFreshAcquisition({
              target: autoArmTarget,
              expected,
            }),
        },
      })
      setProductEntryListenersEnabled = (enabled) => {
        const attached = productEntryListenerCount > 0
        if (enabled === attached) return
        pointerHandoff?.setProductEntryAssociationEnabled(enabled)
        productEntryListenerCount = enabled ? 1 : 0
      }
      const ownerDocument = options.view.dom.ownerDocument
      const ownerWindow = ownerDocument.defaultView
      if (ownerWindow) {
        hostNavigation = createLocalImeLocalWindowHostNavigationSession({
          document: ownerDocument,
          window: ownerWindow,
          getCurrentIdentity: options.getDocumentIdentity,
          getCurrentControllerGeneration: () => active.snapshot().generation,
          beginAutoArmHold: (token) => autoArm?.beginHostNavigationHold(token) === true,
          cancelAutoArmHold: (token, reason) => {
            autoArm?.cancelHostNavigationHold(token, reason)
            // pointer terminal後に遅れて届くhost selection stable pointを、このgestureの
            // continuityとして再利用しない。入力と同様、次の独立Startまでoffを維持する。
            if (reason === 'pointerdown') autoArm?.disableContinuity()
          },
          completeAutoArmHold: (token) => autoArm?.completeHostNavigationHold(token) === true,
          readAutoArmDiagnostics: () => {
            const diagnostics = autoArm?.diagnostics()
            return {
              navigationHoldActive: diagnostics?.navigationHoldActive === true,
              navigationStableCandidateHeld:
                diagnostics?.navigationStableCandidateHeld === true,
              attemptCount: diagnostics?.attemptCount ?? 0,
              successCount: diagnostics?.successCount ?? 0,
            }
          },
        })
      }

      // --- RECOVERY-RESTART1 typed port ------------------------------------
      const activePilotTarget = pilotTarget
      const recoveryRetained = () =>
        active.getSessionMode() === 'recovery-required' && active.isPayloadBearing()
      const runtimeState = (): LocalImeLocalWindowProductRuntimeState =>
        resolveLocalImeLocalWindowProductRuntimeState({
          enabledIntent,
          recoveryRetained: recoveryRetained(),
          sessionActive: active.isActive() && active.getSessionMode() !== 'recovery-required',
        })
      const retryDecision = () =>
        resolveLocalImeLocalWindowRecoveryRetry({
          epochCurrent: isSessionEpochCurrent(),
          ...active.readRecoveryProbe(),
        })
      const epochCurrent = (epoch?: number) =>
        isLocalImeLocalWindowRuntimeEpochCurrent(runtimeEpoch, epoch)
      const noteStaleEpoch = () => { staleEpochRejectCount += 1 }
      const exportDraft = (): LocalImeLocalWindowRecoveryExportResult =>
        buildLocalImeLocalWindowRecoveryMarkdown({
          doc: active.readRetainedRecoveryDraftDoc(),
          lineBreakPolicy: options.getLineBreakPolicy?.(),
          markdownOptions: options.getDocumentMarkdownOptions?.(),
        })
      /**
       * 旧epochのlistener / callback / lease / AUTOARM candidateを全破棄する。
       * controllerは破棄しない（draftはこの時点で既に解決済みである）。
       */
      const cleanupRuntimeLifecycle = () => {
        hostNavigation?.cancel('lifecycle-cancel')
        autoArm?.cancelPending()
        autoArm?.disableContinuity()
        autoArm?.resetDocument()
        pointerHandoff?.detachSessionListener()
        pointerHandoff?.releaseLease('lifecycle-cancel')
        resizeExit?.disarm()
        resizeExit?.detach()
      }
      /**
       * restart中のStart例外後に、controllerを必ず観測可能な終端状態へ収束させる。
       *
       * 収束の証明は**実際のsession mode**だけから取る。`isPayloadBearing()`は
       * `active-dirty` / `composing`でもtrueになるため、それで`recovery-retained`を
       * 名乗るとrecovery freezeを証明できていないことになる。
       *
       * - `off`: 既存stopがcontent 0で畳んだ → `settled-off`
       * - `recovery-required`: 既存stopがdraftを保全した → `recovery-retained`
       *   （runtime stateは`recovery-suspended`になり、draftは破棄しない）
       * - それ以外: stopもterminal cleanupも収束させられなかった → `still-active`。
       *   controllerは生きているので、呼び出し側はStop ownershipを維持して
       *   `enabled-active`へ投影する（`disabled`と偽らない）。
       */
      const settleFailedRestartStart = (): 'settled-off' | 'recovery-retained' | 'still-active' => {
        const settleStep = (run: () => void) => {
          // test only: stop / force resetの両方が収束に失敗する状況を再現する。
          if (restartSettlementFailureArmed) throw new Error('local-window-restart-settlement')
          run()
        }
        try { settleStep(() => activePilotTarget.stopSession()) } catch { /* 続行 */ }
        if (active.isActive() && !active.isPayloadBearing()) {
          // 破棄すべきdraftが無いことを確認できた場合だけterminal cleanupする。
          try {
            settleStep(() =>
              activePilotTarget.forceResetController('local-window-restart-start-failed'))
          } catch { /* 続行 */ }
        }
        restartSettlementFailureArmed = false
        const settledMode = active.getSessionMode()
        lastRestartStartFailure =
          settledMode === 'off'
            ? 'settled-off'
            : settledMode === 'recovery-required'
              ? 'recovery-retained'
              : 'still-active'
        return lastRestartStartFailure
      }
      const diagnostics = (): LocalImeLocalWindowRecoveryDiagnostics => {
        const state = runtimeState()
        const decision = retryDecision()
        const probe = active.readRecoveryProbe()
        const autoArmDiagnostics = autoArm?.diagnostics() ?? null
        const pointerDiagnostics = pointerHandoff?.diagnostics() ?? null
        const navigationDiagnostics = hostNavigation?.diagnostics() ?? null
        const resizeDiagnostics = resizeExit?.diagnostics() ?? null
        return {
          runtimeState: state,
          epoch: runtimeEpoch,
          toggleOn: isLocalImeLocalWindowRuntimeToggleOn(state),
          recoveryRuntimeAlive: isLocalImeLocalWindowRecoveryRuntimeAlive(state),
          recoveryIntent: probe.recoveryIntent,
          retryable: decision.retryable,
          retryRejectReason: decision.retryable ? null : decision.reason,
          draftRetained: probe.draftRetained,
          draftLength: probe.draftLength,
          compositionFinalizationPending: probe.compositionFinalizationPending,
          sessionMode: active.getSessionMode(),
          autoArmContinuityEnabled: autoArmDiagnostics?.continuityEnabled === true,
          autoArmPendingCandidate: autoArmDiagnostics?.pendingCandidate === true,
          autoArmPendingMicrotask: autoArmDiagnostics?.pendingMicrotask === true,
          productEntryListenerCount,
          productEntryPointerAssociationCount,
          productEntrySelectionProofCount:
            autoArmDiagnostics?.productEntrySelectionProofCount ?? 0,
          productEntryDomSelectionProofCount:
            autoArmDiagnostics?.productEntryDomSelectionProofCount ?? 0,
          productEntryTerminalAwaitingSelectionCount:
            autoArmDiagnostics?.productEntryTerminalAwaitingSelectionCount ?? 0,
          productEntryStartAttemptCount:
            autoArmDiagnostics?.productEntryAttemptCount ?? 0,
          productEntryStartSuccessCount:
            autoArmDiagnostics?.productEntrySuccessCount ?? 0,
          pointerListenerCount: pointerDiagnostics?.pointerdownListenerCount ?? 0,
          pointerLeaseActive: pointerDiagnostics?.lease.held === true,
          navigationSessionActive: navigationDiagnostics?.active === true,
          navigationListenerCount: navigationDiagnostics?.listenerCount ?? 0,
          resizeListenerCount: resizeDiagnostics?.listenerCount ?? 0,
          resizeObserverCount: resizeDiagnostics?.observerCount ?? 0,
          resizeArmed: resizeDiagnostics?.armed === true,
          lastRetryHostTransactionDelta,
          lastRetryHostContentDelta,
          retryCallCount,
          retryCommitCount,
          copyCallCount,
          discardCallCount,
          discardCompletedCount,
          restartCallCount,
          restartStartCount,
          staleEpochRejectCount,
          lastRestartStartFailure,
        }
      }
      recoveryPort = {
        getEpoch: () => runtimeEpoch,
        getRuntimeState: runtimeState,
        diagnostics,
        requestEnabled: ({ enabled, epoch, activation }) => {
          if (!epochCurrent(epoch)) {
            noteStaleEpoch()
            return { ok: false, reason: 'stale-epoch', runtimeState: runtimeState() }
          }
          if (enabled && !canEnableLocalImeLocalWindowRuntime(runtimeState())) {
            // 未解決recovery中のONは拒否する。draft runtimeは生存したまま。
            return { ok: false, reason: 'recovery-unresolved', runtimeState: runtimeState() }
          }
          enabledIntent = enabled
          setProductEntryListenersEnabled?.(enabled)
          if (!enabled) {
            // OFF では pending な明示 ON intent も破棄する。
            clearLocalImeLocalWindowExplicitEnableActivation()
            autoArm?.disableContinuity()
            autoArm?.cancelPending()
          } else if (activation === 'explicit-user-toggle') {
            // LOCAL-WINDOW-EXPLICIT-ENABLE-ARM1: 明示的なユーザー ON だけが current
            // document の continuity を開き、証明できる現在 caret で exact-one 試行する。
            // 保存済み設定の復元 / initial load（既定の configuration-sync）は従来どおり
            // Start 0 のままで、この経路を通らない。
            autoArm?.beginProductEnableActivation()
          }
          notifyLocalImePilotSessionMode(active.getSessionMode())
          return { ok: true, reason: 'applied', runtimeState: runtimeState() }
        },
        retry: (input) => {
          retryCallCount += 1
          if (!epochCurrent(input?.epoch)) {
            noteStaleEpoch()
            return {
              ok: false, reason: 'stale-epoch', sessionMode: active.getSessionMode(),
              hostTransactionDelta: null, hostContentDelta: null,
              documentActionReplayCount: 0, freshAcquisitionCount: 0,
            }
          }
          const decision = retryDecision()
          if (!decision.retryable) {
            return {
              ok: false, reason: decision.reason, sessionMode: active.getSessionMode(),
              hostTransactionDelta: null, hostContentDelta: null,
              documentActionReplayCount: 0, freshAcquisitionCount: 0,
            }
          }
          const beforeFresh = autoArm?.diagnostics().attemptCount ?? 0
          const mode = active.retryRecoveryCommitToOff()
          const snapshot = active.snapshot()
          lastRetryHostTransactionDelta = snapshot.lastCommitHostTransactionDelta
          lastRetryHostContentDelta = snapshot.lastCommitHostContentDelta
          const committed = mode === 'off'
          if (committed) {
            retryCommitCount += 1
            // Retry成功後も自動再取得しない。次のownershipは明示restartだけ。
            enabledIntent = false
          }
          const afterFresh = autoArm?.diagnostics().attemptCount ?? 0
          return {
            ok: committed,
            reason: committed ? 'committed' : 'retained',
            sessionMode: mode,
            hostTransactionDelta: lastRetryHostTransactionDelta,
            hostContentDelta: lastRetryHostContentDelta,
            documentActionReplayCount: 0,
            freshAcquisitionCount: afterFresh - beforeFresh,
          }
        },
        exportDraftMarkdown: (input) => {
          if (!epochCurrent(input?.epoch)) {
            noteStaleEpoch()
            return { ok: false, reason: 'no-draft' }
          }
          return exportDraft()
        },
        copyDraftMarkdown: async (input) => {
          copyCallCount += 1
          if (!epochCurrent(input?.epoch)) {
            noteStaleEpoch()
            return { ok: false, reason: 'no-draft', markdownLength: null }
          }
          // copyはdraft / recovery stateへ触れない。成功してもdiscardしない。
          return copyLocalImeLocalWindowRecoveryMarkdown({
            exported: exportDraft(),
            write: input?.write,
          })
        },
        discard: ({ confirmed, epoch }) => {
          discardCallCount += 1
          const decision = resolveLocalImeLocalWindowRecoveryDiscard({
            epochCurrent: epochCurrent(epoch),
            confirmed,
            recoveryRetained: active.getSessionMode() === 'recovery-required',
          })
          if (!decision.allowed) {
            if (decision.reason === 'stale-epoch') noteStaleEpoch()
            return {
              ok: false, reason: decision.reason, stopAttempted: false,
              discardAttempted: false, cleanupAttempted: false,
              sessionMode: active.getSessionMode(),
            }
          }
          // 既存の安全順序: stop / recovery保全 → resolveRecoveryDiscard →
          // controller force reset / terminal cleanup。先行がthrowしても後続を試す。
          let stopAttempted = false
          let discardAttempted = false
          let cleanupAttempted = false
          try { stopAttempted = true; activePilotTarget.stopSession() } catch { /* 続行 */ }
          try { discardAttempted = true; activePilotTarget.resolveRecoveryDiscard() } catch { /* 続行 */ }
          try {
            cleanupAttempted = true
            activePilotTarget.forceResetController('local-window-recovery-discard')
          } catch { /* 続行 */ }
          const mode = active.getSessionMode()
          // discard完了を証明できない場合は「解決済み」と扱わない。
          const resolved = mode === 'off' && !active.isPayloadBearing()
          if (resolved) discardCompletedCount += 1
          return {
            ok: resolved,
            reason: resolved ? 'discarded' : 'discard-failed',
            stopAttempted, discardAttempted, cleanupAttempted, sessionMode: mode,
          }
        },
        restart: ({ releaseBreaker, epoch }) => {
          restartCallCount += 1
          // Start例外時にcontrollerが収束した終端状態（この呼び出し限定）。
          let startSettlement: 'settled-off' | 'recovery-retained' | 'still-active' | null = null
          // restart開始時のidentityを**1回だけ**captureする。cleanup / breaker解除の
          // 途中でdocumentが入れ替わった場合はこの値と最新identityが食い違い、
          // 再証明が`identity-changed`で落ちる。
          const requestedDocumentIdentity = options.getDocumentIdentity()
          // 入力`epoch`は「この要求が旧runtime epoch由来のcallbackでないか」だけを
          // 判定する。**開始時に1回だけ**評価して固定する。preflight通過後は
          // `runtimeEpoch`自身が+1されるので、ここで読み直すと現epochを渡した
          // 正当なrestartが自分自身をstale化してしまう（再証明の正本は新epoch）。
          const epochCurrentAtRequest = epochCurrent(epoch)
          const readProbe = () => {
            const autoArmSnapshot = activePilotTarget.getAutoArmSnapshot?.() ?? null
            return {
              epochCurrent: epochCurrentAtRequest,
              recoveryResolved: active.getSessionMode() !== 'recovery-required' &&
                !active.isPayloadBearing(),
              controllerOff: !active.isActive(),
              documentActionPending: isLocalImeDocumentActionPending(),
              pointerGestureActive: pointerHandoff?.isGestureActive() === true,
              navigationSessionActive: hostNavigation?.diagnostics().active === true,
              compositionActive: options.getHostCompositionActive(),
              requestedDocumentIdentity,
              // 毎回読み直す最新値。captureした値と突き合わせる。
              hostDocumentIdentity: options.getDocumentIdentity(),
              hostViewLive: options.view.dom.isConnected,
              hostViewEditable: options.view.editable,
              hostSelectionCollapsed: options.view.state.selection.empty,
              hostSelectionEligible:
                autoArmSnapshot !== null &&
                !autoArmSnapshot.sourceModeActive &&
                !autoArmSnapshot.paragraphPlainActive &&
                autoArmSnapshot.otherStrategyActive !== true &&
                autoArmSnapshot.hostCompositionActive !== true,
            }
          }
          const sequence = runLocalImeLocalWindowRestartSequence({
            preflight: readProbe,
            invalidateEpochAndCleanup: () => {
              runtimeEpoch = nextLocalImeLocalWindowRuntimeEpoch(runtimeEpoch)
              // epoch 交代では pending な明示 ON intent も破棄する。
              clearLocalImeLocalWindowExplicitEnableActivation()
              cleanupRuntimeLifecycle()
            },
            releaseBreaker,
            reprove: readProbe,
            start: () => {
              try {
                return activePilotTarget.startSession().ok
              } catch (error) {
                // `active.start()`成功後のlifecycle配線で落ちると、controllerと
                // local rootがactiveのまま残り得る。表示だけ`disabled`にして
                // 取り残した事実を隠さないよう、ここで同期的にsettlementを試みる。
                // draftを保持している場合は破棄せずrecovery保全を優先する。
                startSettlement = settleFailedRestartStart()
                throw error
              }
            },
          })
          if (!sequence.ok) {
            if (sequence.reason === 'stale-epoch') noteStaleEpoch()
            // `still-active`はcontrollerが生きているのでStop ownershipを維持し、
            // `enabled-active`へ投影する。それ以外の失敗はOFFへ落とす。
            if (sequence.epochAdvanced) enabledIntent = startSettlement === 'still-active'
            setProductEntryListenersEnabled?.(enabledIntent)
            notifyLocalImePilotSessionMode(active.getSessionMode())
            return {
              ok: false, outcome: 'rejected', reason: sequence.reason,
              // Start例外は「1回試行して失敗」。再試行はしない。
              epoch: runtimeEpoch, startAttempts: sequence.startAttempts,
              runtimeState: runtimeState(),
            }
          }
          enabledIntent = true
          setProductEntryListenersEnabled?.(true)
          notifyLocalImePilotSessionMode(active.getSessionMode())
          if (sequence.outcome === 'started') restartStartCount += 1
          return {
            ok: true, outcome: sequence.outcome, reason: null,
            epoch: runtimeEpoch, startAttempts: sequence.startAttempts,
            runtimeState: runtimeState(),
          }
        },
      }
      registerLocalImeLocalWindowRecoveryPort(recoveryPort)
      // React product configuration and EditorView attachment may complete in
      // either order. If the product entry already owns the shared strategy,
      // converge to enabled-waiting without starting from document load.
      if (isLocalImeLocalWindowProductEntryRequested()) {
        // LOCAL-WINDOW-EXPLICIT-ENABLE-ARM1: 明示 ON が Port 未登録の時点で行われて
        // いた場合、その typed intent をここで exact-one に消費し、late attach でも
        // `explicit-user-toggle` として適用する（`configuration-sync` へ降格させない）。
        const explicit = consumeLocalImeLocalWindowExplicitEnableActivation()
        recoveryPort.requestEnabled({
          enabled: true,
          activation: explicit ? 'explicit-user-toggle' : 'configuration-sync',
        })
      }
    },
    notifyDocumentChange: (reason) => {
      hostNavigation?.cancel('document-change')
      autoArm?.cancelPending()
      resizeExit?.disarm()
      pointerHandoff?.detachSessionListener()
      pointerHandoff?.releaseLease('document-change')
      const allowed = controller?.notifyDocumentChange(reason) ?? true
      if (allowed) autoArm?.resetDocument()
      return allowed
    },
    beginTransition: (kind) => autoArm?.beginTransition(kind) === true,
    cancelTransition: (kind) => autoArm?.cancelTransition(kind),
    completeTransition: (kind, expectedWritingMode) =>
      autoArm?.completeTransition(kind, expectedWritingMode) === true,
    notifyHostInputCycleStart: (cycle) => autoArm?.notifyHostInputCycleStart(cycle),
    notifyHostDirectInputConfirmed: (cycle) =>
      autoArm?.notifyHostDirectInputConfirmed(cycle),
    notifyHostInputSelectionStablePoint: (notice) =>
      autoArm?.notifyHostInputSelectionStablePoint(notice),
    cancelHostInputCycle: (cycle) => autoArm?.cancelHostInputCycle(cycle),
    notifyHostContentChange: (notice) => {
      const navigationWasActive = hostNavigation?.diagnostics().active === true
      const disposition = controller?.notifyHostContentChange(notice) ?? 'ignored'
      // typed dirty close root transactionだけはholdを維持する。それ以外のcontent
      // changeはcontrollerがsessionをcancelした後、通常AUTOARM失効へ渡す。
      if (disposition !== 'navigation-dirty-close-candidate') {
        hostNavigation?.cancelForHostContentChange(notice && {
          rootDocChanged: notice.rootDocChanged,
          appendedDocChangedCount: notice.appendedDocChangedCount,
        })
        // navigation中に割り込んだcontent change後のselectionUpdateを、direct input等の
        // 独立stable pointと誤認しない。このsession tokenからはfresh acquisition 0。
        if (navigationWasActive) autoArm?.disableContinuity()
        autoArm?.notifyHostContentChange(notice?.hostInputCycle ? {
          cycle: notice.hostInputCycle,
          rootTransaction: notice.rootTransaction,
          rootDocChanged: notice.rootDocChanged,
          appendedDocChangedCount: notice.appendedDocChangedCount,
          fromHistory: notice.fromHistory,
        } : undefined)
      }
    },
    notifyHostSelectionStablePoint: (fromHistory = false) =>
      autoArm?.notifyHostSelectionStablePoint(fromHistory),
    notifyHostCompositionStart: (cycle) => {
      hostNavigation?.cancel('compositionstart')
      autoArm?.notifyHostCompositionStart(cycle)
    },
    notifyHostCompositionEnd: (cycle) => autoArm?.notifyHostCompositionEnd(cycle),
    requestFreshAcquisitionFromBoundary: (proof) =>
      autoArm?.requestBoundaryFreshAcquisition(proof),
    isActive: () => controller?.isActive() === true,
    isPayloadBearing: () => controller?.isPayloadBearing() === true,
    recoveryPort: () => recoveryPort,
    injectRestartStartFailureForTest: (kind) => {
      restartStartWiringFailureArmed = true
      restartSettlementFailureArmed = kind === 'start-wiring-and-settlement'
    },
    getPseudoCaretExternalGeometrySource: () =>
      controller?.getPseudoCaretExternalGeometrySource() ?? null,
    snapshot: () => {
      const snap = controller?.snapshot() ?? null
      if (!snap) return null
      const autoArmDiagnostics = autoArm?.diagnostics() ?? null
      return {
        ...snap,
        resizeExit: resizeExit?.diagnostics() ?? null,
        pointerHandoff: pointerHandoff?.diagnostics() ?? null,
        autoArm: autoArmDiagnostics,
        hostNavigationSession: hostNavigation?.diagnostics() ?? null,
      }
    },
    getNavigationPerformanceSelectionForTest: () =>
      controller?.getNavigationPerformanceSelectionForTest() ?? null,
    setFailureForTest: (failure) => controller?.setFailureForTest(failure),
    dispatchHostContentChangeForTest: (kind) =>
      controller?.dispatchHostContentChangeForTest(kind) === true,
    setLocalSelectionForTest: (anchor, head) =>
      controller?.setLocalSelectionForTest(anchor, head) === true,
    dispatchLocalGrowthForTest: (additionalBlocks, text) =>
      controller?.dispatchLocalGrowthForTest(additionalBlocks, text) === true,
    routeEditMenuCommand: (operation) => controller?.routeEditMenuCommand(operation) ?? { status: 'not-active' },
    readSearchCloseFocusLive: () => controller?.readSearchCloseFocusLive() ?? null,
    tryFocusLocalWindowRoot: (proof) => controller?.tryFocusLocalWindowRoot(proof) === true,
    destroy() {
      hostNavigation?.cancel('destroy')
      const destroyed = controller?.destroy() ?? true
      if (!destroyed) return false
      setProductEntryListenersEnabled?.(false)
      setProductEntryListenersEnabled = null
      resizeExit?.destroy()
      resizeExit = null
      pointerHandoff?.destroy()
      pointerHandoff = null
      hostNavigation?.destroy()
      hostNavigation = null
      autoArm?.destroy()
      autoArm = null
      if (pilotTarget) unregisterLocalImeLocalWindowPilotTarget(pilotTarget)
      if (participant) unregisterLocalImeLocalWindowDocumentActionParticipant(participant)
      if (recoveryPort) unregisterLocalImeLocalWindowRecoveryPort(recoveryPort)
      pilotTarget = null
      participant = null
      recoveryPort = null
      enabledIntent = false
      controller = null
      return true
    },
  }
}
