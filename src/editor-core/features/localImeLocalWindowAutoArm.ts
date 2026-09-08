/**
 * LOCAL-WINDOW-AUTOARM1 — Local Editing Window 専用 fresh-acquisition scheduler。
 *
 * paragraph overlay の「document load からの初回 one-shot」は持ち込まない。明示 Start
 * または証明済み boundary 成功で continuity が成立した document だけを対象に、実 host
 * selection transaction / 同期 adapter 成功 proof を coalesced microtask で再評価する。
 * timer / polling / quiet period / rAF / click echo は completion 根拠にしない。
 */

import type { LocalImeInputSessionMode } from './localImeInputSessionState'
import type { LocalImeLocalWindowHostNavigationToken } from './localImeLocalWindowHostNavigationSession'
import type { LocalImeHostInputCycleToken } from './localImeHostInputCycle'

export type LocalImeLocalWindowFreshAcquisitionSource =
  | 'product-entry'
  /**
   * LOCAL-WINDOW-EXPLICIT-ENABLE-ARM1: 製品トグルの **明示的なユーザー ON**。
   * pointer candidate（`product-entry`）とは別 source として扱い、保存済み設定の
   * 復元 / initial load（`configuration-sync`）とは typed に区別する。
   */
  | 'product-enable'
  | 'host-selection'
  | 'pointer-selection'
  | 'host-navigation'
  /**
   * LOCAL-WINDOW-PACKAGED-REARM-POLISH1: 設定 ON 継続中に **ユーザーが完了させた**
   * writing-mode 切替 / 同一 tab document 切替だけを typed に識別する source。
   * 保存済み ON の initial load（continuity 未成立）はこの経路を作れない。
   */
  | 'writing-mode-complete'
  | 'document-switch-complete'
  | 'host-direct-input'
  | 'host-ime-input'
  | 'arrow-boundary'
  | 'bounded-boundary'
  | 'shrink-boundary'

/**
 * LOCAL-WINDOW-PACKAGED-REARM-POLISH1: 明示操作の開始と完了を結ぶ bounded token 種別。
 * 第二 scheduler / 第二 timer / 汎用 input-intent framework は作らない。
 */
export type LocalImeLocalWindowTransitionKind = 'writing-mode' | 'document-switch'

export type LocalImeLocalWindowBoundaryFreshAcquisitionProof = {
  readonly source: 'arrow-boundary' | 'bounded-boundary' | 'shrink-boundary'
  readonly documentIdentity: string
  readonly controllerGeneration: number
  /** boundary close / adapter が同期的に成功した typed proof。 */
  readonly status: 'exact-one-success'
}

export type LocalImeLocalWindowAutoArmSnapshot = {
  readonly documentIdentity: string
  readonly controllerGeneration: number
  readonly sessionMode: LocalImeInputSessionMode | null
  readonly hostFocused: boolean
  readonly hostSelectionCollapsed: boolean
  readonly hostCompositionActive: boolean
  readonly documentActionPending: boolean
  readonly sourceModeActive: boolean
  readonly paragraphPlainActive: boolean
  readonly hostViewReady: boolean
  readonly otherStrategyActive: boolean
}

export type LocalImeLocalWindowAutoArmTarget = {
  getSnapshot: () => LocalImeLocalWindowAutoArmSnapshot | null
  canSchedule: () => boolean
  isPointerGestureActive: () => boolean
  /** pointer terminal時の実DOM caretをPM positionへ写す。PM Selectionとの一致は後段。 */
  captureHostDomCollapsedSelection: () => { anchor: number; head: number } | null
  /** pointer terminalで固定したDOM positionと、最終host PM / DOM caretをexact照合する。 */
  proveHostPmDomSelectionAlignment: (expected: { anchor: number; head: number }) => boolean
  /** host view の実 computed writing-mode。切替完了の proof に使う（React state ではない）。 */
  readHostWritingMode: () => string | null
  attemptFreshAcquisition: (expected: {
    documentIdentity: string
    controllerGeneration: number
  }) => boolean
}

export type LocalImeLocalWindowAutoArmOutcome =
  | 'none'
  | 'continuity-enabled'
  | 'scheduled'
  | 'candidate-held'
  | 'cancelled'
  | 'initial-load-blocked'
  | 'lease-held'
  | 'non-collapsed'
  | 'history-suppressed'
  | 'composition-held'
  | 'host-input-held'
  | 'host-input-confirmed'
  | 'host-input-finalized'
  | 'host-input-proof-rejected'
  | 'pointer-associated'
  | 'pointer-selection-unproven'
  | 'product-enable-continuity-opened'
  | 'product-enable-selection-unproven'
  | 'transition-held'
  | 'transition-rejected'
  | 'transition-continuity-opened'
  | 'transition-selection-unproven'
  | 'navigation-held'
  | 'navigation-completed'
  | 'navigation-rejected'
  | 'stale-document'
  | 'stale-generation'
  | 'attempt-rejected'
  | 'started'

export type LocalImeLocalWindowAutoArmDiagnostics = {
  readonly continuityEnabled: boolean
  readonly pendingCandidate: boolean
  readonly pendingMicrotask: boolean
  readonly candidateSource: LocalImeLocalWindowFreshAcquisitionSource | null
  readonly requestCount: number
  readonly cancelCount: number
  readonly runCount: number
  readonly attemptCount: number
  readonly successCount: number
  readonly leaseSuppressionCount: number
  readonly nonCollapsedSuppressionCount: number
  readonly historySuppressionCount: number
  readonly staleDocumentCount: number
  readonly staleGenerationCount: number
  readonly lastOutcome: LocalImeLocalWindowAutoArmOutcome
  readonly bareArrowBoundaryCallCount: number
  readonly bareArrowAdapterCount: number
  readonly futureBoundaryEntryCallCount: number
  readonly boundedBoundaryCallCount: number
  readonly boundedBoundaryAttemptCount: number
  readonly boundedBoundarySuccessCount: number
  readonly lastBoundedBoundaryOutcome: LocalImeLocalWindowAutoArmOutcome
  readonly shrinkBoundaryCallCount: number
  readonly shrinkBoundaryAttemptCount: number
  readonly shrinkBoundarySuccessCount: number
  readonly lastShrinkBoundaryOutcome: LocalImeLocalWindowAutoArmOutcome
  readonly navigationHoldActive: boolean
  readonly navigationHoldBeginCount: number
  readonly navigationHoldCancelCount: number
  readonly navigationHoldCompleteCount: number
  readonly navigationStableCandidateHeld: boolean
  readonly hostInputCycleActive: boolean
  readonly hostInputCycleSource: 'host-direct-input' | 'host-ime-input' | null
  readonly hostInputCycleStartCount: number
  readonly hostInputDirectConfirmCount: number
  readonly hostInputContentProofCount: number
  readonly hostInputSelectionProofCount: number
  readonly hostInputCompositionFinalizationCount: number
  readonly hostInputAttemptCount: number
  readonly hostInputSuccessCount: number
  readonly hostInputCancelCount: number
  readonly productEntryPointerAssociationCount: number
  readonly productEntrySelectionProofCount: number
  readonly productEntryDomSelectionProofCount: number
  readonly productEntryTerminalAwaitingSelectionCount: number
  readonly productEntryAttemptCount: number
  readonly productEntrySuccessCount: number
  /** LOCAL-WINDOW-EXPLICIT-ENABLE-ARM1: 明示 ON で continuity を開いた回数。 */
  readonly productEnableActivationCount: number
  /** 明示 ON 時点で現在 caret を証明できず waiting のままにした回数。 */
  readonly productEnableWaitingCount: number
  readonly productEnableAttemptCount: number
  readonly productEnableSuccessCount: number
  /** LOCAL-WINDOW-PACKAGED-REARM-POLISH1: 保持中の transition token（最大 1）。 */
  readonly pendingTransitionKind: LocalImeLocalWindowTransitionKind | null
  readonly writingModeTransitionBeginCount: number
  readonly writingModeTransitionCompleteCount: number
  readonly writingModeTransitionWaitingCount: number
  readonly writingModeTransitionAttemptCount: number
  readonly writingModeTransitionSuccessCount: number
  readonly documentSwitchTransitionBeginCount: number
  readonly documentSwitchTransitionCompleteCount: number
  readonly documentSwitchTransitionWaitingCount: number
  readonly documentSwitchTransitionAttemptCount: number
  readonly documentSwitchTransitionSuccessCount: number
}

export type LocalImeLocalWindowHostInputContentProof = {
  readonly cycle: LocalImeHostInputCycleToken
  readonly rootTransaction: object
  readonly rootDocChanged: boolean
  readonly appendedDocChangedCount: number
  readonly fromHistory: boolean
}

export type LocalImeLocalWindowAutoArmScheduler = {
  noteSuccessfulStart: () => void
  /** PUBLIC-ENTRY1: trusted pointerdownはassociationだけ。実selection transactionを別途要求する。 */
  beginProductEntryPointerAssociation: () => boolean
  /**
   * LOCAL-WINDOW-EXPLICIT-ENABLE-ARM1: 明示的なユーザー ON で current document の
   * continuity を開き、現在 caret を証明できるときだけ fresh acquisition を最大 1 回試行する。
   * 証明できない場合も continuity は保持し、後続の既存 stable point へ委ねる。
   */
  beginProductEnableActivation: () => boolean
  /**
   * LOCAL-WINDOW-PACKAGED-REARM-POLISH1: 設定 ON 継続中の明示操作（writing-mode 切替 /
   * 同一 tab document 切替）の**開始**を、bounded token 最大 1 件として関連付ける。
   *
   * continuity が当該起動内で既に成立している document でだけ受け付けるので、
   * 保存済み ON の initial load からは token を作れない（Start 0 を維持する）。
   */
  beginTransition: (kind: LocalImeLocalWindowTransitionKind) => boolean
  /** cancel / failure / stale で token を破棄する（Start 0）。 */
  cancelTransition: (kind: LocalImeLocalWindowTransitionKind) => void
  /**
   * 操作が実際に完了した後の最新 PM / DOM / identity proof からだけ、既存 scheduler へ
   * exact-one candidate を渡す。呼び出しは常に token を消費する（bounded）。
   *
   * `document-switch` では `expectedWritingMode`（新文書の実効書字方向）を必須にし、
   * host の実 computed writing-mode がそこへ収束していなければ fail-closed で Start 0
   * にする。切替先で書字方向が変わる場合に旧方向で取得してしまうのを防ぐ。
   */
  completeTransition: (
    kind: LocalImeLocalWindowTransitionKind,
    expectedWritingMode?: string | null,
  ) => boolean
  disableContinuity: () => void
  notifyHostSelectionStablePoint: (fromHistory?: boolean) => void
  notifyHostInputCycleStart: (cycle: LocalImeHostInputCycleToken) => void
  notifyHostDirectInputConfirmed: (cycle: LocalImeHostInputCycleToken) => void
  notifyHostInputSelectionStablePoint: (notice: {
    readonly cycle: LocalImeHostInputCycleToken
    readonly rootTransaction: object
  }) => void
  cancelHostInputCycle: (cycle: LocalImeHostInputCycleToken) => void
  notifyHostContentChange: (proof?: LocalImeLocalWindowHostInputContentProof) => void
  notifyHostCompositionStart: (cycle?: LocalImeHostInputCycleToken) => void
  notifyHostCompositionEnd: (cycle?: LocalImeHostInputCycleToken) => void
  notifyPointerLeaseTerminal: (completed: boolean) => void
  requestBoundaryFreshAcquisition: (
    proof: LocalImeLocalWindowBoundaryFreshAcquisitionProof,
  ) => void
  noteBareArrowAdapterCall: () => void
  beginHostNavigationHold: (token: LocalImeLocalWindowHostNavigationToken) => boolean
  cancelHostNavigationHold: (
    token: LocalImeLocalWindowHostNavigationToken,
    reason: string,
  ) => void
  completeHostNavigationHold: (token: LocalImeLocalWindowHostNavigationToken) => boolean
  resetDocument: () => void
  cancelPending: () => void
  destroy: () => void
  diagnostics: () => LocalImeLocalWindowAutoArmDiagnostics
}

type Candidate = {
  source: LocalImeLocalWindowFreshAcquisitionSource
  documentIdentity: string
  controllerGeneration: number
  hostInputCycleId?: number
  /** 初回product associationだけが一時的に開いたcontinuityか。失敗時に閉じる。 */
  productEntryOpenedContinuity?: boolean
  pointerDomSelection?: { anchor: number; head: number }
}

type PendingTransition = {
  readonly kind: LocalImeLocalWindowTransitionKind
  readonly documentIdentity: string
  readonly controllerGeneration: number
  /** writing-mode 切替の「実際に変わった」proof 用の開始時 computed writing-mode。 */
  readonly writingMode: string | null
}

type ProductEntryPointerAssociation = {
  readonly documentIdentity: string
  readonly controllerGeneration: number
  readonly openedContinuity: boolean
  terminalDomSelection: { anchor: number; head: number } | null
}

type HostInputCycle = {
  readonly token: LocalImeHostInputCycleToken
  readonly documentIdentity: string
  readonly controllerGeneration: number
  directInputConfirmed: boolean
  compositionFinalized: boolean
  contentRootTransaction: object | null
  stableRootTransaction: object | null
}

export function createLocalImeLocalWindowAutoArmScheduler(options: {
  target: LocalImeLocalWindowAutoArmTarget
  scheduleMicrotask?: (callback: () => void) => void | (() => void)
}): LocalImeLocalWindowAutoArmScheduler {
  const scheduleMicrotask = options.scheduleMicrotask ?? queueMicrotask
  let continuityDocumentIdentity: string | null = null
  let candidate: Candidate | null = null
  let lastCandidateSource: LocalImeLocalWindowFreshAcquisitionSource | null = null
  let pendingToken: number | null = null
  let cancelScheduled: (() => void) | null = null
  let nextToken = 1
  let lifecycleGeneration = 0
  let destroyed = false
  let requestCount = 0
  let cancelCount = 0
  let runCount = 0
  let attemptCount = 0
  let successCount = 0
  let leaseSuppressionCount = 0
  let nonCollapsedSuppressionCount = 0
  let historySuppressionCount = 0
  let staleDocumentCount = 0
  let staleGenerationCount = 0
  let lastOutcome: LocalImeLocalWindowAutoArmOutcome = 'none'
  let bareArrowBoundaryCallCount = 0
  let bareArrowAdapterCount = 0
  let futureBoundaryEntryCallCount = 0
  let boundedBoundaryCallCount = 0
  let boundedBoundaryAttemptCount = 0
  let boundedBoundarySuccessCount = 0
  let lastBoundedBoundaryOutcome: LocalImeLocalWindowAutoArmOutcome = 'none'
  let shrinkBoundaryCallCount = 0
  let shrinkBoundaryAttemptCount = 0
  let shrinkBoundarySuccessCount = 0
  let lastShrinkBoundaryOutcome: LocalImeLocalWindowAutoArmOutcome = 'none'
  let navigationHold: LocalImeLocalWindowHostNavigationToken | null = null
  let navigationHoldBeginCount = 0
  let navigationHoldCancelCount = 0
  let navigationHoldCompleteCount = 0
  let navigationStableCandidateHeld = false
  let hostInputCycle: HostInputCycle | null = null
  let hostInputCycleStartCount = 0
  let hostInputDirectConfirmCount = 0
  let hostInputContentProofCount = 0
  let hostInputSelectionProofCount = 0
  let hostInputCompositionFinalizationCount = 0
  let hostInputAttemptCount = 0
  let hostInputSuccessCount = 0
  let hostInputCancelCount = 0
  let productEntryPointerAssociation: ProductEntryPointerAssociation | null = null
  let productEntryPointerAssociationCount = 0
  let productEntrySelectionProofCount = 0
  let productEntryDomSelectionProofCount = 0
  let productEntryTerminalAwaitingSelectionCount = 0
  let productEntryAttemptCount = 0
  let productEntrySuccessCount = 0
  let productEnableActivationCount = 0
  let productEnableWaitingCount = 0
  let productEnableAttemptCount = 0
  let productEnableSuccessCount = 0
  let pendingTransition: PendingTransition | null = null
  let writingModeTransitionBeginCount = 0
  let writingModeTransitionCompleteCount = 0
  let writingModeTransitionWaitingCount = 0
  let writingModeTransitionAttemptCount = 0
  let writingModeTransitionSuccessCount = 0
  let documentSwitchTransitionBeginCount = 0
  let documentSwitchTransitionCompleteCount = 0
  let documentSwitchTransitionWaitingCount = 0
  let documentSwitchTransitionAttemptCount = 0
  let documentSwitchTransitionSuccessCount = 0

  const sameHostInputCycle = (token: LocalImeHostInputCycleToken): boolean =>
    hostInputCycle !== null &&
    hostInputCycle.token.source === token.source &&
    hostInputCycle.token.cycleId === token.cycleId

  const clearHostInputCycle = (countCancellation: boolean): void => {
    if (hostInputCycle && countCancellation) hostInputCancelCount += 1
    hostInputCycle = null
  }

  const sameNavigationToken = (token: LocalImeLocalWindowHostNavigationToken): boolean =>
    navigationHold !== null &&
    navigationHold.sessionId === token.sessionId &&
    navigationHold.documentIdentity === token.documentIdentity &&
    navigationHold.controllerGeneration === token.controllerGeneration

  const clearNavigationHold = (): void => {
    navigationHold = null
    navigationStableCandidateHeld = false
  }

  const clearProductEntryPointerAssociation = (retainContinuity: boolean): void => {
    const association = productEntryPointerAssociation
    productEntryPointerAssociation = null
    if (
      !retainContinuity &&
      association?.openedContinuity === true &&
      continuityDocumentIdentity === association.documentIdentity
    ) continuityDocumentIdentity = null
  }

  const canCaptureHostInputCycle = (
    snapshot: LocalImeLocalWindowAutoArmSnapshot,
  ): boolean =>
    continuityDocumentIdentity === snapshot.documentIdentity &&
    snapshot.sessionMode === 'off' &&
    snapshot.hostFocused &&
    snapshot.hostSelectionCollapsed &&
    !snapshot.documentActionPending &&
    !snapshot.sourceModeActive &&
    !snapshot.paragraphPlainActive &&
    snapshot.hostViewReady &&
    !snapshot.otherStrategyActive &&
    options.target.canSchedule() &&
    !options.target.isPointerGestureActive() &&
    navigationHold === null

  const discardPending = (): boolean => {
    const hadPending = candidate !== null || pendingToken !== null
    const boundedPending = candidate?.source === 'bounded-boundary'
    const shrinkPending = candidate?.source === 'shrink-boundary'
    candidate = null
    if (pendingToken !== null) {
      pendingToken = null
      cancelScheduled?.()
      cancelScheduled = null
    }
    if (hadPending) {
      cancelCount += 1
      lastOutcome = 'cancelled'
      if (boundedPending) lastBoundedBoundaryOutcome = 'cancelled'
      if (shrinkPending) lastShrinkBoundaryOutcome = 'cancelled'
    }
    return hadPending
  }

  const validateCandidate = (
    current: LocalImeLocalWindowAutoArmSnapshot,
    expected: Candidate,
  ): boolean => {
    if (current.documentIdentity !== expected.documentIdentity) {
      staleDocumentCount += 1
      lastOutcome = 'stale-document'
      return false
    }
    if (current.controllerGeneration !== expected.controllerGeneration) {
      staleGenerationCount += 1
      lastOutcome = 'stale-generation'
      return false
    }
    return true
  }

  const canRunAtSnapshot = (snapshot: LocalImeLocalWindowAutoArmSnapshot): boolean =>
    continuityDocumentIdentity === snapshot.documentIdentity &&
    snapshot.sessionMode === 'off' &&
    snapshot.hostFocused &&
    snapshot.hostSelectionCollapsed &&
    !snapshot.hostCompositionActive &&
    !snapshot.documentActionPending &&
    !snapshot.sourceModeActive &&
    !snapshot.paragraphPlainActive &&
    snapshot.hostViewReady &&
    !snapshot.otherStrategyActive &&
    options.target.canSchedule() &&
    !options.target.isPointerGestureActive() &&
    navigationHold === null

  /**
   * transition token を作れる runtime 条件。明示 ON（`beginProductEnableActivation`）と
   * 同じ集合で、caret / focus はここでは要求しない（完了時点の proof が正本）。
   */
  const canOpenTransition = (snapshot: LocalImeLocalWindowAutoArmSnapshot): boolean =>
    snapshot.sessionMode === 'off' &&
    !snapshot.hostCompositionActive &&
    !snapshot.documentActionPending &&
    !snapshot.sourceModeActive &&
    !snapshot.paragraphPlainActive &&
    snapshot.hostViewReady &&
    !snapshot.otherStrategyActive &&
    options.target.canSchedule() &&
    !options.target.isPointerGestureActive() &&
    navigationHold === null

  const noteTransitionWaiting = (kind: LocalImeLocalWindowTransitionKind): void => {
    if (kind === 'writing-mode') writingModeTransitionWaitingCount += 1
    else documentSwitchTransitionWaitingCount += 1
  }

  const isHostInputSource = (
    source: LocalImeLocalWindowFreshAcquisitionSource,
  ): source is 'host-direct-input' | 'host-ime-input' =>
    source === 'host-direct-input' || source === 'host-ime-input'

  const scheduleCandidate = (): void => {
    if (destroyed || pendingToken !== null || candidate === null) return
    const token = nextToken++
    const scheduledGeneration = lifecycleGeneration
    pendingToken = token
    requestCount += 1
    lastOutcome = 'scheduled'
    cancelScheduled = scheduleMicrotask(() => {
      if (pendingToken !== token) return
      pendingToken = null
      cancelScheduled = null
      runCount += 1
      const expected = candidate
      candidate = null
      if (!expected || destroyed || scheduledGeneration !== lifecycleGeneration) {
        if (expected?.source === 'product-entry') {
          if (
            expected.productEntryOpenedContinuity === true &&
            continuityDocumentIdentity === expected.documentIdentity
          ) continuityDocumentIdentity = null
        }
        lastOutcome = 'cancelled'
        if (expected?.source === 'bounded-boundary') lastBoundedBoundaryOutcome = 'cancelled'
        if (expected?.source === 'shrink-boundary') lastShrinkBoundaryOutcome = 'cancelled'
        return
      }
      if (isHostInputSource(expected.source)) {
        if (
          hostInputCycle === null ||
          expected.hostInputCycleId !== hostInputCycle.token.cycleId ||
          expected.source !== hostInputCycle.token.source
        ) {
          lastOutcome = 'host-input-proof-rejected'
          return
        }
        hostInputAttemptCount += 1
        clearHostInputCycle(false)
      }
      const snapshot = options.target.getSnapshot()
      if (!snapshot) {
        if (
          expected.source === 'product-entry' &&
          expected.productEntryOpenedContinuity === true &&
          continuityDocumentIdentity === expected.documentIdentity
        ) continuityDocumentIdentity = null
        lastOutcome = 'attempt-rejected'
        if (expected.source === 'bounded-boundary') {
          lastBoundedBoundaryOutcome = 'attempt-rejected'
        }
        if (expected.source === 'shrink-boundary') {
          lastShrinkBoundaryOutcome = 'attempt-rejected'
        }
        return
      }
      if (!validateCandidate(snapshot, expected)) {
        if (
          expected.source === 'product-entry' &&
          expected.productEntryOpenedContinuity === true &&
          continuityDocumentIdentity === expected.documentIdentity
        ) continuityDocumentIdentity = null
        if (expected.source === 'bounded-boundary') lastBoundedBoundaryOutcome = lastOutcome
        if (expected.source === 'shrink-boundary') lastShrinkBoundaryOutcome = lastOutcome
        return
      }
      if (!canRunAtSnapshot(snapshot)) {
        if (
          expected.source === 'product-entry' &&
          expected.productEntryOpenedContinuity === true &&
          continuityDocumentIdentity === expected.documentIdentity
        ) continuityDocumentIdentity = null
        lastOutcome = snapshot.hostCompositionActive ? 'composition-held' : 'attempt-rejected'
        if (expected.source === 'bounded-boundary') lastBoundedBoundaryOutcome = lastOutcome
        if (expected.source === 'shrink-boundary') lastShrinkBoundaryOutcome = lastOutcome
        return
      }
      if (
        (expected.source === 'product-entry' ||
          expected.source === 'pointer-selection' ||
          expected.source === 'product-enable' ||
          expected.source === 'writing-mode-complete' ||
          expected.source === 'document-switch-complete') &&
        (!expected.pointerDomSelection ||
          !options.target.proveHostPmDomSelectionAlignment(expected.pointerDomSelection))
      ) {
        if (
          expected.source === 'product-entry' &&
          expected.productEntryOpenedContinuity === true &&
          continuityDocumentIdentity === expected.documentIdentity
        ) continuityDocumentIdentity = null
        lastOutcome = 'pointer-selection-unproven'
        return
      }
      attemptCount += 1
      if (expected.source === 'product-entry') productEntryAttemptCount += 1
      if (expected.source === 'product-enable') productEnableAttemptCount += 1
      if (expected.source === 'writing-mode-complete') writingModeTransitionAttemptCount += 1
      if (expected.source === 'document-switch-complete') {
        documentSwitchTransitionAttemptCount += 1
      }
      if (expected.source === 'bounded-boundary') boundedBoundaryAttemptCount += 1
      if (expected.source === 'shrink-boundary') shrinkBoundaryAttemptCount += 1
      if (options.target.attemptFreshAcquisition({
        documentIdentity: expected.documentIdentity,
        controllerGeneration: expected.controllerGeneration,
      })) {
        successCount += 1
        if (expected.source === 'product-entry') productEntrySuccessCount += 1
        if (expected.source === 'product-enable') productEnableSuccessCount += 1
        if (expected.source === 'writing-mode-complete') writingModeTransitionSuccessCount += 1
        if (expected.source === 'document-switch-complete') {
          documentSwitchTransitionSuccessCount += 1
        }
        if (isHostInputSource(expected.source)) hostInputSuccessCount += 1
        lastOutcome = 'started'
        if (expected.source === 'bounded-boundary') {
          boundedBoundarySuccessCount += 1
          lastBoundedBoundaryOutcome = 'started'
        }
        if (expected.source === 'shrink-boundary') {
          shrinkBoundarySuccessCount += 1
          lastShrinkBoundaryOutcome = 'started'
        }
      } else {
        if (
          expected.source === 'product-entry' &&
          expected.productEntryOpenedContinuity === true &&
          continuityDocumentIdentity === expected.documentIdentity
        ) continuityDocumentIdentity = null
        lastOutcome = 'attempt-rejected'
        if (expected.source === 'bounded-boundary') {
          lastBoundedBoundaryOutcome = 'attempt-rejected'
        }
        if (expected.source === 'shrink-boundary') {
          lastShrinkBoundaryOutcome = 'attempt-rejected'
        }
      }
    }) ?? null
  }

  const holdCandidate = (
    snapshot: LocalImeLocalWindowAutoArmSnapshot,
    source: LocalImeLocalWindowFreshAcquisitionSource,
  ): void => {
    candidate = {
      source,
      documentIdentity: snapshot.documentIdentity,
      controllerGeneration: snapshot.controllerGeneration,
    }
    lastCandidateSource = source
    lastOutcome = 'candidate-held'
  }

  const scheduleHostInputIfComplete = (): void => {
    const cycle = hostInputCycle
    if (!cycle || destroyed) return
    if (cycle.token.source === 'host-direct-input' && !cycle.directInputConfirmed) {
      lastOutcome = 'host-input-held'
      return
    }
    if (cycle.token.source === 'host-ime-input' && !cycle.compositionFinalized) {
      lastOutcome = 'composition-held'
      return
    }
    if (
      cycle.contentRootTransaction === null ||
      cycle.stableRootTransaction !== cycle.contentRootTransaction
    ) {
      lastOutcome = 'host-input-held'
      return
    }
    const snapshot = options.target.getSnapshot()
    if (!snapshot) {
      clearHostInputCycle(true)
      lastOutcome = 'host-input-proof-rejected'
      return
    }
    if (
      snapshot.documentIdentity !== cycle.documentIdentity ||
      snapshot.controllerGeneration !== cycle.controllerGeneration
    ) {
      if (snapshot.documentIdentity !== cycle.documentIdentity) staleDocumentCount += 1
      else staleGenerationCount += 1
      clearHostInputCycle(true)
      lastOutcome = 'host-input-proof-rejected'
      return
    }
    candidate = {
      source: cycle.token.source,
      documentIdentity: cycle.documentIdentity,
      controllerGeneration: cycle.controllerGeneration,
      hostInputCycleId: cycle.token.cycleId,
    }
    lastCandidateSource = cycle.token.source
    lastOutcome = 'candidate-held'
    scheduleCandidate()
  }

  return {
    noteSuccessfulStart() {
      if (destroyed) return
      const snapshot = options.target.getSnapshot()
      if (!snapshot) return
      continuityDocumentIdentity = snapshot.documentIdentity
      lastOutcome = 'continuity-enabled'
    },
    beginProductEntryPointerAssociation() {
      if (destroyed) return false
      const snapshot = options.target.getSnapshot()
      if (!snapshot) return false
      // pointerdownはassociation hintに限定する。この時点ではfocus / selectionが旧値でも
      // よく、実host selection transactionとpointer terminalが後続authorityになる。
      if (
        snapshot.sessionMode !== 'off' ||
        snapshot.hostCompositionActive ||
        snapshot.documentActionPending ||
        snapshot.sourceModeActive ||
        snapshot.paragraphPlainActive ||
        !snapshot.hostViewReady ||
        snapshot.otherStrategyActive ||
        !options.target.canSchedule() ||
        navigationHold !== null
      ) {
        lastOutcome = snapshot.hostCompositionActive
          ? 'composition-held'
          : 'attempt-rejected'
        return false
      }
      lifecycleGeneration += 1
      discardPending()
      clearHostInputCycle(true)
      clearProductEntryPointerAssociation(false)
      pendingTransition = null
      const openedContinuity = continuityDocumentIdentity !== snapshot.documentIdentity
      continuityDocumentIdentity = snapshot.documentIdentity
      productEntryPointerAssociation = {
        documentIdentity: snapshot.documentIdentity,
        controllerGeneration: snapshot.controllerGeneration,
        openedContinuity,
        terminalDomSelection: null,
      }
      productEntryPointerAssociationCount += 1
      lastOutcome = 'pointer-associated'
      return true
    },
    beginProductEnableActivation() {
      if (destroyed) return false
      const snapshot = options.target.getSnapshot()
      if (!snapshot) return false
      // 明示 ON でも、runtime が安全でない状況では continuity を開かない。
      // recovery 未解決の ON は上流 (`canEnableLocalImeLocalWindowRuntime`) で拒否済み。
      if (
        snapshot.sessionMode !== 'off' ||
        snapshot.hostCompositionActive ||
        snapshot.documentActionPending ||
        snapshot.sourceModeActive ||
        snapshot.paragraphPlainActive ||
        !snapshot.hostViewReady ||
        snapshot.otherStrategyActive ||
        !options.target.canSchedule() ||
        options.target.isPointerGestureActive() ||
        navigationHold !== null
      ) {
        lastOutcome = snapshot.hostCompositionActive
          ? 'composition-held'
          : 'attempt-rejected'
        return false
      }
      // 明示 ON は current document の continuity を開く（保存済み設定復元 /
      // initial load はこの経路を通らないので Start 0 のまま）。
      lifecycleGeneration += 1
      discardPending()
      clearHostInputCycle(true)
      clearProductEntryPointerAssociation(false)
      pendingTransition = null
      continuityDocumentIdentity = snapshot.documentIdentity
      productEnableActivationCount += 1
      lastOutcome = 'product-enable-continuity-opened'

      // 現在 caret を証明できるときだけ、既存 scheduler へ exact-one candidate を載せる。
      // focus / collapsed が取れない（設定 modal 等）場合は waiting のままにし、
      // blind な focus 移動や Start は行わない。
      if (!snapshot.hostFocused || !snapshot.hostSelectionCollapsed) {
        productEnableWaitingCount += 1
        return true
      }
      const domSelection = options.target.captureHostDomCollapsedSelection()
      if (
        !domSelection ||
        !options.target.proveHostPmDomSelectionAlignment(domSelection)
      ) {
        productEnableWaitingCount += 1
        lastOutcome = 'product-enable-selection-unproven'
        return true
      }
      candidate = {
        source: 'product-enable',
        documentIdentity: snapshot.documentIdentity,
        controllerGeneration: snapshot.controllerGeneration,
        pointerDomSelection: domSelection,
      }
      lastCandidateSource = 'product-enable'
      scheduleCandidate()
      return true
    },
    beginTransition(kind) {
      if (destroyed) return false
      const snapshot = options.target.getSnapshot()
      if (!snapshot) return false
      // 当該起動内で continuity が既に成立している document だけが対象。
      // 保存済み ON の initial load はここで弾かれ、Start 0 のままになる。
      if (continuityDocumentIdentity !== snapshot.documentIdentity) {
        lastOutcome = 'initial-load-blocked'
        return false
      }
      if (!canOpenTransition(snapshot)) {
        lastOutcome = snapshot.hostCompositionActive
          ? 'composition-held'
          : 'transition-rejected'
        return false
      }
      // token は常に高々 1 件。後着の明示操作が先行 token を置き換える。
      pendingTransition = {
        kind,
        documentIdentity: snapshot.documentIdentity,
        controllerGeneration: snapshot.controllerGeneration,
        writingMode: kind === 'writing-mode' ? options.target.readHostWritingMode() : null,
      }
      if (kind === 'writing-mode') writingModeTransitionBeginCount += 1
      else documentSwitchTransitionBeginCount += 1
      lastOutcome = 'transition-held'
      return true
    },
    cancelTransition(kind) {
      if (pendingTransition?.kind !== kind) return
      pendingTransition = null
      lastOutcome = 'cancelled'
    },
    completeTransition(kind, expectedWritingMode) {
      if (destroyed) return false
      const pending = pendingTransition
      // kind 不一致の token は消費しない（別操作の bounded token を横取りしない）。
      if (!pending || pending.kind !== kind) return false
      pendingTransition = null
      if (kind === 'writing-mode') writingModeTransitionCompleteCount += 1
      else documentSwitchTransitionCompleteCount += 1
      const snapshot = options.target.getSnapshot()
      if (!snapshot) {
        lastOutcome = 'transition-rejected'
        return false
      }
      if (kind === 'writing-mode') {
        // 同一 document 上の切替。identity / generation / continuity が動いていたら stale。
        if (snapshot.documentIdentity !== pending.documentIdentity) {
          staleDocumentCount += 1
          lastOutcome = 'stale-document'
          return false
        }
        if (snapshot.controllerGeneration !== pending.controllerGeneration) {
          staleGenerationCount += 1
          lastOutcome = 'stale-generation'
          return false
        }
        if (continuityDocumentIdentity !== snapshot.documentIdentity) {
          lastOutcome = 'initial-load-blocked'
          return false
        }
        // 実 computed writing-mode が本当に変わったことだけを完了 proof にする。
        const writingMode = options.target.readHostWritingMode()
        if (!writingMode || writingMode === pending.writingMode) {
          lastOutcome = 'transition-rejected'
          return false
        }
      } else {
        // 実 load 成功の proof は新しい document identity。初期 load / 失敗 load では
        // identity が動かないので、その場合は continuity を開かない。
        if (snapshot.documentIdentity === pending.documentIdentity) {
          lastOutcome = 'transition-rejected'
          return false
        }
        // 新文書の実効書字方向へ host の実 computed writing-mode が収束してから
        // だけ取得する（vertical → horizontal 等の切替で旧方向 slot を作らない）。
        if (
          !expectedWritingMode ||
          options.target.readHostWritingMode() !== expectedWritingMode
        ) {
          lastOutcome = 'transition-rejected'
          return false
        }
      }
      if (!canOpenTransition(snapshot)) {
        lastOutcome = snapshot.hostCompositionActive
          ? 'composition-held'
          : 'transition-rejected'
        return false
      }
      lifecycleGeneration += 1
      discardPending()
      clearHostInputCycle(true)
      clearProductEntryPointerAssociation(false)
      continuityDocumentIdentity = snapshot.documentIdentity
      lastOutcome = 'transition-continuity-opened'
      // 現在 caret を証明できるときだけ exact-one candidate を積む。証明できない
      // （focus 不在 / range / ineligible）場合は waiting のまま Start 0 を維持し、
      // blind な focus 移動や caret 移動は行わない。
      if (!snapshot.hostFocused || !snapshot.hostSelectionCollapsed) {
        noteTransitionWaiting(kind)
        return true
      }
      const domSelection = options.target.captureHostDomCollapsedSelection()
      if (
        !domSelection ||
        !options.target.proveHostPmDomSelectionAlignment(domSelection)
      ) {
        noteTransitionWaiting(kind)
        lastOutcome = 'transition-selection-unproven'
        return true
      }
      const source: LocalImeLocalWindowFreshAcquisitionSource =
        kind === 'writing-mode' ? 'writing-mode-complete' : 'document-switch-complete'
      candidate = {
        source,
        documentIdentity: snapshot.documentIdentity,
        controllerGeneration: snapshot.controllerGeneration,
        pointerDomSelection: domSelection,
      }
      lastCandidateSource = source
      scheduleCandidate()
      return true
    },
    disableContinuity() {
      lifecycleGeneration += 1
      discardPending()
      clearNavigationHold()
      clearHostInputCycle(true)
      clearProductEntryPointerAssociation(false)
      pendingTransition = null
      continuityDocumentIdentity = null
    },
    notifyHostSelectionStablePoint(fromHistory = false) {
      if (destroyed) return
      if (fromHistory) {
        discardPending()
        clearHostInputCycle(true)
        clearProductEntryPointerAssociation(false)
        historySuppressionCount += 1
        lastOutcome = 'history-suppressed'
        return
      }
      const snapshot = options.target.getSnapshot()
      if (!snapshot) return
      if (hostInputCycle) {
        clearProductEntryPointerAssociation(false)
        clearHostInputCycle(true)
        lastOutcome = 'host-input-proof-rejected'
        return
      }
      if (continuityDocumentIdentity !== snapshot.documentIdentity) {
        lastOutcome = 'initial-load-blocked'
        return
      }
      if (snapshot.sessionMode !== 'off') return
      if (!snapshot.hostSelectionCollapsed) {
        discardPending()
        clearProductEntryPointerAssociation(false)
        nonCollapsedSuppressionCount += 1
        lastOutcome = 'non-collapsed'
        return
      }
      const pointerActive = options.target.isPointerGestureActive()
      if (snapshot.hostCompositionActive) {
        discardPending()
        clearProductEntryPointerAssociation(false)
        lastOutcome = 'composition-held'
        return
      }
      holdCandidate(
        snapshot,
        navigationHold !== null
          ? 'host-navigation'
          : productEntryPointerAssociation !== null
            ? 'product-entry'
            : pointerActive
              ? 'pointer-selection'
              : 'host-selection',
      )
      if (candidate?.source === 'product-entry' && productEntryPointerAssociation) {
        candidate.productEntryOpenedContinuity = productEntryPointerAssociation.openedContinuity
        productEntrySelectionProofCount += 1
      }
      if (navigationHold !== null) {
        navigationStableCandidateHeld = true
        lastOutcome = 'navigation-held'
        return
      }
      if (pointerActive) {
        leaseSuppressionCount += 1
        lastOutcome = 'lease-held'
        return
      }
      if (candidate?.source === 'product-entry' && productEntryPointerAssociation) {
        const terminalDomSelection = productEntryPointerAssociation.terminalDomSelection
        if (
          !terminalDomSelection ||
          !options.target.proveHostPmDomSelectionAlignment(terminalDomSelection)
        ) {
          lifecycleGeneration += 1
          discardPending()
          clearProductEntryPointerAssociation(false)
          lastOutcome = 'pointer-selection-unproven'
          return
        }
        candidate.pointerDomSelection = terminalDomSelection
        productEntryDomSelectionProofCount += 1
        clearProductEntryPointerAssociation(true)
      }
      scheduleCandidate()
    },
    notifyHostInputCycleStart(cycle) {
      if (destroyed) return
      clearProductEntryPointerAssociation(false)
      // host 入力が始まった時点で、未消費の明示操作 token は破棄する。
      pendingTransition = null
      const snapshot = options.target.getSnapshot()
      if (!snapshot || !canCaptureHostInputCycle(snapshot)) {
        clearHostInputCycle(true)
        lastOutcome = 'host-input-proof-rejected'
        return
      }
      lifecycleGeneration += 1
      discardPending()
      clearHostInputCycle(true)
      hostInputCycle = {
        token: cycle,
        documentIdentity: snapshot.documentIdentity,
        controllerGeneration: snapshot.controllerGeneration,
        directInputConfirmed: false,
        compositionFinalized: false,
        contentRootTransaction: null,
        stableRootTransaction: null,
      }
      hostInputCycleStartCount += 1
      lastOutcome = 'host-input-held'
    },
    notifyHostDirectInputConfirmed(cycle) {
      if (destroyed || cycle.source !== 'host-direct-input' || !sameHostInputCycle(cycle)) return
      hostInputCycle!.directInputConfirmed = true
      hostInputDirectConfirmCount += 1
      lastOutcome = 'host-input-confirmed'
      scheduleHostInputIfComplete()
    },
    notifyHostInputSelectionStablePoint(notice) {
      if (destroyed || !sameHostInputCycle(notice.cycle)) return
      if (hostInputCycle!.contentRootTransaction !== notice.rootTransaction) {
        clearHostInputCycle(true)
        lastOutcome = 'host-input-proof-rejected'
        return
      }
      hostInputCycle!.stableRootTransaction = notice.rootTransaction
      hostInputSelectionProofCount += 1
      scheduleHostInputIfComplete()
    },
    cancelHostInputCycle(cycle) {
      if (!sameHostInputCycle(cycle)) return
      lifecycleGeneration += 1
      discardPending()
      clearHostInputCycle(true)
      lastOutcome = 'host-input-proof-rejected'
    },
    notifyHostContentChange(proof) {
      lifecycleGeneration += 1
      discardPending()
      clearProductEntryPointerAssociation(false)
      if (
        !proof ||
        proof.fromHistory ||
        (!proof.rootDocChanged && proof.appendedDocChangedCount === 0) ||
        !sameHostInputCycle(proof.cycle)
      ) {
        clearHostInputCycle(true)
        return
      }
      const snapshot = options.target.getSnapshot()
      if (
        !snapshot ||
        snapshot.documentIdentity !== hostInputCycle!.documentIdentity ||
        snapshot.controllerGeneration !== hostInputCycle!.controllerGeneration
      ) {
        clearHostInputCycle(true)
        lastOutcome = 'host-input-proof-rejected'
        return
      }
      hostInputCycle!.contentRootTransaction = proof.rootTransaction
      hostInputCycle!.stableRootTransaction = null
      hostInputContentProofCount += 1
      lastOutcome = 'host-input-held'
    },
    notifyHostCompositionStart(cycle) {
      lifecycleGeneration += 1
      discardPending()
      clearProductEntryPointerAssociation(false)
      pendingTransition = null
      if (!cycle || cycle.source !== 'host-ime-input' || !sameHostInputCycle(cycle)) {
        clearHostInputCycle(true)
      }
    },
    notifyHostCompositionEnd(cycle) {
      if (destroyed || !cycle || cycle.source !== 'host-ime-input' || !sameHostInputCycle(cycle)) return
      if (hostInputCycle!.compositionFinalized) return
      const snapshot = options.target.getSnapshot()
      if (
        !snapshot ||
        snapshot.hostCompositionActive ||
        snapshot.documentIdentity !== hostInputCycle!.documentIdentity ||
        snapshot.controllerGeneration !== hostInputCycle!.controllerGeneration
      ) {
        clearHostInputCycle(true)
        lastOutcome = 'host-input-proof-rejected'
        return
      }
      hostInputCycle!.compositionFinalized = true
      hostInputCompositionFinalizationCount += 1
      lastOutcome = 'host-input-finalized'
      scheduleHostInputIfComplete()
    },
    notifyPointerLeaseTerminal(completed) {
      if (hostInputCycle) clearHostInputCycle(true)
      const expected = candidate
      const pointerCandidate =
        expected?.source === 'pointer-selection' || expected?.source === 'product-entry'
      if (destroyed || (!pointerCandidate && productEntryPointerAssociation === null)) return
      if (!completed) {
        lifecycleGeneration += 1
        discardPending()
        clearProductEntryPointerAssociation(false)
        return
      }
      const terminalDomSelection = options.target.captureHostDomCollapsedSelection()
      if (!terminalDomSelection) {
        lifecycleGeneration += 1
        discardPending()
        clearProductEntryPointerAssociation(false)
        lastOutcome = 'pointer-selection-unproven'
        return
      }
      if (!pointerCandidate) {
        productEntryTerminalAwaitingSelectionCount += 1
        if (productEntryPointerAssociation) {
          productEntryPointerAssociation.terminalDomSelection = terminalDomSelection
          lastOutcome = 'pointer-associated'
        }
        return
      }
      const snapshot = options.target.getSnapshot()
      if (!snapshot || options.target.isPointerGestureActive()) {
        clearProductEntryPointerAssociation(false)
        return
      }
      if (!expected || !validateCandidate(snapshot, expected)) {
        candidate = null
        clearProductEntryPointerAssociation(false)
        return
      }
      if (!options.target.proveHostPmDomSelectionAlignment(terminalDomSelection)) {
        lifecycleGeneration += 1
        discardPending()
        clearProductEntryPointerAssociation(false)
        lastOutcome = 'pointer-selection-unproven'
        return
      }
      expected.pointerDomSelection = terminalDomSelection
      if (expected.source === 'product-entry') productEntryDomSelectionProofCount += 1
      clearProductEntryPointerAssociation(true)
      scheduleCandidate()
    },
    requestBoundaryFreshAcquisition(proof) {
      if (destroyed || proof.status !== 'exact-one-success') return
      clearHostInputCycle(true)
      if (proof.source === 'arrow-boundary') bareArrowBoundaryCallCount += 1
      else futureBoundaryEntryCallCount += 1
      if (proof.source === 'bounded-boundary') boundedBoundaryCallCount += 1
      if (proof.source === 'shrink-boundary') shrinkBoundaryCallCount += 1
      const snapshot = options.target.getSnapshot()
      if (!snapshot) {
        if (proof.source === 'bounded-boundary') {
          lastBoundedBoundaryOutcome = 'attempt-rejected'
        }
        if (proof.source === 'shrink-boundary') {
          lastShrinkBoundaryOutcome = 'attempt-rejected'
        }
        return
      }
      if (continuityDocumentIdentity !== proof.documentIdentity) {
        lastOutcome = 'initial-load-blocked'
        if (proof.source === 'bounded-boundary') lastBoundedBoundaryOutcome = lastOutcome
        if (proof.source === 'shrink-boundary') lastShrinkBoundaryOutcome = lastOutcome
        return
      }
      if (snapshot.documentIdentity !== proof.documentIdentity) {
        staleDocumentCount += 1
        lastOutcome = 'stale-document'
        if (proof.source === 'bounded-boundary') lastBoundedBoundaryOutcome = lastOutcome
        if (proof.source === 'shrink-boundary') lastShrinkBoundaryOutcome = lastOutcome
        return
      }
      if (snapshot.controllerGeneration !== proof.controllerGeneration) {
        staleGenerationCount += 1
        lastOutcome = 'stale-generation'
        if (proof.source === 'bounded-boundary') lastBoundedBoundaryOutcome = lastOutcome
        if (proof.source === 'shrink-boundary') lastShrinkBoundaryOutcome = lastOutcome
        return
      }
      // 同期 selection callback が先に候補を積んでいても、boundary proof を診断上の
      // 正本へ昇格するだけで microtask は増やさない。
      holdCandidate(snapshot, proof.source)
      if (proof.source === 'bounded-boundary') lastBoundedBoundaryOutcome = 'candidate-held'
      if (proof.source === 'shrink-boundary') lastShrinkBoundaryOutcome = 'candidate-held'
      if (snapshot.hostCompositionActive) {
        lastOutcome = 'composition-held'
        if (proof.source === 'bounded-boundary') lastBoundedBoundaryOutcome = lastOutcome
        if (proof.source === 'shrink-boundary') lastShrinkBoundaryOutcome = lastOutcome
        return
      }
      if (options.target.isPointerGestureActive()) {
        leaseSuppressionCount += 1
        lastOutcome = 'lease-held'
        if (proof.source === 'bounded-boundary') lastBoundedBoundaryOutcome = lastOutcome
        if (proof.source === 'shrink-boundary') lastShrinkBoundaryOutcome = lastOutcome
        return
      }
      scheduleCandidate()
    },
    noteBareArrowAdapterCall() {
      bareArrowAdapterCount += 1
    },
    beginHostNavigationHold(token) {
      if (destroyed || navigationHold !== null) return false
      clearProductEntryPointerAssociation(false)
      const snapshot = options.target.getSnapshot()
      if (
        !snapshot ||
        continuityDocumentIdentity !== token.documentIdentity ||
        snapshot.documentIdentity !== token.documentIdentity ||
        snapshot.controllerGeneration !== token.controllerGeneration
      ) {
        lastOutcome = 'navigation-rejected'
        return false
      }
      lifecycleGeneration += 1
      discardPending()
      clearHostInputCycle(true)
      navigationHold = token
      navigationStableCandidateHeld = false
      navigationHoldBeginCount += 1
      lastOutcome = 'navigation-held'
      return true
    },
    cancelHostNavigationHold(token) {
      if (!sameNavigationToken(token)) return
      lifecycleGeneration += 1
      discardPending()
      clearHostInputCycle(true)
      clearNavigationHold()
      navigationHoldCancelCount += 1
      lastOutcome = 'cancelled'
    },
    completeHostNavigationHold(token) {
      if (destroyed || !sameNavigationToken(token)) return false
      // hold中に積んだcandidateはcoarse tokenだけでも、古いadapter直後stateは
      // completion authorityにしない。必ず現在snapshotから作り直す。
      lifecycleGeneration += 1
      discardPending()
      clearHostInputCycle(true)
      const snapshot = options.target.getSnapshot()
      clearNavigationHold()
      navigationHoldCompleteCount += 1
      if (!snapshot || !validateCandidate(snapshot, {
        source: 'host-navigation',
        documentIdentity: token.documentIdentity,
        controllerGeneration: token.controllerGeneration,
      })) {
        lastOutcome = 'navigation-rejected'
        return false
      }
      if (!canRunAtSnapshot(snapshot)) {
        lastOutcome = snapshot.hostCompositionActive ? 'composition-held' : 'navigation-rejected'
        return false
      }
      holdCandidate(snapshot, 'host-navigation')
      scheduleCandidate()
      lastOutcome = 'navigation-completed'
      return true
    },
    resetDocument() {
      lifecycleGeneration += 1
      discardPending()
      clearNavigationHold()
      clearHostInputCycle(true)
      clearProductEntryPointerAssociation(false)
      continuityDocumentIdentity = null
    },
    cancelPending() {
      lifecycleGeneration += 1
      discardPending()
      clearHostInputCycle(true)
      clearProductEntryPointerAssociation(false)
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      lifecycleGeneration += 1
      discardPending()
      clearNavigationHold()
      clearHostInputCycle(true)
      clearProductEntryPointerAssociation(false)
      pendingTransition = null
      continuityDocumentIdentity = null
    },
    diagnostics: () => ({
      continuityEnabled: continuityDocumentIdentity !== null,
      pendingCandidate: candidate !== null,
      pendingMicrotask: pendingToken !== null,
      candidateSource: candidate?.source ?? lastCandidateSource,
      requestCount,
      cancelCount,
      runCount,
      attemptCount,
      successCount,
      leaseSuppressionCount,
      nonCollapsedSuppressionCount,
      historySuppressionCount,
      staleDocumentCount,
      staleGenerationCount,
      lastOutcome,
      bareArrowBoundaryCallCount,
      bareArrowAdapterCount,
      futureBoundaryEntryCallCount,
      boundedBoundaryCallCount,
      boundedBoundaryAttemptCount,
      boundedBoundarySuccessCount,
      lastBoundedBoundaryOutcome,
      shrinkBoundaryCallCount,
      shrinkBoundaryAttemptCount,
      shrinkBoundarySuccessCount,
      lastShrinkBoundaryOutcome,
      navigationHoldActive: navigationHold !== null,
      navigationHoldBeginCount,
      navigationHoldCancelCount,
      navigationHoldCompleteCount,
      navigationStableCandidateHeld,
      hostInputCycleActive: hostInputCycle !== null,
      hostInputCycleSource: hostInputCycle?.token.source ?? null,
      hostInputCycleStartCount,
      hostInputDirectConfirmCount,
      hostInputContentProofCount,
      hostInputSelectionProofCount,
      hostInputCompositionFinalizationCount,
      hostInputAttemptCount,
      hostInputSuccessCount,
      hostInputCancelCount,
      productEntryPointerAssociationCount,
      productEntrySelectionProofCount,
      productEntryDomSelectionProofCount,
      productEntryTerminalAwaitingSelectionCount,
      productEntryAttemptCount,
      productEntrySuccessCount,
      productEnableActivationCount,
      productEnableWaitingCount,
      productEnableAttemptCount,
      productEnableSuccessCount,
      pendingTransitionKind: pendingTransition?.kind ?? null,
      writingModeTransitionBeginCount,
      writingModeTransitionCompleteCount,
      writingModeTransitionWaitingCount,
      writingModeTransitionAttemptCount,
      writingModeTransitionSuccessCount,
      documentSwitchTransitionBeginCount,
      documentSwitchTransitionCompleteCount,
      documentSwitchTransitionWaitingCount,
      documentSwitchTransitionAttemptCount,
      documentSwitchTransitionSuccessCount,
    }),
  }
}
