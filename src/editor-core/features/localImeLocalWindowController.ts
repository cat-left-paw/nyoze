import { history, redo, redoDepth, undo, undoDepth } from '@tiptap/pm/history'
import { keymap } from '@tiptap/pm/keymap'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { EditorState, Plugin, TextSelection, type Transaction } from '@tiptap/pm/state'
import { baseKeymap } from '@tiptap/pm/commands'
import { EditorView } from '@tiptap/pm/view'
import type {
  LocalImeDocumentActionPreparation,
  LocalImeInputSessionMode,
  LocalImeInputSessionStartResult,
} from './localImeInputSessionState'
import { flushLocalImePendingDomChanges } from './localImePendingDomFlush'
import {
  captureLocalImeLocalWindow,
  LOCAL_IME_LOCAL_WINDOW_CAPTURE_MAX_BLOCKS,
  LOCAL_IME_LOCAL_WINDOW_GROWTH_HARD_CAP,
  LOCAL_IME_LOCAL_WINDOW_MIN_BLOCKS,
  proveLocalImeLocalWindowBaseIsCurrent,
  type LocalImeLocalWindowAcquisitionMode,
  type LocalImeLocalWindowBase,
} from './localImeLocalWindowState'
import { acquireLocalImeLocalWindowCapturePlan } from './localImeLocalWindowAcquisition'
import {
  areLocalImeLocalWindowSpecialInlinesPreserved,
  collectLocalImeLocalWindowSpecialInlines,
  isLocalImeLocalWindowCapableDoc,
} from './localImeLocalWindowCapability'
import { isLocalImeLocalWindowAllowedLocalSelection } from './localImeLocalWindowCaretCapability'
import {
  isLocalImeLocalWindowBareArrowCandidate,
  resolveLocalImeLocalWindowSpecialInlineArrowHandoff,
  resolveLocalImeLocalWindowSpecialInlineBoundaryLanding,
  LOCAL_IME_LOCAL_WINDOW_SPECIAL_INLINE_HANDOFF_REASON,
} from './localImeLocalWindowSpecialInlineHandoff'
import {
  createInlineMarkInputRulesPlugin,
  undoInlineMarkInputRule,
} from './inlineMarkInputRules'
import {
  buildLocalImeLocalWindowCommit,
  classifyLocalImeLocalWindowDispatchException,
  proveLocalImeLocalWindowOutsideRangeUnchanged,
} from './localImeLocalWindowCommit'
import {
  captureLocalImeLocalWindowDomProof,
  readLocalImeLocalWindowRect,
  validateLocalImeLocalWindowDomProof,
  type LocalImeLocalWindowDomProof,
} from './localImeLocalWindowDomProof'
import { resolveLocalImeLocalEditorViewEmptyCaretAnchor } from './localImeLocalEditorViewEmptyCaretAnchor'
import type { LocalImeLocalWindowPseudoCaretGeometrySource } from './localImePseudoCaretGeometrySource'
import {
  computeLocalImeLocalWindowGrowthDelta,
  measureLocalImeLocalWindowBlockRectUnion,
} from './localImeLocalWindowGeometry'
import {
  localImeLocalWindowShrinkTolerancePx,
  resolveLocalImeLocalWindowShrinkBoundary,
} from './localImeLocalWindowShrinkBoundary'
import {
  resolveLocalImeLocalWindowPointerHostFirst,
  type LocalImeLocalWindowPointerHostFirstDecision,
} from './localImeLocalWindowPointerHandoff'
import {
  applyLocalImeLocalWindowHostSelectAll,
  isHostFullDocumentAllSelection,
  isLocalImeLocalWindowRootDomFocused,
  isLocalImeLocalWindowShiftArrowCandidate,
  planLocalImeLocalWindowMappedCaretRestore,
  restoreLocalImeLocalWindowMappedHostCaret,
  LOCAL_IME_LOCAL_WINDOW_SELECT_ALL_HANDOFF_REASON,
  LOCAL_IME_LOCAL_WINDOW_SHIFT_ARROW_HANDOFF_REASON,
  resolveLocalImeLocalWindowSelectAllHandoff,
  resolveLocalImeLocalWindowShiftArrowCloseCheckpoint,
  resolveLocalImeLocalWindowShiftArrowHandoff,
  runLocalImeLocalWindowShiftArrowAfterClose,
  type LocalImeLocalWindowCloseHandoffProof,
  type LocalImeLocalWindowHostTransactionSlice,
  type WritingModeArrowOperation,
} from './localImeLocalWindowKeyboardHandoff'
import {
  LOCAL_IME_LOCAL_WINDOW_ARROW_BOUNDARY_REASON,
  resolveLocalImeLocalWindowArrowBoundaryExit,
  runLocalImeLocalWindowArrowBoundaryAfterClose,
} from './localImeLocalWindowArrowBoundary'
import {
  LOCAL_IME_LOCAL_WINDOW_HOST_NAV_KEY_REASON,
  isLocalImeLocalWindowHostNavKeyCandidate,
  isLocalImeLocalWindowHostNavKeyOperation,
  resolveLocalImeLocalWindowHostNavKeyExit,
  runLocalImeLocalWindowHostNavKeyAfterClose,
  type LocalImeLocalWindowHostNavKey,
  type LocalImeLocalWindowHostNavKeyOperation,
} from './localImeLocalWindowHostNavKeyBoundary'
import {
  _getHomeEndState,
  applyHomeEndNavigationDomAffinity,
  notifySelectionChanged as notifyHostHomeEndSelectionChanged,
  resetHomeEndState,
  runWithHomeEndSelectionMutation,
} from './homeEndNavigation'
import type {
  LocalImeLocalWindowHostNavigationCancellationReason,
  LocalImeLocalWindowHostNavigationInitialResult,
  LocalImeLocalWindowHostNavigationToken,
  LocalWindowNavigationSessionStartKey,
} from './localImeLocalWindowHostNavigationSession'
import type { LocalImeHostContentChangeNotice } from './localImeHostTransactionNotice'
import {
  isWritingModeLineAxisOperation,
  resolveSupportedEditorWritingMode,
  resolveWritingModeLogicalBlockAxis,
  writingModeArrowOperationToKey,
  type SupportedEditorWritingMode,
} from './writingModeArrowNavigationState'
import {
  classifyLocalImeHistoryShortcut,
  toLocalImeHistoryShortcutProbe,
  resolveLocalImeHistoryHandoff,
  type LocalImeHistoryOperation,
} from './localImeHistoryHandoffState'
import { readRequestedHostHistoryDepth } from './hostHistoryCommand'
import {
  LOCAL_IME_LOCAL_WINDOW_HISTORY_HANDOFF_REASON,
  runLocalImeLocalWindowHostHistoryCommand,
  type LocalImeHostHistoryTransactionBatch,
  type LocalImeLocalWindowHostHistoryResult,
} from './localImeLocalWindowHistoryHandoff'
import { PROSEMIRROR_HISTORY_META_KEY } from './localImeHistoryTransaction'
import {
  resolveLocalImeLocalWindowReservationOwner,
  type LocalImeLocalWindowReservationOwner,
} from '../extensions/localImeLocalWindowReservationDecoration'
// LOCAL-WINDOW-RUBY-PUNCT-NOWRAP1: host PMと同一のRuby直後約物nowrap plugin。
// 検出器・Decoration・plugin view・DOM wrapper controllerはhostの正本をそのまま使い、
// Local Window専用のscanner / regex / wrapper controller / CSSは作らない。
import {
  createRubyPunctuationNowrapPlugin,
  rubyPunctuationNowrapPluginKey,
  RUBY_PUNCT_RUN_WRAPPER_CLASS,
} from '../extensions/rubyPunctuationNowrap'
import { parseCssFontSizeToPx, parseCssLineHeightToPx } from './overlayReservedBlockLayout'
import type { LocalImeEditMenuCommandResult, LocalImeEditMenuOperation } from './localImeEditMenuCommandState'
import {
  readLocalImeNavigationPerformanceSelectionSnapshot,
  type LocalImeNavigationPerformanceSelectionSnapshot,
} from './localImeNavigationPerformanceSnapshot'

type Mode = 'off' | 'active-clean' | 'active-dirty' | 'composing' | 'closing' | 'recovery-required'
type Failure =
  | 'none'
  | 'dispatch-before'
  | 'dispatch-after'
  | 'dispatch-drop'
  | 'dispatch-extra'
  | 'dispatch-docchanged'
  | 'dispatch-reentrant-local'
  | 'dispatch-selection-mismatch'
  | 'bounded-post-proof-failure'
  | 'shrink-post-proof-failure'
  | 'stale-document'
  | 'stale-generation'
  | 'host-content-collision'
  | 'inject-change-during-flush'
  | 'adapter-drop'
  | 'adapter-extra'
  | 'adapter-docchanged'
  | 'adapter-selection-mismatch'
  | 'adapter-display-state-change'
  | 'history-dirty-without-depth'
  | 'history-dirty-during-close'
  | 'history-base-failure-during-close'
  | 'history-command-rejected'
  | 'history-dispatch-drop'
  | 'history-dispatch-extra'
  | 'history-dispatch-exception'
  | 'history-dispatch-after-exception'
  | 'history-appended-docchanged'
  | 'history-meta-missing'
  | 'history-doc-mismatch'
  | 'history-selection-mismatch'
  | 'history-availability-changed'
export type LocalImeLocalWindowFailureForTest = Failure
export type LocalImeLocalWindowHostContentChangeForTest = 'root' | 'appended'
type ClosingPhase = 'idle' | 'dom-flush' | 'frozen' | 'host-dispatch' | 'host-applied'
type RecoveryIntent =
  | 'dispatch-before-apply'
  | 'dispatch-after-apply'
  | 'stale-base'
  | 'host-content-change'
  | 'pending-dom-flush'
  | 'document-change'
  | 'destroy'
  | 'invalid-local-state'

const LOCAL_IME_LOCAL_WINDOW_BOUNDED_BOUNDARY_REASON = 'local-window-bounded-boundary'
const LOCAL_IME_LOCAL_WINDOW_SHRINK_BOUNDARY_REASON = 'local-window-shrink-boundary'
/** RECOVERY-RESTART1: 明示Retryのclose理由。元のsave / tab / load等は再実行しない。 */
export const LOCAL_IME_LOCAL_WINDOW_RECOVERY_RETRY_REASON = 'local-window-recovery-retry'

/** RECOVERY-RESTART1: pure Retry判定へ渡す同期probe（固定enum / booleanだけ）。 */
export type LocalImeLocalWindowRecoveryProbe = {
  readonly recoveryIntent: RecoveryIntent | null
  readonly dispatchDisposition: 'none' | 'before-apply' | 'after-apply'
  readonly compositionActive: boolean
  readonly compositionFinalizationPending: boolean
  readonly draftRetained: boolean
  readonly draftLength: number | null
  readonly baseProofExact: boolean
  readonly localRootPresent: boolean
}

export type LocalImeLocalWindowSnapshot = {
  mode: Mode
  generation: number
  localRootPresent: boolean
  sourceDecorationPresent: boolean
  sourceDecorationCount: number
  hostContentTransactionsWhileActive: number
  localTransactions: number
  localDocChangedTransactions: number
  lastCommitHostTransactionDelta: number | null
  lastCommitHostContentDelta: number | null
  lastMappedAnchor: number | null
  lastMappedHead: number | null
  lastObservedHostAnchor: number | null
  lastObservedHostHead: number | null
  reservationBasePx: number | null
  reservationLocalExtentPx: number | null
  reservationDeltaPx: number | null
  reservationFramePending: boolean
  lastDispatchDisposition: 'none' | 'before-apply' | 'after-apply'
  draftDirty: boolean
  localDocContentSize: number | null
  localBlockCount: number | null
  /** LOCAL-WINDOW-BOUNDED1 acquisition / cap diagnostics。本文内容は含めない。 */
  acquisitionMode: LocalImeLocalWindowAcquisitionMode | null
  minimumBlocks: number
  captureMaximumBlocks: number
  growthHardCap: number
  capturedBlockCount: number | null
  capturedHostStartIndex: number | null
  capturedHostEndIndex: number | null
  capturedBlockNodeSizes: readonly number[] | null
  currentLocalBlockIndex: number | null
  viewportIntersectingBlockCount: number | null
  logicalGuardCount: number | null
  capBoundaryCalls: number
  capLatchHeld: boolean
  capBeforeBlockCount: number | null
  capAfterBlockCount: number | null
  lastCapCloseStatus: string | null
  capDirtyExactOneApplied: boolean
  boundedFreshAcquisitionRequestCount: number
  /** SHRINK1: growth-capとは分離したgeometry boundary diagnostics。 */
  shrinkLatchHeld: boolean
  shrinkBeforeExtentPx: number | null
  shrinkAfterExtentPx: number | null
  shrinkTolerancePx: number | null
  shrinkBoundaryCalls: number
  lastShrinkCloseStatus: string | null
  shrinkDirtyExactOneApplied: boolean
  shrinkFreshAcquisitionRequestCount: number
  shrinkOutsidePrefixPreserved: boolean | null
  shrinkOutsideSuffixPreserved: boolean | null
  lastDomRangeProofFailureReason: string | null
  localUndoDepth: number | null
  localRedoDepth: number | null
  historyShortcutCount: number
  historyHandoffCalls: number
  localHistoryCommandCalls: number
  hostHistoryCommandCalls: number
  lastHistoryHandoff: {
    operation: LocalImeHistoryOperation
    owner: 'local' | 'host' | 'noop' | 'blocked'
    outcome: string
    localUndoDepth: number
    localRedoDepth: number
    hostDepthBeforeClose: number
    hostDepthAfterClose: number | null
    cleanCloseContentTransactionCount: number
    hostCommandInvocationCount: number
    hostCommandDispatchCount: number
    hostContentTransactionCount: number
    appendedDocChangedCount: number
  } | null
  compositionActive: boolean
  pendingBoundaryReason: string | null
  closingPhase: ClosingPhase
  localRevision: number
  recoveryIntent: RecoveryIntent | null
  recoveryCompositionFinalizationPending: boolean
  /**
   * LOCAL-WINDOW-SELECTIONOWN1-POINTER1: overlay が pointer hit-test 透過中か。
   * 実 DOM の `pointer-events` を読むので、hit-test 前 ownership の直接 oracle になる。
   */
  pointerHostFirst: boolean
  /** 最新 host PM が全 document の AllSelection か。Select All handoff の oracle。 */
  hostSelectionIsAll: boolean
  /**
   * Shift+Arrow close 後の mapped caret / dirty commit 実績。pending DOM flush 後の
   * typed close proof から作る。flush 前の local selection は載せない。
   */
  lastShiftArrowHandoff: {
    caretRestoreTransactionCount: 0 | 1
    rangeAdapterCalls: 0 | 1
    rangeTransactionCount: 0 | 1
    rangeTransactionDelta: LocalImeLocalWindowHostTransactionSlice
    moved: boolean
    expectedAnchor: number | null
    expectedHead: number | null
    observedAnchor: number | null
    observedHead: number | null
    dirtyCommitApplied: boolean
  } | null
  /**
   * LOCAL-WINDOW-SPECIALINLINE1: bare ArrowがRuby / TCYへ入ろうとしたときの
   * host fallback実績。Arrowの再実行はしないので adapter 呼び出しは持たない。
   */
  lastSpecialInlineHandoff: {
    operation: string
    closed: boolean
    dirtyCommitApplied: boolean
  } | null
  /**
   * LOCAL-WINDOW-SPECIALINLINE1-BOUNDARYEXIT1: **適用後**のlocal Selectionが
   * Ruby / TCY の exact 直前・直後へ着地したことを根拠に閉じた実績。
   */
  lastSpecialInlineBoundary: {
    side: 'before' | 'after'
    nodeName: string
    closed: boolean
    dirtyCommitApplied: boolean
    /** clean は 0 または 1、dirty は常に 0（mapped caret は同一 content transaction）。 */
    caretRestoreTransactionCount: 0 | 1
    caretRestored: boolean
    caretRestoreFailureReason: string | null
    /** 実測した最終 host selection。close 前の推測は使わない。 */
    observedHostAnchor: number | null
    observedHostHead: number | null
  } | null
  /** boundary close 要求の発火回数。同一到達では exact 1。 */
  specialInlineBoundaryCalls: number
  /** AUTOARM1: character軸の安全なwindow絶対外端からhostへ退出した実績。 */
  lastArrowBoundary: {
    operation: WritingModeArrowOperation
    closed: boolean
    dirtyCommitApplied: boolean
    caretRestoreTransactionCount: 0 | 1
    adapterCalls: 0 | 1
    adapterTransactionCount: 0 | 1
    moved: boolean
    domSelectionRestored: boolean
    outcome: string
  } | null
  arrowBoundaryCalls: number
  /**
   * HOSTNAV-KEYS1: bare Home / End / PageUp / PageDown を host owner へ移した実績。
   * transaction / scroll は adapter の自己申告ではなく実測値。
   */
  lastHostNavKey: {
    operation: LocalImeLocalWindowHostNavKeyOperation
    closed: boolean
    dirtyCommitApplied: boolean
    caretRestoreTransactionCount: 0 | 1
    adapterCalls: 0 | 1
    adapterTransactionCount: 0 | 1
    moved: boolean
    scrollMoved: boolean
    boundaryNoop: boolean
    notifyCount: 0 | 1
    outcome: string
  } | null
  hostNavKeyCalls: number
  /** E2E/review oracle: shared authorityのHome/End phase。Local Window専用stateではない。 */
  homeEndStatePhase: 'visual' | 'logical' | null
  /** 確定した local PM Selection。boundary 判定の正本を E2E から観測するため。 */
  localSelectionAnchor: number | null
  localSelectionHead: number | null
  /** PUBLIC-ENTRY1 pointer proof: 取得直後のhost PM caretとlocal→host exact mapping。 */
  hostSelectionAnchor: number
  hostSelectionHead: number
  localSelectionMappedAnchor: number | null
  localSelectionMappedHead: number | null
  /** special-inline保全 / unsafe selectionで拒否したlocal transaction数。 */
  specialInlineRejectedTransactions: number
  /** local docに載っているspecial-inline node数。 */
  localSpecialInlineCount: number | null
  /** local root DOMにhost sentinelが混入していないこと（常に0であるべき）。 */
  localSentinelCount: number
  /**
   * LOCAL-WINDOW-RUBY-PUNCT-NOWRAP1: 表示専用診断（read-only）。
   * ownership / commit completion / 原稿保全の根拠にはしない。
   */
  localRubyPunctPluginCount: number
  localRubyPunctRunCount: number | null
  localRubyPunctWrapperCount: number
  resizeExit?: {
    armed: boolean
    latched: boolean
    boundaryCalls: number
    listenerCount: number
    observerCount: number
  } | null
  pointerHandoff?:
    | import('./localImeLocalWindowPointerHandoff').LocalImeLocalWindowPointerHandoffDiagnostics
    | null
  autoArm?: import('./localImeLocalWindowAutoArm').LocalImeLocalWindowAutoArmDiagnostics | null
  hostNavigationSession?:
    | import('./localImeLocalWindowHostNavigationSession').LocalImeLocalWindowHostNavigationDiagnostics
    | null
}

export type LocalImeLocalWindowControllerOptions = {
  hostView: EditorView
  editorSurface: HTMLElement | null
  getEnabled: () => boolean
  getDocumentIdentity: () => string
  getHostContentGeneration: () => number
  getHostTransactionCounts: () => { total: number; docChanged: number; selectionOnly: number }
  getHostTransactionSequence: () => number
  getHostTransactionBatchesSince: (sequence: number) => readonly LocalImeHostHistoryTransactionBatch[]
  getDocumentActionPending: () => boolean
  getIsSourceModeActive: () => boolean
  getIsParagraphPlainActive: () => boolean
  continuePendingDocumentAction: (reason: string) => boolean
  cancelPendingDocumentAction: () => boolean
  onModeChange?: (mode: LocalImeInputSessionMode) => void
  onDraftDirtyChange?: (notice: { dirty: boolean; documentIdentity: string }) => void
  /** LOCAL-WINDOW-PSEUDOCARET1: 既存疑似キャレットの generic rAF へ渡す更新要求。 */
  schedulePseudoCaretLocalWindowUpdate?: () => void
  /** LOCAL-WINDOW-PSEUDOCARET1: local Arrow / Home / End の wrap affinity 通知。 */
  notePseudoCaretLocalWindowKeyboardIntent?: (
    event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>,
  ) => void
  /** AUTOARM1: host bare Arrow adapter dispatch直前の既存表示通知。 */
  onBareArrowNavigationDisplayHandoff?: (event: KeyboardEvent) => void
  /** AUTOARM1: adapter呼び出し実績を独立scheduler diagnosticsへ渡す。 */
  onBareArrowBoundaryAdapterCall?: () => void
  /** AUTOARM1: close + host adapter成功後のtyped fresh-acquisition入口。 */
  onArrowBoundaryFreshAcquisition?: (proof: {
    source: 'arrow-boundary'
    documentIdentity: string
    controllerGeneration: number
    status: 'exact-one-success'
  }) => void
  /** close中の中間selection通知をadapter失敗時に残さない。 */
  onArrowBoundaryFreshAcquisitionCancel?: () => void
  /** BOUNDED1: growth capのdirty exact-one成功後だけ使うtyped AUTOARM入口。 */
  onBoundedBoundaryFreshAcquisition?: (proof: {
    source: 'bounded-boundary'
    documentIdentity: string
    controllerGeneration: number
    status: 'exact-one-success'
  }) => void
  /** SHRINK1: dirty exact-one＋outside-range＋cleanup proof成功後だけ使う。 */
  onShrinkBoundaryFreshAcquisition?: (proof: {
    source: 'shrink-boundary'
    documentIdentity: string
    controllerGeneration: number
    status: 'exact-one-success'
  }) => void
  /** HISTORY-HANDOFF1: closeがoff/recoveryへ終端した後だけAUTOARM等を同期破棄する。 */
  onHostHistoryHandoffCloseTerminated?: () => void
  /** HOSTNAV-KEYS1: bare Home / End handled成功後の既存表示通知（exact 1）。 */
  onHomeEndNavigationDisplayHandoff?: (event: KeyboardEvent) => void
  /** HOSTNAV-KEYS1: bare PageUp / PageDown handled成功後の既存表示通知（exact 1）。 */
  onPageUpDownNavigationDisplayHandoff?: (event: KeyboardEvent) => void
  /** LINEAXIS-NAV1 / HOSTNAV-KEYS1: close前にhost-navigation holdを取得する。 */
  onHostNavigationSessionBegin?: (input: {
    key: LocalWindowNavigationSessionStartKey
    documentIdentity: string
    controllerGeneration: number
  }) =>
    | { readonly ok: true; readonly token: LocalImeLocalWindowHostNavigationToken }
    | { readonly ok: false }
  /** close + adapter exactness成功後だけprovisional sessionを確定する。 */
  onHostNavigationSessionConfirm?: (
    token: LocalImeLocalWindowHostNavigationToken,
    result: LocalImeLocalWindowHostNavigationInitialResult,
  ) => boolean
  onHostNavigationSessionCancel?: (
    reason: LocalImeLocalWindowHostNavigationCancellationReason,
  ) => void
}

export type LocalImeLocalWindowControllerHandle = {
  start: () => LocalImeInputSessionStartResult
  stop: (reason?: string) => LocalImeInputSessionMode
  prepareForDocumentAction: (reason?: string) => LocalImeDocumentActionPreparation
  notifyDocumentChange: (reason: string) => boolean
  notifyHostContentChange: (
    notice?: LocalImeHostContentChangeNotice<Transaction>,
  ) => 'navigation-dirty-close-candidate' | 'external-content-change' | 'ignored'
  /**
   * RECOVERY-RESTART1: Local Windowの**唯一**のRetry port。
   *
   * 旧`retryRecovery()`（同じlive sessionを`armed`へ戻すだけ）は、
   * 「明示Retry操作の中でcloseを完了してoffへ収束する」新契約を満たさず、
   * `enabledIntent=false`のままlocal ownerが復活する迂回路になるため撤去した。
   * 1-block paragraph overlayの旧recovery意味論はそちらのcontrollerに残す。
   */
  retryRecoveryCommitToOff: () => LocalImeInputSessionMode
  /** RECOVERY-RESTART1: pure層へ渡すrecovery probe（本文は含まない）。 */
  readRecoveryProbe: () => LocalImeLocalWindowRecoveryProbe
  /** RECOVERY-RESTART1: read-only export用のretained local PM Doc。 */
  readRetainedRecoveryDraftDoc: () => ProseMirrorNode | null
  resolveRecoveryDiscard: () => LocalImeInputSessionMode
  forceReset: (reason: string) => void
  destroy: () => boolean
  isActive: () => boolean
  isPayloadBearing: () => boolean
  getSessionMode: () => LocalImeInputSessionMode
  /**
   * LOCAL-WINDOW-SELECTIONOWN1-POINTER1: pointer selection handoff eligibility の
   * 同期判定。gesture tracker / listener / lease は controller へ持ち込まない。
   */
  resolvePointerSelectionHandoffEligibility: () => LocalImeLocalWindowPointerHostFirstDecision
  getRetainedDraftLength: () => number | null
  getPseudoCaretExternalGeometrySource: () => LocalImeLocalWindowPseudoCaretGeometrySource | null
  snapshot: () => LocalImeLocalWindowSnapshot
  /** EDITOR-LONGDOC-NAV-PERF1: E2E gate内だけから呼ぶread-only selection oracle。 */
  getNavigationPerformanceSelectionForTest: () => LocalImeNavigationPerformanceSelectionSnapshot | null
  setFailureForTest: (failure: Failure) => void
  dispatchHostContentChangeForTest: (kind: LocalImeLocalWindowHostContentChangeForTest) => boolean
  setLocalSelectionForTest: (anchor: number, head?: number) => boolean
  dispatchLocalGrowthForTest: (additionalBlocks: number, text?: string) => boolean
  routeEditMenuCommand: (operation: LocalImeEditMenuOperation) => LocalImeEditMenuCommandResult
  /** 検索 close の focus 復帰直前に identity / generation / 接続を読む。 */
  readSearchCloseFocusLive: () => {
    mode: Mode
    generation: number
    documentIdentity: string
    localRootConnected: boolean
    compositionActive: boolean
  }
  /**
   * 実行直前に identity / generation / connected を再証明してから local root へ
   * focus する。失敗時は DOM を触らず false。
   */
  tryFocusLocalWindowRoot: (proof: {
    documentIdentity: string
    controllerGeneration: number
  }) => boolean
}

export function createLocalImeLocalWindowController(
  options: LocalImeLocalWindowControllerOptions,
): LocalImeLocalWindowControllerHandle {
  const hostView = options.hostView
  let mode: Mode = 'off'
  let generation = 0
  let base: LocalImeLocalWindowBase<LocalImeLocalWindowDomProof> | null = null
  let sessionWritingMode: SupportedEditorWritingMode | null = null
  let originalLocalDoc: ProseMirrorNode | null = null
  let wrapper: HTMLElement | null = null
  let localView: EditorView | null = null
  let reservationOwner: LocalImeLocalWindowReservationOwner | null = null
  let reservationFrame: number | null = null
  let reservationToken = 0
  let reservationBasePx: number | null = null
  let reservationLocalExtentPx: number | null = null
  let reservationDeltaPx: number | null = null
  let reservationStepPx: number | null = null
  let localTransactions = 0
  let localDocChangedTransactions = 0
  let activeHostContentStart = 0
  let lastCommitHostTransactionDelta: number | null = null
  let lastCommitHostContentDelta: number | null = null
  let lastMappedAnchor: number | null = null
  let lastMappedHead: number | null = null
  let lastObservedHostAnchor: number | null = null
  let lastObservedHostHead: number | null = null
  let lastDispatchDisposition: LocalImeLocalWindowSnapshot['lastDispatchDisposition'] = 'none'
  let lastCloseHandoffProof: LocalImeLocalWindowCloseHandoffProof | null = null
  let lastShiftArrowHandoff: LocalImeLocalWindowSnapshot['lastShiftArrowHandoff'] = null
  let lastSpecialInlineHandoff: LocalImeLocalWindowSnapshot['lastSpecialInlineHandoff'] = null
  let lastSpecialInlineBoundary: LocalImeLocalWindowSnapshot['lastSpecialInlineBoundary'] = null
  let specialInlineRejectedTransactions = 0
  /** BOUNDARYEXIT1: 同一の境界到達から close 要求を二度出さないための同期 latch。 */
  let specialInlineBoundaryLatched = false
  let specialInlineBoundaryClosePending = false
  let specialInlineBoundaryCalls = 0
  let lastArrowBoundary: LocalImeLocalWindowSnapshot['lastArrowBoundary'] = null
  let arrowBoundaryCalls = 0
  let lastHostNavKey: LocalImeLocalWindowSnapshot['lastHostNavKey'] = null
  let hostNavKeyCalls = 0
  let pendingBoundaryReason: string | null = null
  let injectedFailure: Failure = 'none'
  let activeHostNavigationToken: LocalImeLocalWindowHostNavigationToken | null = null
  let navigationDirtyDispatchProof: {
    readonly token: LocalImeLocalWindowHostNavigationToken
    readonly transaction: Transaction
    readonly frozenRevision: number
    noticeMatched: boolean
    invalid: boolean
  } | null = null
  let historyShortcutCount = 0
  let historyHandoffCalls = 0
  let localHistoryCommandCalls = 0
  let hostHistoryCommandCalls = 0
  let lastHistoryHandoff: LocalImeLocalWindowSnapshot['lastHistoryHandoff'] = null
  let compositionActive = false
  let closingPhase: ClosingPhase = 'idle'
  let closingCheckpointRevision: number | null = null
  let localRevision = 0
  let recoveryIntent: RecoveryIntent | null = null
  let recoveryCompositionFinalizationPending = false
  let publishedDraftDirty = false
  let pointerHostFirstApplied = false
  let acquisitionMode: LocalImeLocalWindowAcquisitionMode | null = null
  let capturedBlockCount: number | null = null
  let capturedHostStartIndex: number | null = null
  let capturedHostEndIndex: number | null = null
  let viewportIntersectingBlockCount: number | null = null
  let logicalGuardCount: number | null = null
  let capBoundaryCalls = 0
  let capLatchHeld = false
  let capCloseInFlight = false
  let capBeforeBlockCount: number | null = null
  let capAfterBlockCount: number | null = null
  let lastCapCloseStatus: string | null = null
  let capDirtyExactOneApplied = false
  let boundedFreshAcquisitionRequestCount = 0
  let shrinkLatchHeld = false
  let shrinkCloseInFlight = false
  let shrinkSignalRevision: number | null = null
  let shrinkBeforeExtentPx: number | null = null
  let shrinkAfterExtentPx: number | null = null
  let shrinkTolerancePx: number | null = null
  let shrinkBoundaryCalls = 0
  let lastShrinkCloseStatus: string | null = null
  let shrinkDirtyExactOneApplied = false
  let shrinkFreshAcquisitionRequestCount = 0
  let shrinkOutsideBeforeDoc: ProseMirrorNode | null = null
  let shrinkOutsidePrefixPreserved: boolean | null = null
  let shrinkOutsideSuffixPreserved: boolean | null = null
  let reservationDocChangedRevision: number | null = null
  let lastDomRangeProofFailureReason: string | null = null

  const draftDirty = () => Boolean(localView && originalLocalDoc && !localView.state.doc.eq(originalLocalDoc))
  const publishDraftDirty = (force = false) => {
    const dirty = draftDirty()
    if (!force && dirty === publishedDraftDirty) return
    publishedDraftDirty = dirty
    try {
      options.onDraftDirtyChange?.({ dirty, documentIdentity: options.getDocumentIdentity() })
    } catch {
      // dirty UI/main noticeの失敗はPM draft ownershipを変更しない。
    }
  }
  const toSessionMode = (): LocalImeInputSessionMode => {
    if (mode === 'off') return 'off'
    if (mode === 'composing') return 'composing'
    if (mode === 'closing') return 'flushing'
    if (mode === 'recovery-required') return 'recovery-required'
    return 'armed'
  }
  /**
   * LOCAL-WINDOW-SELECTIONOWN1-POINTER1: pointer selection handoff の ownership
   * eligibility。listener / lease / gesture tracker は持たず、現在 state だけを
   * 同期分類する。`proveBase()` は他条件が通ったときだけ評価される。
   */
  const resolvePointerSelectionHandoffEligibility =
    (): LocalImeLocalWindowPointerHostFirstDecision => {
      const view = localView
      const selection = view?.state.selection ?? null
      const doc = view?.state.doc ?? null
      const collapsedText =
        selection instanceof TextSelection &&
        selection.empty &&
        selection.$anchor.depth === 1 &&
        selection.$head.depth === 1
      // 既存 commit builder が draft を抽出できる形かどうかだけを見る（本文は読まない）。
      const draftExtractable =
        doc !== null &&
        selection !== null &&
        isLocalImeLocalWindowCapableDoc(doc) &&
        selection.anchor >= 1 &&
        selection.head >= 1 &&
        selection.anchor < doc.content.size &&
        selection.head < doc.content.size
      return resolveLocalImeLocalWindowPointerHostFirst({
        mode,
        compositionActive: compositionActive || view?.composing === true,
        pendingBoundary: pendingBoundaryReason !== null,
        localViewConnected: view?.dom.isConnected === true,
        localSelectionCollapsedText: collapsedText,
        draftExtractable,
        identityValid:
          base !== null &&
          base.controllerGeneration === generation &&
          base.documentIdentity === options.getDocumentIdentity(),
        proveBase,
      })
    }

  /**
   * hit-test 前 host ownership の唯一の書き込み口。pointerdown 後の retarget や
   * synthetic event を使わず、eligible な間だけ overlay を pointer 透過にする。
   * 呼び出し口は `setMode` と local `dispatchTransaction` と mount 直後だけで、
   * timer / polling / observer / rAF は持たない。
   */
  const syncPointerHostFirst = (): void => {
    if (!wrapper) {
      pointerHostFirstApplied = false
      return
    }
    const hostFirst = resolvePointerSelectionHandoffEligibility().hostFirst
    if (hostFirst === pointerHostFirstApplied) return
    pointerHostFirstApplied = hostFirst
    wrapper.style.pointerEvents = hostFirst ? 'none' : ''
  }

  const setMode = (next: Mode) => {
    mode = next
    syncPointerHostFirst()
    try { options.onModeChange?.(toSessionMode()) } catch { /* observer only */ }
    // LOCAL-WINDOW-PSEUDOCARET1: mode 遷移を pseudo caret 再評価の主要 funnel にする。
    options.schedulePseudoCaretLocalWindowUpdate?.()
  }

  const currentSessionWritingMode = (): SupportedEditorWritingMode | null => {
    const expected = sessionWritingMode
    if (!expected) return null
    const hostMode = resolveSupportedEditorWritingMode(
      window.getComputedStyle(hostView.dom).writingMode,
    )
    if (hostMode !== expected) return null
    const view = localView
    if (view) {
      const localMode = resolveSupportedEditorWritingMode(
        window.getComputedStyle(view.dom).writingMode,
      )
      if (localMode !== expected) return null
    }
    return expected
  }

  const identityValid = () =>
    base !== null &&
    base.controllerGeneration === generation &&
    base.documentIdentity === options.getDocumentIdentity() &&
    currentSessionWritingMode() !== null

  const currentLocalBlockIndex = (): number | null => {
    const selection = localView?.state.selection
    if (!(selection instanceof TextSelection) || selection.$head.depth < 1) return null
    try { return selection.$head.index(0) } catch { return null }
  }

  /** dirty exact-one closeのpost-proofが揃った場合だけbounded AUTOARMへ渡す。 */
  const completeBoundedBoundaryClose = (
    preparation: LocalImeDocumentActionPreparation,
  ): void => {
    const releaseTerminalLatch = () => {
      // close / commitが成功して既にoffなら、post-proof failureでも同じdraftを
      // 再利用しない。recovery-requiredだけが明示Retry用latchを保持する。
      if (mode === 'off') capLatchHeld = false
    }
    if (preparation.status !== 'ready') {
      lastCapCloseStatus = preparation.status
      releaseTerminalLatch()
      return
    }
    const forcePostProofFailure = injectedFailure === 'bounded-post-proof-failure'
    if (forcePostProofFailure) injectedFailure = 'none'
    const proof = lastCloseHandoffProof
    const selection = hostView.state.selection
    const exactSuccess =
      !forcePostProofFailure &&
      mode === 'off' &&
      proof !== null && proof.ok && proof.dirtyCommitApplied &&
      lastCommitHostTransactionDelta === 1 &&
      lastCommitHostContentDelta === 1 &&
      selection instanceof TextSelection && selection.empty &&
      selection.anchor === proof.mappedAnchor && selection.head === proof.mappedHead &&
      lastDispatchDisposition === 'none'
    if (!exactSuccess) {
      lastCapCloseStatus = 'post-proof-failed'
      releaseTerminalLatch()
      return
    }
    lastCapCloseStatus = 'exact-one-success'
    capDirtyExactOneApplied = true
    capLatchHeld = false
    boundedFreshAcquisitionRequestCount += 1
    try {
      options.onBoundedBoundaryFreshAcquisition?.({
        source: 'bounded-boundary',
        documentIdentity: options.getDocumentIdentity(),
        controllerGeneration: generation,
        status: 'exact-one-success',
      })
    } catch {
      // commit済み本文は戻さず、fresh acquisitionだけを失敗としてoffを維持する。
      lastCapCloseStatus = 'exact-one-success-fresh-request-failed'
    }
  }

  const runBoundedBoundaryClose = (): void => {
    const view = localView
    if (!view || !capLatchHeld || mode === 'off') return
    const selection = view.state.selection
    if (!(selection instanceof TextSelection) || !selection.empty) {
      lastCapCloseStatus = 'local-selection-not-collapsed'
      freezeRecovery('invalid-local-state', true)
      return
    }
    capCloseInFlight = true
    try {
      completeBoundedBoundaryClose(
        prepareForDocumentAction(LOCAL_IME_LOCAL_WINDOW_BOUNDED_BOUNDARY_REASON),
      )
    } finally {
      capCloseInFlight = false
    }
  }

  /**
   * 適用後のlocal PM Docをauthorityにhard capを同期latchする。closeは既存
   * pending-DOM-flush / commit経路を使うため、EditorView dispatch callbackの外へ
   * 1 microtaskだけ退避する。timer・polling・Enter replay・completion推測ではない。
   */
  const syncBoundedGrowthCap = (beforeBlockCount: number, afterBlockCount: number): void => {
    if (
      afterBlockCount < LOCAL_IME_LOCAL_WINDOW_GROWTH_HARD_CAP ||
      capLatchHeld || mode === 'closing' || mode === 'recovery-required' ||
      closingPhase !== 'idle'
    ) return
    const view = localView
    if (!view) return
    capLatchHeld = true
    capBeforeBlockCount = beforeBlockCount
    capAfterBlockCount = afterBlockCount
    capBoundaryCalls += 1
    lastCapCloseStatus = 'latched'
    const sourceGeneration = generation
    queueMicrotask(() => {
      if (view !== localView || sourceGeneration !== generation || !capLatchHeld) return
      runBoundedBoundaryClose()
    })
  }

  /** dirty exact-one closeとoutside-range / cleanup proofが揃った場合だけSHRINK AUTOARMへ渡す。 */
  const completeShrinkBoundaryClose = (
    preparation: LocalImeDocumentActionPreparation,
  ): void => {
    const releaseTerminalLatch = () => {
      if (mode === 'off') {
        shrinkLatchHeld = false
        shrinkSignalRevision = null
        shrinkOutsideBeforeDoc = null
      }
    }
    if (preparation.status !== 'ready') {
      lastShrinkCloseStatus = preparation.status
      releaseTerminalLatch()
      return
    }
    const forcePostProofFailure = injectedFailure === 'shrink-post-proof-failure'
    if (forcePostProofFailure) injectedFailure = 'none'
    const proof = lastCloseHandoffProof
    const selection = hostView.state.selection
    const outside =
      shrinkOutsideBeforeDoc !== null &&
      capturedHostStartIndex !== null &&
      capturedHostEndIndex !== null
        ? proveLocalImeLocalWindowOutsideRangeUnchanged({
            before: shrinkOutsideBeforeDoc,
            after: hostView.state.doc,
            capturedStartIndex: capturedHostStartIndex,
            capturedEndIndex: capturedHostEndIndex,
          })
        : { prefix: false, suffix: false }
    shrinkOutsidePrefixPreserved = outside.prefix
    shrinkOutsideSuffixPreserved = outside.suffix
    const cleanupExact =
      localView === null &&
      reservationOwner === null &&
      reservationFrame === null &&
      hostView.dom.querySelector('.nyoze-local-window-source') === null &&
      options.editorSurface?.style.getPropertyValue('--nyoze-local-window-growth-delta') === ''
    const exactSuccess =
      !forcePostProofFailure &&
      mode === 'off' &&
      proof !== null && proof.ok && proof.dirtyCommitApplied &&
      lastCommitHostTransactionDelta === 1 &&
      lastCommitHostContentDelta === 1 &&
      shrinkSignalRevision !== null && localRevision === shrinkSignalRevision &&
      selection instanceof TextSelection && selection.empty &&
      selection.anchor === proof.mappedAnchor && selection.head === proof.mappedHead &&
      lastDispatchDisposition === 'none' &&
      outside.prefix && outside.suffix && cleanupExact
    if (!exactSuccess) {
      lastShrinkCloseStatus = 'post-proof-failed'
      releaseTerminalLatch()
      return
    }
    lastShrinkCloseStatus = 'exact-one-success'
    shrinkDirtyExactOneApplied = true
    shrinkLatchHeld = false
    shrinkSignalRevision = null
    shrinkOutsideBeforeDoc = null
    shrinkFreshAcquisitionRequestCount += 1
    try {
      options.onShrinkBoundaryFreshAcquisition?.({
        source: 'shrink-boundary',
        documentIdentity: options.getDocumentIdentity(),
        controllerGeneration: generation,
        status: 'exact-one-success',
      })
    } catch {
      lastShrinkCloseStatus = 'exact-one-success-fresh-request-failed'
    }
  }

  const runShrinkBoundaryClose = (): void => {
    const view = localView
    if (!view || !shrinkLatchHeld || mode === 'off') return
    const selection = view.state.selection
    if (!(selection instanceof TextSelection) || !selection.empty) {
      lastShrinkCloseStatus = 'local-selection-not-collapsed'
      freezeRecovery('invalid-local-state', true)
      return
    }
    // compositionendでは最終preedit反映後のrevisionをfreeze authorityへ昇格する。
    shrinkSignalRevision = localRevision
    shrinkCloseInFlight = true
    try {
      completeShrinkBoundaryClose(
        prepareForDocumentAction(LOCAL_IME_LOCAL_WINDOW_SHRINK_BOUNDARY_REASON),
      )
    } finally {
      shrinkCloseInFlight = false
    }
  }

  /** reservation rAFのcurrent rect readから最初の確定shrinkだけを同期latchする。 */
  const syncShrinkBoundaryFromMeasurement = (input: {
    readonly docChangedRevision: number | null
    readonly localExtentPx: number
  }): void => {
    const view = localView
    const basePx = reservationBasePx
    if (!view || basePx === null) return
    const tolerancePx = localImeLocalWindowShrinkTolerancePx(window.devicePixelRatio)
    const pendingOwner =
      pendingBoundaryReason !== null ||
      options.getDocumentActionPending() ||
      capLatchHeld ||
      specialInlineBoundaryLatched
    const decision = resolveLocalImeLocalWindowShrinkBoundary({
      active: mode === 'active-clean' || mode === 'active-dirty' || mode === 'composing',
      localViewConnected: view.dom.isConnected,
      identityValid: identityValid(),
      baseProofValid: proveBase(),
      docChangedRevision: input.docChangedRevision,
      currentRevision: localRevision,
      beforeExtentPx: basePx,
      afterExtentPx: input.localExtentPx,
      tolerancePx,
      compositionActive: compositionActive || view.composing,
      closing: mode === 'closing' || closingPhase !== 'idle',
      recovery: mode === 'recovery-required',
      pendingBoundary: pendingOwner,
      latchHeld: shrinkLatchHeld,
    })
    if (!decision.boundary) return
    // boundary callより先にlatchを立て、同じrAF / 後続frameの再入を遮断する。
    shrinkLatchHeld = true
    shrinkSignalRevision = decision.revision
    shrinkBeforeExtentPx = decision.beforeExtentPx
    shrinkAfterExtentPx = decision.afterExtentPx
    shrinkTolerancePx = decision.tolerancePx
    shrinkOutsideBeforeDoc = hostView.state.doc
    shrinkBoundaryCalls += 1
    lastShrinkCloseStatus = 'latched'
    runShrinkBoundaryClose()
  }

  /**
   * LOCAL-WINDOW-SPECIALINLINE1-BOUNDARYEXIT1
   *
   * local transaction を **適用した後**の確定 PM Selection だけを正本に、Ruby / TCY の
   * exact 直前・直後へ着地したかを同期判定して latch する。Arrow の移動先も DOM caret も
   * 座標も見ない。latch は同期なので、次のユーザー入力を local が受け付ける時間窓は無い。
   *
   * close 自体は `queueMicrotask` で 1 tick だけ遅らせる。`close()` は pending DOM flush で
   * local transaction を発行し、成功時は local `EditorView` を destroy するため、PM の
   * `dispatchTransaction` の中から実行すると `DOMObserver.flush()` が destroy 済み view へ
   * 触れる。microtask は次の入力 task より必ず先に走るので入力窓は生まれず、timer /
   * polling / quiet period / rAF は使っていない（既存 compositionend adapter と同じ手法）。
   */
  const boundaryLandingProbe = () =>
    resolveLocalImeLocalWindowSpecialInlineBoundaryLanding({
      selection: localView?.state.selection ?? null,
      mode,
      closingPhase,
      localViewConnected: localView?.dom.isConnected === true,
      identityValid: identityValid(),
    })

  /**
   * LOCAL-WINDOW-SPECIALINLINE1-BOUNDARYEXIT1-CARETRESTORE1
   *
   * boundary close が成功した**後だけ**呼ぶ。復元先は pending DOM flush 後の
   * typed close proof（`lastCloseHandoffProof`）が唯一の正本で、flush 前の local
   * selection、Arrow keydown 時点の selection、DOM Selection、座標は使わない。
   *
   * 判定と dispatch は KBD1 で正式 Go 済みの pure helper をそのまま再利用する
   * （`resolveLocalImeLocalWindowShiftArrowCloseCheckpoint` / `plan…MappedCaretRestore` /
   * `restore…MappedHostCaret`）。`runLocalImeLocalWindowShiftArrowAfterClose()` は
   * range adapter も動かすので呼ばない。special-inline 境界では caret restore だけを行い、
   * Shift+Arrow / bare Arrow / navigation adapter は一切実行しない。
   *
   * clean は host content 0 のまま selection-only を最大 1 回。dirty は mapped caret が
   * 既に commit transaction へ載っているので追加 transaction 0（`plan` が
   * `dirty-mapped-caret-mismatch` で fail-closed にする）。
   * failure では Arrow / selection の再実行も synthetic event も timer 再試行もせず、
   * 既に host へ適用済みの本文を再 commit もせず、typed reason を診断へ残すだけにする。
   */
  const applySpecialInlineBoundaryCaretRestore = () => {
    const record = lastSpecialInlineBoundary
    if (!record) return
    const note = (
      caretRestored: boolean,
      caretRestoreTransactionCount: 0 | 1,
      caretRestoreFailureReason: string | null,
    ) => {
      lastSpecialInlineBoundary = {
        ...record,
        caretRestored,
        caretRestoreTransactionCount,
        caretRestoreFailureReason,
        observedHostAnchor: hostView.state.selection.anchor,
        observedHostHead: hostView.state.selection.head,
      }
    }
    const checkpoint = resolveLocalImeLocalWindowShiftArrowCloseCheckpoint(lastCloseHandoffProof)
    if (!checkpoint.ok) {
      note(false, 0, checkpoint.reason)
      return
    }
    const plan = planLocalImeLocalWindowMappedCaretRestore({
      expectedCaret: checkpoint.expectedCaret,
      mappedAnchor: checkpoint.mappedAnchor,
      mappedHead: checkpoint.mappedHead,
      hostAnchor: hostView.state.selection.anchor,
      hostHead: hostView.state.selection.head,
      hostDocSize: hostView.state.doc.content.size,
      dirtyCommitApplied: checkpoint.dirtyCommitApplied,
    })
    if (!plan.ok) {
      note(false, 0, plan.reason)
      return
    }
    const restored = restoreLocalImeLocalWindowMappedHostCaret({
      hostView,
      caret: checkpoint.expectedCaret,
      getHostTransactionCounts: options.getHostTransactionCounts,
    })
    if (!restored.ok) {
      note(false, 0, restored.reason)
      return
    }
    if (restored.transactionCount !== plan.transactionCount) {
      // KBD1 と同じ照合。`restore…` 内の focus 復帰で host selection が同期変化すると、
      // dirty（plan 0）でも selection transaction 1 が走り得る。plan と実 dispatch 数が
      // 一致しない限り成功扱いにしない。
      note(false, restored.transactionCount, 'exactness-mismatch')
      return
    }
    note(true, restored.transactionCount, null)
  }

  const runSpecialInlineBoundaryClose = (
    landing: Extract<
      ReturnType<typeof boundaryLandingProbe>,
      { landed: true }
    >,
  ) => {
    const view = localView
    if (!view) return
    if (mode === 'off' || mode === 'recovery-required' || closingPhase === 'host-applied') return
    const composing = compositionActive || mode === 'composing' || view.composing === true
    // composition 中以外は、microtask 時点の確定 Selection でもう一度だけ裏取りする。
    if (!composing && !boundaryLandingProbe().landed) {
      specialInlineBoundaryLatched = false
      return
    }
    const preparation = prepareForDocumentAction(
      LOCAL_IME_LOCAL_WINDOW_SPECIAL_INLINE_HANDOFF_REASON,
    )
    const closed = preparation.status === 'ready'
    const proof = lastCloseHandoffProof
    lastSpecialInlineBoundary = {
      side: landing.side,
      nodeName: landing.nodeName,
      closed,
      dirtyCommitApplied: closed && proof !== null && proof.ok && proof.dirtyCommitApplied,
      caretRestoreTransactionCount: 0,
      caretRestored: false,
      caretRestoreFailureReason: closed ? null : 'close-not-ready',
      observedHostAnchor: null,
      observedHostHead: null,
    }
    if (closed) applySpecialInlineBoundaryCaretRestore()
    if (!closed && preparation.status !== 'wait-for-composition') {
      // busy / recovery では latch を解いて、回復後の再到達で改めて exact 1 回だけ発火する。
      specialInlineBoundaryLatched = false
    }
  }

  /** transaction 適用後に必ず同期で呼ぶ。境界から離れたら latch を解く。 */
  const syncSpecialInlineBoundaryLatch = () => {
    const view = localView
    if (!view) return
    // growth capが同じ適用後stateを先に所有した場合はbounded boundaryがfirst-wins。
    if (capLatchHeld) return
    // hot path: pointer drag 等の non-collapsed selection では identity 計算まで進まない。
    // `landed` は同じ false なので判定意味論は変わらない。
    const selection = view.state.selection
    if (!(selection instanceof TextSelection) || !selection.empty) {
      if (!specialInlineBoundaryClosePending) specialInlineBoundaryLatched = false
      return
    }
    const landing = boundaryLandingProbe()
    if (!landing.landed) {
      if (!specialInlineBoundaryClosePending) specialInlineBoundaryLatched = false
      return
    }
    if (specialInlineBoundaryLatched) return
    specialInlineBoundaryLatched = true
    specialInlineBoundaryClosePending = true
    specialInlineBoundaryCalls += 1
    const sourceView = view
    const sourceGeneration = generation
    queueMicrotask(() => {
      specialInlineBoundaryClosePending = false
      if (sourceView !== localView || sourceGeneration !== generation) return
      runSpecialInlineBoundaryClose(landing)
    })
  }

  /**
   * LOCAL-WINDOW-SPECIALINLINE1: 設計の優先順位1（host fallback）。
   * 既存 `prepareForDocumentAction()` をexact 1回呼ぶだけで、Arrowの再実行、
   * synthetic replay、queue / timer、独自 selection 補正は一切しない。
   *
   * dirty の記録は KBD1 と同じく **pending DOM flush 後の typed close proof**
   * （`lastCloseHandoffProof`）を正本にする。close 前の `draftDirty()` は
   * flush で初めて dirty になる draft を取りこぼす。
   */
  const runSpecialInlineArrowHandoff = (operation: WritingModeArrowOperation) => {
    // BOUNDARYEXIT1 が既に同じ到達で close 要求を出しているなら二重に閉じない。
    if (specialInlineBoundaryLatched) return
    lastSpecialInlineHandoff = null
    const preparation = prepareForDocumentAction(
      LOCAL_IME_LOCAL_WINDOW_SPECIAL_INLINE_HANDOFF_REASON,
    )
    const closed = preparation.status === 'ready'
    const proof = lastCloseHandoffProof
    lastSpecialInlineHandoff = {
      operation,
      closed,
      dirtyCommitApplied: closed && proof !== null && proof.ok && proof.dirtyCommitApplied,
    }
  }

  const runShiftArrowHandoff = (operation: WritingModeArrowOperation) => {
    const view = localView
    if (!view || !base) return
    const writingMode = currentSessionWritingMode()
    if (!writingMode) return
    const selection = view.state.selection
    if (!(selection instanceof TextSelection) || !selection.empty) return
    lastShiftArrowHandoff = null
    const preparation = prepareForDocumentAction(LOCAL_IME_LOCAL_WINDOW_SHIFT_ARROW_HANDOFF_REASON)
    if (preparation.status !== 'ready') return
    const checkpoint = resolveLocalImeLocalWindowShiftArrowCloseCheckpoint(lastCloseHandoffProof)
    if (!checkpoint.ok) return
    const applied = runLocalImeLocalWindowShiftArrowAfterClose({
      hostView,
      expectedCaret: checkpoint.expectedCaret,
      mappedAnchor: checkpoint.mappedAnchor,
      mappedHead: checkpoint.mappedHead,
      dirtyCommitApplied: checkpoint.dirtyCommitApplied,
      operation,
      writingMode,
      getHostTransactionCounts: options.getHostTransactionCounts,
    })
    lastShiftArrowHandoff = {
      caretRestoreTransactionCount: applied.caretRestoreTransactionCount,
      rangeAdapterCalls: applied.rangeAdapterCalls,
      rangeTransactionCount: applied.ok ? applied.rangeTransactionCount : 0,
      rangeTransactionDelta: applied.ok
        ? applied.rangeTransactionDelta
        : { total: 0, docChanged: 0, selectionOnly: 0 },
      moved: applied.ok && applied.moved,
      expectedAnchor: applied.ok ? applied.expectedAnchor : null,
      expectedHead: applied.ok ? applied.expectedHead : null,
      observedAnchor: applied.ok ? applied.observedAnchor : null,
      observedHead: applied.ok ? applied.observedHead : null,
      dirtyCommitApplied: checkpoint.dirtyCommitApplied,
    }
  }

  const runArrowBoundaryHandoff = (
    event: KeyboardEvent,
    operation: WritingModeArrowOperation,
    navigationToken?: LocalImeLocalWindowHostNavigationToken,
  ) => {
    const writingMode = currentSessionWritingMode()
    if (!writingMode) {
      options.onHostNavigationSessionCancel?.('identity-change')
      return
    }
    const lineAxis = isWritingModeLineAxisOperation(writingMode, operation)
    const cancelNavigation = (reason: LocalImeLocalWindowHostNavigationCancellationReason) => {
      if (lineAxis) options.onHostNavigationSessionCancel?.(reason)
      else options.onArrowBoundaryFreshAcquisitionCancel?.()
    }
    if (lineAxis) activeHostNavigationToken = navigationToken ?? null
    else options.onArrowBoundaryFreshAcquisitionCancel?.()
    lastArrowBoundary = null
    arrowBoundaryCalls += 1
    const preparation = prepareForDocumentAction(LOCAL_IME_LOCAL_WINDOW_ARROW_BOUNDARY_REASON)
    const proof = lastCloseHandoffProof
    const dirtyCommitApplied =
      preparation.status === 'ready' && proof !== null && proof.ok && proof.dirtyCommitApplied
    if (preparation.status !== 'ready') {
      lastArrowBoundary = {
        operation,
        closed: false,
        dirtyCommitApplied: false,
        caretRestoreTransactionCount: 0,
        adapterCalls: 0,
        adapterTransactionCount: 0,
        moved: false,
        domSelectionRestored: false,
        outcome: preparation.status,
      }
      cancelNavigation('initial-close-failed')
      activeHostNavigationToken = null
      navigationDirtyDispatchProof = null
      return
    }
    let applied: ReturnType<typeof runLocalImeLocalWindowArrowBoundaryAfterClose>
    try {
      const adapterFailure = injectedFailure
      if (
        adapterFailure === 'adapter-drop' ||
        adapterFailure === 'adapter-extra' ||
        adapterFailure === 'adapter-docchanged' ||
        adapterFailure === 'adapter-selection-mismatch' ||
        adapterFailure === 'adapter-display-state-change'
      ) {
        injectedFailure = 'none'
      }
      applied = runLocalImeLocalWindowArrowBoundaryAfterClose({
        hostView,
        closeProof: proof,
        operation,
        writingMode,
        getHostTransactionCounts: options.getHostTransactionCounts,
        beforeAdapterDispatch: () => {
          options.onBareArrowNavigationDisplayHandoff?.(event)
          if (adapterFailure === 'adapter-display-state-change') {
            hostView.dispatch(hostView.state.tr.setSelection(
              TextSelection.atEnd(hostView.state.doc),
            ))
          }
        },
        dispatchAdapterTransaction: adapterFailure === 'adapter-drop'
          ? () => { /* test-only dispatch drop */ }
          : adapterFailure === 'adapter-extra'
            ? (transaction) => {
                hostView.dispatch(transaction)
                hostView.dispatch(hostView.state.tr.setSelection(hostView.state.selection))
              }
            : adapterFailure === 'adapter-docchanged'
              ? () => {
                  hostView.dispatch(hostView.state.tr.insertText('adapter混入'))
                }
              : adapterFailure === 'adapter-selection-mismatch'
                ? () => {
                    hostView.dispatch(hostView.state.tr.setSelection(
                      TextSelection.atEnd(hostView.state.doc),
                    ))
                  }
                : undefined,
      })
    } catch {
      cancelNavigation('initial-adapter-failed')
      applied = {
        ok: false,
        reason: 'arrow-boundary-unexpected-failure',
        caretRestoreTransactionCount: 0,
        adapterCalls: 0,
      }
    }
    if (applied.adapterCalls === 1) options.onBareArrowBoundaryAdapterCall?.()
    lastArrowBoundary = {
      operation,
      closed: true,
      dirtyCommitApplied,
      caretRestoreTransactionCount: applied.caretRestoreTransactionCount,
      adapterCalls: applied.adapterCalls,
      adapterTransactionCount: applied.ok ? applied.adapterTransactionCount : 0,
      moved: applied.ok && applied.moved,
      domSelectionRestored: applied.ok && applied.domSelectionRestored,
      outcome: applied.ok ? (applied.moved ? 'moved' : 'not-moved') : applied.reason,
    }
    if (!applied.ok) {
      cancelNavigation('initial-adapter-failed')
      activeHostNavigationToken = null
      navigationDirtyDispatchProof = null
      return
    }
    if (lineAxis) {
      const confirmed = navigationToken !== undefined && options.onHostNavigationSessionConfirm?.(
        navigationToken,
        {
          key: writingModeArrowOperationToKey(operation),
          closeContentTransactionCount: dirtyCommitApplied ? 1 : 0,
          caretRestoreTransactionCount: applied.caretRestoreTransactionCount,
          adapterCalls: 1,
          adapterTransactionCount: applied.adapterTransactionCount,
          moved: applied.moved,
          domSelectionRestored: applied.domSelectionRestored,
          scrollMoved: null,
        },
      ) === true
      if (!confirmed) cancelNavigation('initial-adapter-failed')
      activeHostNavigationToken = null
      navigationDirtyDispatchProof = null
      return
    }
    if (!applied.moved) {
      options.onArrowBoundaryFreshAcquisitionCancel?.()
      return
    }
    const hostSelection = hostView.state.selection
    if (!(hostSelection instanceof TextSelection) || !hostSelection.empty) {
      options.onArrowBoundaryFreshAcquisitionCancel?.()
      return
    }
    options.onArrowBoundaryFreshAcquisition?.({
      source: 'arrow-boundary',
      documentIdentity: options.getDocumentIdentity(),
      controllerGeneration: generation,
      status: 'exact-one-success',
    })
  }

  /**
   * HOSTNAV-KEYS1: bare Home / End / PageUp / PageDown を host owner へ移す。
   *
   * 元 KeyboardEvent は Local Window 上で開始するため、overlay 削除後に host DOM へ
   * retarget しない。元 event を exact 1 回 consume → typed close → host PM へ既存
   * command を直接 exact 1 回適用する。synthetic event / replay / queue は作らない。
   */
  const runHostNavKeyHandoff = (
    event: KeyboardEvent,
    key: LocalImeLocalWindowHostNavKey,
    operation: LocalImeLocalWindowHostNavKeyOperation,
    navigationToken: LocalImeLocalWindowHostNavigationToken,
  ) => {
    const homeEnd = isLocalImeLocalWindowHostNavKeyOperation(operation)
    const writingMode = currentSessionWritingMode()
    if (!writingMode) {
      options.onHostNavigationSessionCancel?.('identity-change')
      return
    }
    activeHostNavigationToken = navigationToken
    lastHostNavKey = null
    hostNavKeyCalls += 1
    const run = () => {
      const preparation = prepareForDocumentAction(LOCAL_IME_LOCAL_WINDOW_HOST_NAV_KEY_REASON)
      const proof = lastCloseHandoffProof
      const dirtyCommitApplied =
        preparation.status === 'ready' && proof !== null && proof.ok && proof.dirtyCommitApplied
      if (preparation.status !== 'ready') {
        if (homeEnd) resetHomeEndState()
        lastHostNavKey = {
          operation,
          closed: false,
          dirtyCommitApplied: false,
          caretRestoreTransactionCount: 0,
          adapterCalls: 0,
          adapterTransactionCount: 0,
          moved: false,
          scrollMoved: false,
          boundaryNoop: false,
          notifyCount: 0,
          outcome: preparation.status,
        }
        options.onHostNavigationSessionCancel?.('initial-close-failed')
        activeHostNavigationToken = null
        navigationDirtyDispatchProof = null
        return
      }
      let notifyCount: 0 | 1 = 0
      let applied: ReturnType<typeof runLocalImeLocalWindowHostNavKeyAfterClose>
      try {
        const commandFailure = injectedFailure
        if (
          commandFailure === 'adapter-drop' ||
          commandFailure === 'adapter-extra' ||
          commandFailure === 'adapter-docchanged' ||
          commandFailure === 'adapter-selection-mismatch'
        ) {
          injectedFailure = 'none'
        }
        applied = runLocalImeLocalWindowHostNavKeyAfterClose({
          hostView,
          closeProof: proof,
          operation,
          event,
          writingMode,
          getHostTransactionCounts: options.getHostTransactionCounts,
          dispatchCommandTransactionForTest: commandFailure === 'adapter-drop'
            ? () => { /* test-only nonthrowing dispatch drop */ }
            : commandFailure === 'adapter-docchanged'
              ? () => {
                  hostView.dispatch(hostView.state.tr.insertText('adapter混入'))
                }
              : commandFailure === 'adapter-selection-mismatch'
                ? () => {
                    const current = hostView.state.selection.from
                    const wrong = current === 1 ? 2 : 1
                    hostView.dispatch(hostView.state.tr.setSelection(
                      TextSelection.create(hostView.state.doc, wrong),
                    ))
                  }
                : undefined,
          injectAfterCommandForTest: commandFailure === 'adapter-extra'
            ? () => {
                hostView.dispatch(hostView.state.tr.setSelection(hostView.state.selection))
              }
            : undefined,
          deferHomeEndDomAffinity: true,
        })
      } catch {
        if (homeEnd) resetHomeEndState()
        applied = {
          ok: false,
          reason: 'host-nav-key-unexpected-failure',
          caretRestoreTransactionCount: 0,
          adapterCalls: 0,
        }
      }
      lastHostNavKey = {
        operation,
        closed: true,
        dirtyCommitApplied,
        caretRestoreTransactionCount: applied.caretRestoreTransactionCount,
        adapterCalls: applied.adapterCalls,
        adapterTransactionCount: applied.ok ? applied.adapterTransactionCount : 0,
        moved: applied.ok && applied.moved,
        scrollMoved: applied.ok && applied.scrollMoved,
        boundaryNoop: applied.ok && applied.boundaryNoop,
        notifyCount,
        outcome: applied.ok
          ? (applied.moved ? 'moved' : applied.scrollMoved ? 'scrolled' : 'not-moved')
          : applied.reason,
      }
      if (!applied.ok) {
        if (homeEnd) resetHomeEndState()
        options.onHostNavigationSessionCancel?.('initial-adapter-failed')
        activeHostNavigationToken = null
        navigationDirtyDispatchProof = null
        return
      }
      const confirmed = options.onHostNavigationSessionConfirm?.(navigationToken, {
        key,
        closeContentTransactionCount: dirtyCommitApplied ? 1 : 0,
        caretRestoreTransactionCount: applied.caretRestoreTransactionCount,
        adapterCalls: 1,
        adapterTransactionCount: applied.adapterTransactionCount,
        moved: applied.moved,
        // DOM caret proof は bare Arrow 専用。End の折返し affinity 補正は PM pos を
        // 変えずに DOM caret だけを動かすため、同じ proof をここへ流用しない。
        domSelectionRestored: null,
        scrollMoved: homeEnd ? null : applied.scrollMoved,
      }) === true
      if (!confirmed) {
        if (homeEnd) resetHomeEndState()
        options.onHostNavigationSessionCancel?.('initial-adapter-failed')
      } else {
        if (homeEnd) {
          applyHomeEndNavigationDomAffinity(hostView, applied.endAffinity)
          options.onHomeEndNavigationDisplayHandoff?.(event)
        } else {
          options.onPageUpDownNavigationDisplayHandoff?.(event)
        }
        notifyCount = 1
        if (lastHostNavKey) lastHostNavKey = { ...lastHostNavKey, notifyCount }
      }
      activeHostNavigationToken = null
      navigationDirtyDispatchProof = null
    }
    // Home / End は close / teardown / caret restore 由来の selection echo で
    // 2 段階 state を失わないよう、既存保護境界で全体を囲む。
    try {
      if (homeEnd) runWithHomeEndSelectionMutation(run)
      else run()
    } catch {
      if (homeEnd) resetHomeEndState()
      options.onHostNavigationSessionCancel?.('initial-adapter-failed')
      activeHostNavigationToken = null
      navigationDirtyDispatchProof = null
    }
  }

  const onLocalKeyDown = (event: KeyboardEvent) => {
    // 通常host `editorPropsKeydown` と同じく、Home / End 以外の key で共有 2 段階
    // state を落とす（Arrow / Page / 通常入力 / IME keydown を含む）。
    if (event.key !== 'Home' && event.key !== 'End') resetHomeEndState()
    // WINDOWS1: AltGr（`getModifierState('AltGraph')`）は Undo / Redo より先に落とす。
    const historyOperation = classifyLocalImeHistoryShortcut(
      toLocalImeHistoryShortcutProbe(event),
    )
    if (historyOperation) {
      const result = routeHistoryCommand(historyOperation, event.keyCode)
      if (result.status !== 'not-active') {
        if (event.cancelable) event.preventDefault()
        event.stopPropagation()
        return
      }
    }
    if (
      event.isComposing ||
      event.keyCode === 229 ||
      compositionActive ||
      localView?.composing === true
    ) {
      return
    }
    if (isLocalImeLocalWindowShiftArrowCandidate(event)) {
      const view = localView
      const selection = view?.state.selection
      const decision = resolveLocalImeLocalWindowShiftArrowHandoff({
        key: event.key,
        isTrusted: event.isTrusted,
        cancelable: event.cancelable,
        isComposing: false,
        keyCode: event.keyCode,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        mode,
        localRootFocused: isLocalImeLocalWindowRootDomFocused(view?.dom),
        identityValid: identityValid(),
        writingMode: currentSessionWritingMode() ?? '',
        selectionIsText: selection instanceof TextSelection,
        selectionCollapsed: selection?.empty === true,
        pendingBoundary: pendingBoundaryReason !== null,
        localViewConnected: view?.dom.isConnected === true,
        baseProof: base !== null && proveBase(),
      })
      if (decision.handoff) {
        event.preventDefault()
        event.stopPropagation()
        runShiftArrowHandoff(decision.operation)
        return
      }
      if (
        (mode === 'closing' || mode === 'recovery-required') &&
        event.cancelable
      ) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
    }
    if (isLocalImeLocalWindowBareArrowCandidate(event)) {
      const view = localView
      // Ruby / TCY の character-axis 入口は通常の絶対端 boundary より先に所有する。
      const specialInlineDecision = resolveLocalImeLocalWindowSpecialInlineArrowHandoff({
        probe: {
          key: event.key,
          isTrusted: event.isTrusted,
          cancelable: event.cancelable,
          isComposing: false,
          keyCode: event.keyCode,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
        },
        mode,
        writingMode: currentSessionWritingMode() ?? '',
        selection: view?.state.selection ?? null,
        pendingBoundary: pendingBoundaryReason !== null,
        localViewConnected: view?.dom.isConnected === true,
        localRootFocused: isLocalImeLocalWindowRootDomFocused(view?.dom),
        identityValid: identityValid(),
        baseProof: base !== null && proveBase(),
      })
      if (specialInlineDecision.handoff) {
        event.preventDefault()
        event.stopPropagation()
        runSpecialInlineArrowHandoff(specialInlineDecision.operation)
        return
      }
      const boundaryDecision = resolveLocalImeLocalWindowArrowBoundaryExit({
        event: {
          key: event.key,
          isTrusted: event.isTrusted,
          cancelable: event.cancelable,
          isComposing: false,
          keyCode: event.keyCode,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
        },
        mode,
        writingMode: currentSessionWritingMode() ?? '',
        state: view?.state ?? null,
        pendingBoundary: pendingBoundaryReason !== null,
        localViewConnected: view?.dom.isConnected === true,
        localRootFocused: isLocalImeLocalWindowRootDomFocused(view?.dom),
        identityValid: identityValid(),
        baseProof: base !== null && proveBase(),
        mappedHostCaret: base && view
          ? base.range.from + view.state.selection.head
          : null,
        hostDocContentSize: hostView.state.doc.content.size,
      })
      if (boundaryDecision.exit) {
        const writingMode = currentSessionWritingMode()
        if (!writingMode) return
        const lineAxis = isWritingModeLineAxisOperation(
          writingMode,
          boundaryDecision.operation,
        )
        let navigationToken: LocalImeLocalWindowHostNavigationToken | undefined
        if (lineAxis) {
          if (event.key !== writingModeArrowOperationToKey(boundaryDecision.operation)) return
          // SPECIALINLINE1の確定landing / queued closeがfirst-wins。same taskで
          // LINEAXIS closeを重ねず、既存boundary microtaskへownershipを残す。
          if (
            specialInlineBoundaryLatched ||
            specialInlineBoundaryClosePending ||
            boundaryLandingProbe().landed
          ) return
          const begun = options.onHostNavigationSessionBegin?.({
            key: event.key,
            documentIdentity: options.getDocumentIdentity(),
            controllerGeneration: generation,
          })
          // holdをclose前に取得できなければ元Arrowをconsumeせずlocal PMへ委譲する。
          if (!begun?.ok) return
          navigationToken = begun.token
        }
        event.preventDefault()
        event.stopPropagation()
        runArrowBoundaryHandoff(event, boundaryDecision.operation, navigationToken)
        return
      }
    }
    if (isLocalImeLocalWindowHostNavKeyCandidate(event)) {
      const view = localView
      const decision = resolveLocalImeLocalWindowHostNavKeyExit({
        event: {
          key: event.key,
          isTrusted: event.isTrusted,
          cancelable: event.cancelable,
          isComposing: false,
          keyCode: event.keyCode,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
        },
        mode,
        writingMode: currentSessionWritingMode() ?? '',
        state: view?.state ?? null,
        pendingBoundary: pendingBoundaryReason !== null,
        localViewConnected: view?.dom.isConnected === true,
        localRootFocused: isLocalImeLocalWindowRootDomFocused(view?.dom),
        identityValid: identityValid(),
        baseProof: base !== null && proveBase(),
      })
      if (decision.exit) {
        // SPECIALINLINE1 の確定 landing / queued close が first-wins。
        if (
          specialInlineBoundaryLatched ||
          specialInlineBoundaryClosePending ||
          boundaryLandingProbe().landed
        ) return
        const key = event.key as LocalImeLocalWindowHostNavKey
        const begun = options.onHostNavigationSessionBegin?.({
          key,
          documentIdentity: options.getDocumentIdentity(),
          controllerGeneration: generation,
        })
        // holdをclose前に取得できなければ元keyをconsumeせずlocal PMへ委譲する。
        if (!begun?.ok) return
        event.preventDefault()
        event.stopPropagation()
        runHostNavKeyHandoff(event, key, decision.operation, begun.token)
        return
      }
    }
    options.notePseudoCaretLocalWindowKeyboardIntent?.(event)
  }

  const resolvePseudoCaretExternalGeometrySource = (): LocalImeLocalWindowPseudoCaretGeometrySource | null => {
    const view = localView
    const currentOverlay = wrapper
    const surface = options.editorSurface
    if (
      !view ||
      !currentOverlay ||
      !base ||
      !surface ||
      (mode !== 'active-clean' && mode !== 'active-dirty' && mode !== 'composing')
    ) {
      return null
    }
    const documentIdentity = options.getDocumentIdentity()
    if (!documentIdentity) return null
    if (base.documentIdentity !== documentIdentity) return null
    if (base.controllerGeneration !== generation) return null
    if (!proveBase()) return null
    const writingMode = currentSessionWritingMode()
    if (!writingMode) return null
    return {
      kind: 'local-ime-local-window',
      mode,
      generation,
      documentIdentity,
      writingMode,
      surface,
      overlay: currentOverlay,
      localView: view,
      localRoot: view.dom,
      emptyCaretAnchor: resolveLocalImeLocalEditorViewEmptyCaretAnchor(view),
    }
  }

  const clearReservation = () => {
    reservationToken += 1
    if (reservationFrame !== null) window.cancelAnimationFrame(reservationFrame)
    reservationFrame = null
    options.editorSurface?.style.removeProperty('--nyoze-local-window-growth-delta')
    // owner参照の有無に関わらず解除する。Start失敗経路やdocument切替後も、
    // host固定pluginへ残り得るtargetを0へ戻す（pluginは削除しない）。
    const owner = reservationOwner ?? resolveLocalImeLocalWindowReservationOwner(hostView)
    owner?.clear()
    reservationOwner = null
    reservationBasePx = null
    reservationLocalExtentPx = null
    reservationDeltaPx = null
    reservationStepPx = null
    reservationDocChangedRevision = null
  }

  const scheduleReservation = (docChangedRevision: number | null = null) => {
    if (docChangedRevision !== null) reservationDocChangedRevision = docChangedRevision
    if (!localView || mode === 'off' || reservationFrame !== null) return
    const token = reservationToken
    reservationFrame = window.requestAnimationFrame(() => {
      reservationFrame = null
      if (token !== reservationToken || !localView || mode === 'off') return
      const measuredDocChangedRevision = reservationDocChangedRevision
      reservationDocChangedRevision = null
      const basePx = reservationBasePx
      const stepPx = reservationStepPx
      if (basePx === null || stepPx === null) return
      const writingMode = currentSessionWritingMode()
      if (!writingMode) return
      const blockAxis = resolveWritingModeLogicalBlockAxis(writingMode)
      // scroll extentはoverflowの過去最大値を縮小後も保持し得る。ownershipや本文には
      // 使わず、現在のtop-level PM block rect unionだけをgeometry oracleとして読む。
      const blockRects = Array.from(localView.dom.children)
        .filter((child): child is HTMLElement => child instanceof HTMLElement)
        .map((child) => ({ connected: child.isConnected, rect: child.getBoundingClientRect() }))
      if (
        blockRects.length === 0 ||
        blockRects.some(({ connected, rect }) =>
          !connected ||
          !Number.isFinite(rect.left) || !Number.isFinite(rect.right) ||
          !Number.isFinite(rect.top) || !Number.isFinite(rect.bottom) ||
          rect.right <= rect.left || rect.bottom <= rect.top)
      ) return
      const extent = measureLocalImeLocalWindowBlockRectUnion(
        blockRects.map(({ rect }) => rect),
        blockAxis,
      )
      if (extent === null) return
      reservationLocalExtentPx = extent
      syncShrinkBoundaryFromMeasurement({
        docChangedRevision: measuredDocChangedRevision,
        localExtentPx: extent,
      })
      if (!localView || mode === 'recovery-required') return
      const delta = computeLocalImeLocalWindowGrowthDelta({ basePx, localExtentPx: extent, stepPx })
      if (delta === null || delta === reservationDeltaPx) return
      reservationDeltaPx = delta
      if (delta === 0) options.editorSurface?.style.removeProperty('--nyoze-local-window-growth-delta')
      else options.editorSurface?.style.setProperty('--nyoze-local-window-growth-delta', `${delta}px`)
    })
  }

  const removeDom = () => {
    clearReservation()
    if (localView) {
      localView.dom.removeEventListener('compositionstart', onCompositionStart)
      localView.dom.removeEventListener('compositionupdate', onCompositionUpdate)
      localView.dom.removeEventListener('compositionend', onCompositionEnd)
      localView.dom.removeEventListener('keydown', onLocalKeyDown, true)
      localView.destroy()
    }
    localView = null
    wrapper?.remove()
    wrapper = null
    hostView.dom.removeAttribute('data-nyoze-host-local-window-active')
  }

  const paragraphsFromBase = (): readonly ProseMirrorNode[] | null => {
    if (!base) return null
    const nodes = base.domProof.blockPositions.map((pos) => hostView.state.doc.nodeAt(pos))
    return nodes.every((node): node is ProseMirrorNode => node !== null)
      ? nodes
      : null
  }
  const proveBase = () => {
    if (!base) return false
    const paragraphs = paragraphsFromBase()
    if (!paragraphs) return false
    return proveLocalImeLocalWindowBaseIsCurrent({
      base,
      hostState: hostView.state,
      documentIdentity: options.getDocumentIdentity(),
      controllerGeneration: generation,
      hostContentGeneration: options.getHostContentGeneration(),
      validateDomProof: () => validateLocalImeLocalWindowDomProof({ view: hostView, proof: base!.domProof, paragraphs }),
    })
  }

  const hardFreezeRecovery = () => {
    if (!localView) return
    localView.setProps({ editable: () => false })
    localView.dom.setAttribute('aria-readonly', 'true')
    localView.dom.tabIndex = -1
  }

  const freezeRecovery = (intent: RecoveryIntent, forceRetain = false) => {
    const view = localView
    const needsLiveComposition = Boolean(view && (compositionActive || view.composing))
    if (!view || (!forceRetain && !draftDirty() && !needsLiveComposition)) return false
    recoveryIntent = intent
    closingPhase = 'idle'
    closingCheckpointRevision = null
    pendingBoundaryReason = null
    options.cancelPendingDocumentAction()
    setMode('recovery-required')
    publishDraftDirty(true)
    if (needsLiveComposition) {
      // final preeditがまだDOMだけにある可能性がある。compositionend後の既存PM
      // transactionと明示flushを通すまではeditable view / listener / focusを維持する。
      recoveryCompositionFinalizationPending = true
      try { view.focus() } catch { /* composition ownerを維持できる範囲でfail-closed */ }
      return true
    }
    recoveryCompositionFinalizationPending = false
    hardFreezeRecovery()
    return true
  }

  const finish = () => {
    if (publishedDraftDirty) {
      publishedDraftDirty = false
      try {
        options.onDraftDirtyChange?.({ dirty: false, documentIdentity: options.getDocumentIdentity() })
      } catch { /* terminal cleanupを続ける */ }
    }
    removeDom()
    base = null
    sessionWritingMode = null
    originalLocalDoc = null
    pendingBoundaryReason = null
    compositionActive = false
    closingPhase = 'idle'
    closingCheckpointRevision = null
    recoveryIntent = null
    recoveryCompositionFinalizationPending = false
    // BOUNDARYEXIT1: terminal cleanup で latch を必ず解く。Force reset / discard /
    // document change / destroy もこの経路を通る。
    specialInlineBoundaryLatched = false
    specialInlineBoundaryClosePending = false
    if (!capCloseInFlight) {
      capLatchHeld = false
    }
    if (!shrinkCloseInFlight) {
      shrinkLatchHeld = false
      shrinkSignalRevision = null
      shrinkOutsideBeforeDoc = null
    }
    setMode('off')
    try { hostView.focus() } catch { /* teardown */ }
  }

  const dispatchHostTransaction = (
    transaction: Transaction,
    sourceView: EditorView,
  ) => {
    const failure = injectedFailure
    if (
      failure !== 'dispatch-drop' &&
      failure !== 'dispatch-extra' &&
      failure !== 'dispatch-docchanged' &&
      failure !== 'dispatch-reentrant-local' &&
      failure !== 'dispatch-selection-mismatch'
    ) {
      hostView.dispatch(transaction)
      return
    }
    injectedFailure = 'none'
    if (failure === 'dispatch-extra') {
      hostView.dispatch(transaction)
      hostView.dispatch(hostView.state.tr.setSelection(hostView.state.selection))
      return
    }
    if (failure === 'dispatch-docchanged') {
      hostView.dispatch(transaction)
      hostView.dispatch(hostView.state.tr.insertText('cap混入').setMeta('addToHistory', false))
      return
    }
    if (failure === 'dispatch-selection-mismatch') {
      transaction.setSelection(TextSelection.create(transaction.doc, 1))
      hostView.dispatch(transaction)
      return
    }
    const originalDispatchTransaction = hostView.props.dispatchTransaction
    let restored = false
    const restore = () => {
      if (restored) return
      restored = true
      hostView.setProps({ dispatchTransaction: originalDispatchTransaction })
    }
    hostView.setProps({
      dispatchTransaction(hostTransaction) {
        restore()
        if (failure === 'dispatch-reentrant-local') {
          sourceView.dispatch(sourceView.state.tr.insertText('再入'))
          if (originalDispatchTransaction) {
            originalDispatchTransaction.call(hostView, hostTransaction)
          } else {
            hostView.updateState(hostView.state.apply(hostTransaction))
          }
        }
        // dispatch-dropは例外を投げず、host stateへtransactionを適用しない。
      },
    })
    try {
      hostView.dispatch(transaction)
    } finally {
      restore()
    }
  }

  const retainDispatchFailure = (
    disposition: 'before-apply' | 'after-apply',
  ): LocalImeInputSessionMode => {
    lastDispatchDisposition = disposition
    if (disposition === 'before-apply') {
      closingPhase = 'frozen'
      freezeRecovery('dispatch-before-apply', true)
    } else {
      closingPhase = 'host-applied'
      freezeRecovery('dispatch-after-apply', true)
    }
    return toSessionMode()
  }

  const close = (
    reason: string,
    constraints?: { readonly requireClean?: boolean },
  ): LocalImeInputSessionMode => {
    if (mode === 'off' || mode === 'recovery-required') return toSessionMode()
    if (compositionActive || mode === 'composing' || localView?.composing) {
      if (pendingBoundaryReason === null) pendingBoundaryReason = reason
      return 'composing'
    }
    const view = localView
    if (!view || !base) return toSessionMode()
    if (!currentSessionWritingMode()) {
      if (draftDirty()) freezeRecovery('stale-base')
      else finish()
      return toSessionMode()
    }
    const sourceGeneration = generation
    closingPhase = 'dom-flush'
    closingCheckpointRevision = null
    lastCloseHandoffProof = { ok: false }
    const flush = flushLocalImePendingDomChanges({
      view,
      validateSource: () =>
        localView === view &&
        base !== null &&
        sourceGeneration === generation &&
        generation === base.controllerGeneration &&
        mode !== 'off' &&
        mode !== 'recovery-required',
      beforeFlushForTest: () => {
        if (injectedFailure === 'history-dirty-during-close') {
          injectedFailure = 'none'
          view.dispatch(view.state.tr.insertText('history-close-dirty').setMeta('addToHistory', false))
          return
        }
        if (injectedFailure !== 'inject-change-during-flush') return
        injectedFailure = 'none'
        const flushSelection = view.state.selection
        if (!(flushSelection instanceof TextSelection) || !flushSelection.empty) return
        view.dispatch(view.state.tr.insertText('flush保全'))
      },
    })
    if (!flush.ok) {
      closingPhase = 'idle'
      closingCheckpointRevision = null
      pendingBoundaryReason = null
      options.cancelPendingDocumentAction()
      if (draftDirty()) freezeRecovery('pending-dom-flush')
      return toSessionMode()
    }
    // flushがlocal transactionを生成し得るため、freeze/checkpointは必ずその後。
    if (localView !== view || sourceGeneration !== generation || view.composing) {
      closingPhase = 'idle'
      pendingBoundaryReason = null
      options.cancelPendingDocumentAction()
      return toSessionMode()
    }
    // HISTORY-HANDOFF1はdirtyを自動commitしない。close自身の最終DOM flushで
    // dirty化した場合もfreeze前に止め、local PMとhistory branchをそのまま保持する。
    if (constraints?.requireClean === true && draftDirty()) {
      closingPhase = 'idle'
      closingCheckpointRevision = null
      pendingBoundaryReason = null
      options.cancelPendingDocumentAction()
      setMode('active-dirty')
      return toSessionMode()
    }
    closingCheckpointRevision = localRevision
    view.setProps({ editable: () => false })
    view.dom.setAttribute('aria-readonly', 'true')
    closingPhase = 'frozen'
    setMode('closing')
    if (closingCheckpointRevision !== localRevision) {
      closingPhase = 'idle'
      closingCheckpointRevision = null
      pendingBoundaryReason = null
      options.cancelPendingDocumentAction()
      view.setProps({ editable: () => true })
      view.dom.removeAttribute('aria-readonly')
      setMode(draftDirty() ? 'active-dirty' : 'active-clean')
      return toSessionMode()
    }
    const forceHistoryBaseFailure = injectedFailure === 'history-base-failure-during-close'
    if (forceHistoryBaseFailure) injectedFailure = 'none'
    if (forceHistoryBaseFailure || !proveBase()) {
      if (draftDirty()) freezeRecovery('stale-base')
      else finish()
      return toSessionMode()
    }
    if (constraints?.requireClean === true && draftDirty()) {
      closingPhase = 'idle'
      closingCheckpointRevision = null
      view.setProps({ editable: () => true })
      view.dom.removeAttribute('aria-readonly')
      setMode('active-dirty')
      return toSessionMode()
    }
    if (!draftDirty()) {
      navigationDirtyDispatchProof = null
      const selection = view.state.selection
      if (selection instanceof TextSelection && selection.empty) {
        lastMappedAnchor = base.range.from + selection.anchor
        lastMappedHead = base.range.from + selection.head
        lastCloseHandoffProof = {
          ok: true,
          mappedAnchor: lastMappedAnchor,
          mappedHead: lastMappedHead,
          dirtyCommitApplied: false,
        }
      }
      finish()
      return 'off'
    }
    const built = buildLocalImeLocalWindowCommit({ hostState: hostView.state, localState: view.state, range: base.range })
    if (!built.ok) {
      freezeRecovery('invalid-local-state')
      return toSessionMode()
    }
    const beforeDoc = hostView.state.doc
    const beforeCounts = options.getHostTransactionCounts()
    const dispatchRevision = localRevision
    navigationDirtyDispatchProof = activeHostNavigationToken
      ? {
          token: activeHostNavigationToken,
          transaction: built.transaction,
          frozenRevision: dispatchRevision,
          noticeMatched: false,
          invalid: false,
        }
      : null
    lastMappedAnchor = built.mappedAnchor
    lastMappedHead = built.mappedHead
    try {
      if (injectedFailure === 'dispatch-before') {
        injectedFailure = 'none'
        throw new Error('local-window-dispatch-before')
      }
      closingPhase = 'host-dispatch'
      dispatchHostTransaction(built.transaction, view)
      if (injectedFailure === 'dispatch-after') {
        injectedFailure = 'none'
        throw new Error('local-window-dispatch-after')
      }
    } catch {
      const afterCounts = options.getHostTransactionCounts()
      lastCommitHostTransactionDelta = afterCounts.total - beforeCounts.total
      lastCommitHostContentDelta = afterCounts.docChanged - beforeCounts.docChanged
      lastObservedHostAnchor = hostView.state.selection.anchor
      lastObservedHostHead = hostView.state.selection.head
      const hostStateUnchanged =
        classifyLocalImeLocalWindowDispatchException(beforeDoc, hostView.state.doc) === 'before-apply' &&
        lastCommitHostTransactionDelta === 0 &&
        lastCommitHostContentDelta === 0
      const disposition = hostStateUnchanged ? 'before-apply' : 'after-apply'
      return retainDispatchFailure(disposition)
    }
    const afterCounts = options.getHostTransactionCounts()
    lastCommitHostTransactionDelta = afterCounts.total - beforeCounts.total
    lastCommitHostContentDelta = afterCounts.docChanged - beforeCounts.docChanged
    lastObservedHostAnchor = hostView.state.selection.anchor
    lastObservedHostHead = hostView.state.selection.head
    const hostDocMatches = hostView.state.doc.eq(built.transaction.doc)
    const hostSelectionMatches =
      hostView.state.selection.anchor === built.mappedAnchor &&
      hostView.state.selection.head === built.mappedHead
    const localCheckpointMatches =
      localRevision === dispatchRevision &&
      closingCheckpointRevision === dispatchRevision &&
      mode === 'closing' &&
      closingPhase === 'host-dispatch'
    const navigationDirtyNoticeMatches =
      activeHostNavigationToken === null ||
      (
        navigationDirtyDispatchProof !== null &&
        navigationDirtyDispatchProof.token === activeHostNavigationToken &&
        navigationDirtyDispatchProof.transaction === built.transaction &&
        navigationDirtyDispatchProof.frozenRevision === dispatchRevision &&
        navigationDirtyDispatchProof.noticeMatched &&
        !navigationDirtyDispatchProof.invalid
      )
    if (
      lastCommitHostTransactionDelta !== 1 ||
      lastCommitHostContentDelta !== 1 ||
      !hostDocMatches ||
      !hostSelectionMatches ||
      !localCheckpointMatches ||
      !navigationDirtyNoticeMatches
    ) {
      const hostUnchanged =
        hostView.state.doc === beforeDoc &&
        lastCommitHostTransactionDelta === 0 &&
        lastCommitHostContentDelta === 0
      return retainDispatchFailure(hostUnchanged ? 'before-apply' : 'after-apply')
    }
    closingPhase = 'host-applied'
    lastDispatchDisposition = 'none'
    lastCloseHandoffProof = {
      ok: true,
      mappedAnchor: built.mappedAnchor,
      mappedHead: built.mappedHead,
      dirtyCommitApplied: true,
    }
    navigationDirtyDispatchProof = null
    finish()
    return 'off'
  }

  const flushPendingDomForHistoryDecision = (view: EditorView): boolean => {
    const sourceGeneration = generation
    closingPhase = 'dom-flush'
    const flush = flushLocalImePendingDomChanges({
      view,
      validateSource: () =>
        localView === view &&
        base !== null &&
        sourceGeneration === generation &&
        identityValid() &&
        mode !== 'off' &&
        mode !== 'closing' &&
        mode !== 'recovery-required',
      beforeFlushForTest: () => {
        if (injectedFailure === 'inject-change-during-flush') {
          injectedFailure = 'none'
          view.dispatch(view.state.tr.insertText('flush保全'))
        } else if (injectedFailure === 'history-dirty-without-depth') {
          injectedFailure = 'none'
          view.dispatch(view.state.tr.insertText('historyなしdirty').setMeta('addToHistory', false))
        }
      },
    })
    closingPhase = 'idle'
    closingCheckpointRevision = null
    if (!flush.ok) return false
    return localView === view && sourceGeneration === generation && !view.composing
  }

  const historyDispatchDropForTest = (transaction: Transaction): void => {
    const originalDispatchTransaction = hostView.props.dispatchTransaction
    let restored = false
    const restore = () => {
      if (restored) return
      restored = true
      hostView.setProps({ dispatchTransaction: originalDispatchTransaction })
    }
    hostView.setProps({ dispatchTransaction: () => restore() })
    try { hostView.dispatch(transaction) } finally { restore() }
  }

  const historyDispatchForTest = (
    failure: Failure,
  ): ((transaction: Transaction) => void) | undefined => {
    if (failure === 'history-dispatch-drop') return historyDispatchDropForTest
    if (failure === 'history-dispatch-extra') {
      return (transaction) => {
        hostView.dispatch(transaction)
        hostView.dispatch(hostView.state.tr.setSelection(hostView.state.selection))
      }
    }
    if (failure === 'history-dispatch-exception') return () => { throw new Error('history-dispatch') }
    if (failure === 'history-dispatch-after-exception') {
      return (transaction) => {
        hostView.dispatch(transaction)
        throw new Error('history-dispatch-after')
      }
    }
    if (failure === 'history-meta-missing') {
      return (transaction) => {
        transaction.setMeta(PROSEMIRROR_HISTORY_META_KEY, undefined)
        hostView.dispatch(transaction)
      }
    }
    if (failure === 'history-selection-mismatch') {
      return (transaction) => {
        const expected = transaction.selection.from
        const wrong = expected === 1 ? Math.min(2, transaction.doc.content.size) : 1
        transaction.setSelection(TextSelection.create(transaction.doc, wrong))
        hostView.dispatch(transaction)
      }
    }
    if (failure === 'history-doc-mismatch') {
      return (transaction) => {
        const replacement = hostView.state.tr.insertText('history不一致')
        replacement.setMeta(PROSEMIRROR_HISTORY_META_KEY, transaction.getMeta(PROSEMIRROR_HISTORY_META_KEY))
        hostView.dispatch(replacement)
      }
    }
    return undefined
  }

  function routeHistoryCommand(
    operation: LocalImeHistoryOperation,
    keyCode: number | null,
  ): LocalImeEditMenuCommandResult {
    const view = localView
    if (mode === 'off' || !view) return { status: 'not-active' }
    historyShortcutCount += 1
    historyHandoffCalls += 1
    const record = (input: Partial<NonNullable<LocalImeLocalWindowSnapshot['lastHistoryHandoff']>>) => {
      const localUndo = localView ? undoDepth(localView.state) : 0
      const localRedo = localView ? redoDepth(localView.state) : 0
      lastHistoryHandoff = {
        operation,
        owner: 'blocked',
        outcome: 'state-mismatch',
        localUndoDepth: localUndo,
        localRedoDepth: localRedo,
        hostDepthBeforeClose: 0,
        hostDepthAfterClose: null,
        cleanCloseContentTransactionCount: 0,
        hostCommandInvocationCount: 0,
        hostCommandDispatchCount: 0,
        hostContentTransactionCount: 0,
        appendedDocChangedCount: 0,
        ...input,
      }
    }

    const preblocked =
      compositionActive || mode === 'composing' || view.composing
        ? 'composing'
        : keyCode === 229
          ? 'keycode-229'
          : mode === 'closing' || mode === 'recovery-required'
            ? 'closing-or-recovery'
            : pendingBoundaryReason !== null || options.getDocumentActionPending()
              ? 'pending'
              : view.dom.isConnected !== true
                ? 'local-view-detached'
                : !isLocalImeLocalWindowRootDomFocused(view.dom)
                  ? 'local-root-not-focused'
                  : !identityValid()
                    ? 'stale-identity'
                    : null
    if (preblocked) {
      record({ owner: 'blocked', outcome: preblocked })
      if (preblocked === 'composing') return { status: 'blocked', reason: 'composing' }
      if (preblocked === 'closing-or-recovery') {
        return { status: 'blocked', reason: mode === 'recovery-required' ? 'recovery-required' : 'busy' }
      }
      return { status: 'blocked', reason: 'state-mismatch' }
    }

    if (!flushPendingDomForHistoryDecision(view)) {
      record({ owner: 'blocked', outcome: 'pending-dom-flush-failed' })
      return { status: 'blocked', reason: 'state-mismatch' }
    }
    const selection = view.state.selection
    const localSelectionSafe =
      selection instanceof TextSelection &&
      selection.empty &&
      selection.$anchor.depth === 1 &&
      selection.$head.depth === 1
    const localUndo = undoDepth(view.state)
    const localRedo = redoDepth(view.state)
    let hostDepthBeforeClose = -1
    try { hostDepthBeforeClose = readRequestedHostHistoryDepth(hostView.state, operation) } catch { /* invalid depth */ }
    const decision = resolveLocalImeHistoryHandoff({
      operation,
      mode,
      compositionActive: compositionActive || view.composing,
      keyCode,
      pending: pendingBoundaryReason !== null || options.getDocumentActionPending(),
      localViewConnected: view.dom.isConnected,
      localRootFocused: isLocalImeLocalWindowRootDomFocused(view.dom),
      identityValid: identityValid(),
      baseProof: base !== null && proveBase(),
      localSelectionSafe,
      draftClean: !draftDirty(),
      localUndoDepth: localUndo,
      localRedoDepth: localRedo,
      hostRequestedDepth: hostDepthBeforeClose,
    })

    if (decision.owner === 'local') {
      if (!decision.execute) {
        record({
          owner: 'local',
          outcome: 'opposite-depth-preserved',
          localUndoDepth: localUndo,
          localRedoDepth: localRedo,
          hostDepthBeforeClose,
        })
        return { status: 'handled', operation, transactionCount: 0, noop: true }
      }
      const before = localTransactions
      localHistoryCommandCalls += 1
      const handled = (operation === 'undo' ? undo : redo)(view.state, view.dispatch, view)
      const transactionCount = localTransactions - before
      record({
        owner: 'local',
        outcome: handled && transactionCount === 1 ? 'local-command-applied' : 'local-command-mismatch',
        localUndoDepth: localUndo,
        localRedoDepth: localRedo,
        hostDepthBeforeClose,
      })
      if (!handled || transactionCount !== 1) return { status: 'blocked', reason: 'state-mismatch' }
      return { status: 'handled', operation, transactionCount, noop: false }
    }
    if (decision.owner === 'noop') {
      record({
        owner: 'noop', outcome: decision.reason,
        localUndoDepth: localUndo, localRedoDepth: localRedo, hostDepthBeforeClose,
      })
      return { status: 'handled', operation, transactionCount: 0, noop: true }
    }
    if (decision.owner !== 'host') {
      record({
        owner: 'blocked', outcome: decision.owner === 'blocked' ? decision.reason : 'state-mismatch',
        localUndoDepth: localUndo, localRedoDepth: localRedo, hostDepthBeforeClose,
      })
      if (decision.owner === 'blocked' && decision.reason === 'composing') {
        return { status: 'blocked', reason: 'composing' }
      }
      return { status: 'blocked', reason: 'state-mismatch' }
    }

    const identityBeforeClose = options.getDocumentIdentity()
    const countsBeforeClose = options.getHostTransactionCounts()
    const closed = close(LOCAL_IME_LOCAL_WINDOW_HISTORY_HANDOFF_REASON, { requireClean: true })
    const countsAfterClose = options.getHostTransactionCounts()
    const closeContentDelta = countsAfterClose.docChanged - countsBeforeClose.docChanged
    const closeExact =
      closed === 'off' &&
      toSessionMode() === 'off' &&
      lastCloseHandoffProof?.ok === true &&
      lastCloseHandoffProof.dirtyCommitApplied === false &&
      closeContentDelta === 0 &&
      identityBeforeClose === options.getDocumentIdentity() &&
      hostView.dom.isConnected
    if (!closeExact) {
      if (toSessionMode() === 'off' || toSessionMode() === 'recovery-required') {
        options.onHostHistoryHandoffCloseTerminated?.()
      }
      record({
        owner: 'blocked', outcome: 'clean-close-proof-failed',
        localUndoDepth: localUndo, localRedoDepth: localRedo, hostDepthBeforeClose,
        cleanCloseContentTransactionCount: closeContentDelta,
      })
      return { status: 'blocked', reason: 'state-mismatch' }
    }
    options.onHostHistoryHandoffCloseTerminated?.()

    let hostDepthAfterClose = readRequestedHostHistoryDepth(hostView.state, operation)
    if (injectedFailure === 'history-availability-changed') {
      injectedFailure = 'none'
      hostDepthAfterClose = 0
    }
    if (hostDepthAfterClose <= 0) {
      record({
        owner: 'blocked', outcome: 'host-history-availability-changed',
        localUndoDepth: localUndo, localRedoDepth: localRedo, hostDepthBeforeClose,
        hostDepthAfterClose, cleanCloseContentTransactionCount: closeContentDelta,
      })
      return { status: 'blocked', reason: 'state-mismatch' }
    }

    const historyFailure = injectedFailure
    const originalPlugins = hostView.state.plugins
    let appendedPluginInstalled = false
    if (historyFailure === 'history-appended-docchanged') {
      const appendMeta = 'localWindowHistoryAppendedProof'
      const appendPlugin = new Plugin({
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((transaction) => transaction.getMeta(appendMeta) === true)) return null
          return newState.tr.insertText('history追加変更').setMeta('addToHistory', false)
        },
      })
      hostView.updateState(hostView.state.reconfigure({ plugins: [...originalPlugins, appendPlugin] }))
      appendedPluginInstalled = true
    }
    const dispatchForTest = historyFailure === 'history-appended-docchanged'
      ? (transaction: Transaction) => {
          transaction.setMeta('localWindowHistoryAppendedProof', true)
          hostView.dispatch(transaction)
        }
      : historyDispatchForTest(historyFailure)
    if (historyFailure.startsWith('history-')) injectedFailure = 'none'
    hostHistoryCommandCalls += 1
    let result: LocalImeLocalWindowHostHistoryResult
    try {
      result = runLocalImeLocalWindowHostHistoryCommand({
        operation,
        hostView,
        getDocumentIdentity: options.getDocumentIdentity,
        getTransactionCounts: options.getHostTransactionCounts,
        getContentGeneration: options.getHostContentGeneration,
        getTransactionSequence: options.getHostTransactionSequence,
        getTransactionBatchesSince: options.getHostTransactionBatchesSince,
        dispatchCommandTransactionForTest: dispatchForTest,
        forceCommandRejectForTest: historyFailure === 'history-command-rejected',
      })
    } finally {
      if (appendedPluginInstalled) {
        hostView.updateState(hostView.state.reconfigure({ plugins: originalPlugins }))
      }
    }
    record({
      owner: 'host',
      outcome: result.ok ? 'host-command-applied' : result.reason,
      localUndoDepth: localUndo,
      localRedoDepth: localRedo,
      hostDepthBeforeClose,
      hostDepthAfterClose,
      cleanCloseContentTransactionCount: closeContentDelta,
      hostCommandInvocationCount: result.commandInvocationCount,
      hostCommandDispatchCount: result.commandDispatchCount,
      hostContentTransactionCount: result.contentGenerationDelta,
      appendedDocChangedCount: result.appendedDocChangedCount,
    })
    if (!result.ok) return { status: 'blocked', reason: 'state-mismatch' }
    return { status: 'handled', operation, transactionCount: 1, noop: false }
  }

  const handleHostContentChange = (
    notice?: LocalImeHostContentChangeNotice<Transaction>,
  ): 'navigation-dirty-close-candidate' | 'external-content-change' | 'ignored' => {
    const expected = navigationDirtyDispatchProof
    if (activeHostNavigationToken !== null) {
      const exactDirtyCloseNotice =
        expected !== null &&
        expected.token === activeHostNavigationToken &&
        closingPhase === 'host-dispatch' &&
        expected.frozenRevision === closingCheckpointRevision &&
        notice !== undefined &&
        notice.rootTransaction === expected.transaction &&
        notice.rootDocChanged &&
        notice.appendedDocChangedCount === 0
      if (exactDirtyCloseNotice) {
        expected.noticeMatched = true
        return 'navigation-dirty-close-candidate'
      }
      if (expected) expected.invalid = true
      options.onHostNavigationSessionCancel?.('external-content-change')
    }
    if (mode === 'off' || mode === 'closing' || mode === 'recovery-required') {
      return activeHostNavigationToken === null ? 'ignored' : 'external-content-change'
    }
    if (compositionActive || mode === 'composing' || localView?.composing) {
      freezeRecovery('host-content-change')
    } else if (draftDirty()) freezeRecovery('host-content-change')
    else finish()
    return 'external-content-change'
  }

  function onCompositionStart(): void {
    if (mode !== 'active-clean' && mode !== 'active-dirty') return
    compositionActive = true
    setMode('composing')
  }
  function onCompositionUpdate(): void {
    options.schedulePseudoCaretLocalWindowUpdate?.()
    if (injectedFailure !== 'host-content-collision') return
    injectedFailure = 'none'
    // nonpackaged E2E専用。productionのnotifyHostContentChangeと同じ入口を通し、
    // composition中のhost collisionを本文hookなしで決定的に再現する。
    handleHostContentChange()
  }
  function onCompositionEnd(): void {
    if (!compositionActive) return
    compositionActive = false
    const view = localView
    const sourceGeneration = generation
    const finalizeRecovery = mode === 'recovery-required' && recoveryCompositionFinalizationPending
    if (!finalizeRecovery) setMode(draftDirty() ? 'active-dirty' : 'active-clean')
    const reason = pendingBoundaryReason
    if (!view || (!finalizeRecovery && reason === null)) return
    // PM自身のcompositionend処理後にexact 1回だけflush/freezeまたはCLOSINGする。
    // timer / polling / quiet periodではなく、既存compositionend順序adapterである。
    queueMicrotask(() => {
      if (view !== localView || sourceGeneration !== generation) return
      if (finalizeRecovery) {
        const flushed = flushLocalImePendingDomChanges({
          view,
          validateSource: () =>
            view === localView &&
            sourceGeneration === generation &&
            mode === 'recovery-required' &&
            recoveryCompositionFinalizationPending,
        })
        if (!flushed.ok) return
        recoveryCompositionFinalizationPending = false
        hardFreezeRecovery()
        return
      }
      if (reason !== null) {
        const boundedBoundary = reason === LOCAL_IME_LOCAL_WINDOW_BOUNDED_BOUNDARY_REASON
        const shrinkBoundary = reason === LOCAL_IME_LOCAL_WINDOW_SHRINK_BOUNDARY_REASON
        if (boundedBoundary) capCloseInFlight = true
        if (shrinkBoundary) {
          shrinkSignalRevision = localRevision
          shrinkCloseInFlight = true
        }
        let closed = false
        try { closed = close(reason) === 'off' } finally {
          capCloseInFlight = false
          shrinkCloseInFlight = false
        }
        if (!closed) {
          if (boundedBoundary) {
            lastCapCloseStatus = mode === 'recovery-required'
              ? 'recovery-required'
              : 'busy-flushing'
          }
          if (shrinkBoundary) {
            lastShrinkCloseStatus = mode === 'recovery-required'
              ? 'recovery-required'
              : 'busy-flushing'
          }
          return
        }
        if (boundedBoundary) completeBoundedBoundaryClose({ status: 'ready' })
        if (shrinkBoundary) completeShrinkBoundaryClose({ status: 'ready' })
        // BOUNDARYEXIT1: composition 中に latch した boundary は `wait-for-composition`
        // で保留されている。compositionend 後の close 成功をここで診断へ反映する
        // （最初の記録は closed: false のままなので、それを正本にしない）。
        if (
          reason === LOCAL_IME_LOCAL_WINDOW_SPECIAL_INLINE_HANDOFF_REASON &&
          lastSpecialInlineBoundary !== null
        ) {
          const proof = lastCloseHandoffProof
          lastSpecialInlineBoundary = {
            ...lastSpecialInlineBoundary,
            closed: true,
            dirtyCommitApplied: proof !== null && proof.ok && proof.dirtyCommitApplied,
          }
          // compositionend 経路でも close 成功後に同じ caret restore を行う。
          applySpecialInlineBoundaryCaretRestore()
        }
        options.continuePendingDocumentAction(reason)
      }
    })
  }

  const mount = (
    capture: ReturnType<typeof captureLocalImeLocalWindow> & { ok: true },
    proof: LocalImeLocalWindowDomProof,
    writingMode: SupportedEditorWritingMode,
  ) => {
    const surface = options.editorSurface!
    const geometry = readLocalImeLocalWindowRect(
      proof,
      resolveWritingModeLogicalBlockAxis(writingMode),
    )
    if (!geometry) return false
    const style = window.getComputedStyle(proof.paragraphDoms[0])
    const nextWrapper = document.createElement('div')
    nextWrapper.className = 'nyoze-local-window-overlay'
    nextWrapper.setAttribute('data-nyoze-local-window-overlay', 'true')
    Object.assign(nextWrapper.style, {
      left: `${geometry.left}px`, top: `${geometry.top}px`,
      width: `${geometry.width}px`, height: `${geometry.height}px`,
    })
    const root = document.createElement('div')
    root.setAttribute('data-nyoze-local-window-editor', 'true')
    // LOCAL-WINDOW-TYPOGRAPHY-PARITY1: 組版契約は host PM と共有する単一のCSS ruleが
    // `> .ProseMirror` へ直接与える。ここで inline style を手書きすると host 側と
    // 二重定義になり、片側だけ変わる drift 源になるので複製しない（`style` は
    // reservation step の line-height / font-size 読み取りにだけ使う）。
    nextWrapper.append(root)
    surface.append(nextWrapper)
    // capture / local filter / commit で同一の共有capability述語だけを使う。
    // LOCAL-WINDOW-SPECIALINLINE1: docのcapabilityに加えて、special-inline列の不変性と
    // annotation内部へ入らないselectionを同じ場所でfail-closedにする。
    const shape = new Plugin({
      filterTransaction: (transaction, state) => {
        if (!isLocalImeLocalWindowCapableDoc(transaction.doc)) return false
        if (!isLocalImeLocalWindowAllowedLocalSelection(transaction.selection)) {
          specialInlineRejectedTransactions += 1
          return false
        }
        if (
          transaction.docChanged &&
          !areLocalImeLocalWindowSpecialInlinesPreserved(
            collectLocalImeLocalWindowSpecialInlines(state.doc),
            collectLocalImeLocalWindowSpecialInlines(transaction.doc),
          )
        ) {
          specialInlineRejectedTransactions += 1
          return false
        }
        return true
      },
    })
    const localState = EditorState.create({
      doc: capture.capture.localDoc,
      selection: capture.capture.localSelection,
      plugins: [
        shape,
        history(),
        // LOCAL-WINDOW-INLINE-CAP1: hostと同じ共有specから作った mark input rule と、
        // hostのKeymap extensionと同じ vendor `undoInputRule` 意味論の Backspace。
        createInlineMarkInputRulesPlugin(capture.capture.localDoc.type.schema),
        keymap({ Backspace: undoInlineMarkInputRule }),
        keymap(baseKeymap),
        // LOCAL-WINDOW-RUBY-PUNCT-NOWRAP1: 表示専用。plugin stateとDecorationはlocal doc
        // 位置で閉じ、plugin viewのwrapper registryもこのlocal EditorView限定になる。
        // 診断portは渡さない（hostのperf / DOM sync診断と混線させない）。
        createRubyPunctuationNowrapPlugin(),
      ],
    })
    let created: EditorView | null = null
    try {
      created = new EditorView(root, {
        state: localState,
        dispatchTransaction(transaction) {
          if (!created) return
          const finalizingRecovery =
            mode === 'recovery-required' && recoveryCompositionFinalizationPending
          const canApply =
            mode === 'active-clean' ||
            mode === 'active-dirty' ||
            mode === 'composing' ||
            closingPhase === 'dom-flush' ||
            (mode === 'closing' &&
              (closingPhase === 'frozen' || closingPhase === 'host-dispatch')) ||
            finalizingRecovery
          if (!canApply || closingPhase === 'host-applied') return
          const previousLocalSelection = created.state.selection
          const previousLocalBlockCount = created.state.doc.childCount
          let next: EditorState
          try {
            next = created.state.apply(transaction)
          } catch {
            freezeRecovery('invalid-local-state')
            return
          }
          localTransactions += 1
          localRevision += 1
          if (transaction.docChanged) localDocChangedTransactions += 1
          created.updateState(next)
          if (transaction.docChanged) publishDraftDirty()
          if (closingPhase === 'host-dispatch') {
            // host dispatch前半へreentrant local changeが入った場合、最新draftを保持し
            // host未適用として扱う。best-effort commitは行わない。
            freezeRecovery('dispatch-before-apply')
            return
          }
          if (
            mode === 'closing' &&
            closingPhase === 'frozen' &&
            closingCheckpointRevision !== localRevision
          ) {
            closingPhase = 'idle'
            closingCheckpointRevision = null
            pendingBoundaryReason = null
            options.cancelPendingDocumentAction()
            created.setProps({ editable: () => true })
            created.dom.removeAttribute('aria-readonly')
            setMode(draftDirty() ? 'active-dirty' : 'active-clean')
            return
          }
          if (
            transaction.docChanged &&
            mode !== 'composing' &&
            mode !== 'closing' &&
            mode !== 'recovery-required'
          ) setMode(draftDirty() ? 'active-dirty' : 'active-clean')
          if (transaction.docChanged) {
            // BOUNDED1: transactionをexact 1回適用した**後**のPM Docで判定する。
            syncBoundedGrowthCap(previousLocalBlockCount, next.doc.childCount)
          }
          if (transaction.docChanged) scheduleReservation(localRevision)
          // HOSTNAV-KEYS1: 共有 Home/End 2 段階 phase は host view 上の実績なので、
          // local 側の本文変更 / caret 移動（入力・local Arrow・dirty pointer）はすべて
          // 外部起因の失効にあたる。Home/End handoff 自身は
          // `runWithHomeEndSelectionMutation()` の保護区間内なのでここでは失効しない。
          if (transaction.docChanged || !next.selection.eq(previousLocalSelection)) {
            notifyHostHomeEndSelectionChanged()
          }
          // selection だけが動いた local transaction でも hit-test ownership を更新する。
          syncPointerHostFirst()
          // LOCAL-WINDOW-PSEUDOCARET1: doc / selection の local transaction は mode
          // 遷移の有無に関わらず既存 generic rAF へ再評価を要求する。
          options.schedulePseudoCaretLocalWindowUpdate?.()
          // BOUNDARYEXIT1: 本文変更を適用し終えた後の確定 Selection で境界を同期判定する。
          syncSpecialInlineBoundaryLatch()
        },
      })
    } catch {
      nextWrapper.remove()
      return false
    }
    wrapper = nextWrapper
    pointerHostFirstApplied = false
    localView = created
    created.dom.addEventListener('compositionstart', onCompositionStart)
    created.dom.addEventListener('compositionupdate', onCompositionUpdate)
    created.dom.addEventListener('compositionend', onCompositionEnd)
    created.dom.addEventListener('keydown', onLocalKeyDown, true)
    reservationBasePx = geometry.baseBlockExtent
    reservationStepPx = parseCssLineHeightToPx(style.lineHeight, parseCssFontSizeToPx(style.fontSize, 16))
    reservationDeltaPx = 0
    return true
  }

  const prepareForDocumentAction = (
    reason: string,
  ): LocalImeDocumentActionPreparation => {
    if (mode === 'off') return { status: 'ready' }
    if (mode === 'recovery-required') return { status: 'recovery-required' }
    if (mode === 'closing') return { status: 'busy-flushing' }
    if (compositionActive || mode === 'composing' || localView?.composing) {
      if (pendingBoundaryReason !== null && pendingBoundaryReason !== reason) {
        // shared barrierと同じfirst-wins。後着reasonでcontroller側のownerを
        // 上書きせず、最初のcontinuationだけをcompositionendへ運ぶ。
        return { status: 'busy-flushing' }
      }
      if (pendingBoundaryReason === null) pendingBoundaryReason = reason
      return { status: 'wait-for-composition' }
    }
    const result = close(reason)
    if (result === 'off') return { status: 'ready' }
    if (result === 'recovery-required') return { status: 'recovery-required' }
    return { status: 'busy-flushing' }
  }

  return {
    start() {
      if (!options.getEnabled() || mode !== 'off' || !hostView.editable || !hostView.dom.isConnected) {
        return { ok: false, reason: mode === 'off' ? 'no-view' : 'already-active' }
      }
      if (options.getIsSourceModeActive()) return { ok: false, reason: 'source-mode-active' }
      if (options.getIsParagraphPlainActive()) return { ok: false, reason: 'paragraph-plain-active' }
      const writingMode = resolveSupportedEditorWritingMode(
        window.getComputedStyle(hostView.dom).writingMode,
      )
      if (!writingMode) return { ok: false, reason: 'writing-mode-unsupported' }
      const acquisition = acquireLocalImeLocalWindowCapturePlan({
        state: hostView.state,
        view: hostView,
        editorSurface: options.editorSurface,
      })
      if (!acquisition.ok) {
        lastDomRangeProofFailureReason = acquisition.reason
        return { ok: false, reason: 'not-top-level-paragraph' }
      }
      const captured = captureLocalImeLocalWindow(hostView.state, acquisition.plan)
      if (!captured.ok) {
        lastDomRangeProofFailureReason = `capture:${captured.reason}`
        return { ok: false, reason: 'not-top-level-paragraph' }
      }
      const positions = acquisition.blockPositions
      const paragraphs = acquisition.paragraphs
      const proofResult = captureLocalImeLocalWindowDomProof({
        view: hostView,
        editorSurface: options.editorSurface,
        blockPositions: positions,
        paragraphs,
      })
      if (!proofResult.ok) {
        lastDomRangeProofFailureReason = `dom:${proofResult.reason}`
        return { ok: false, reason: 'no-view' }
      }
      generation += 1
      if (injectedFailure === 'stale-generation') generation += 1
      sessionWritingMode = writingMode
      if (!mount(captured as typeof captured & { ok: true }, proofResult.proof, writingMode)) {
        sessionWritingMode = null
        lastDomRangeProofFailureReason = 'mount-geometry'
        return { ok: false, reason: 'no-view' }
      }
      // LOCAL-WINDOW-RESERVATION-PLUGIN-LIFETIME1: plugin は host の固定構成側にある。
      // Start では target を置くだけで、`state.reconfigure()` も plugin 追加もしない。
      reservationOwner = resolveLocalImeLocalWindowReservationOwner(hostView)
      if (!reservationOwner) {
        lastDomRangeProofFailureReason = 'reservation-install'
        removeDom()
        sessionWritingMode = null
        return { ok: false, reason: 'no-view' }
      }
      reservationOwner.setTarget({
        positions,
        nodes: paragraphs,
      })
      hostView.dom.setAttribute('data-nyoze-host-local-window-active', 'true')
      base = {
        documentIdentity: injectedFailure === 'stale-document' ? `${options.getDocumentIdentity()}-stale` : options.getDocumentIdentity(),
        controllerGeneration: injectedFailure === 'stale-generation' ? generation - 1 : generation,
        hostContentGeneration: options.getHostContentGeneration(),
        hostDoc: hostView.state.doc,
        range: captured.capture.range,
        originalFragment: captured.capture.originalFragment,
        domProof: proofResult.proof,
      }
      originalLocalDoc = captured.capture.localDoc
      acquisitionMode = captured.capture.plan.mode
      capturedBlockCount = captured.capture.localDoc.childCount
      capturedHostStartIndex = captured.capture.plan.startIndex
      capturedHostEndIndex = captured.capture.plan.endIndex
      viewportIntersectingBlockCount = captured.capture.plan.viewportIntersectingBlockCount
      logicalGuardCount = captured.capture.plan.logicalGuardCount
      lastDomRangeProofFailureReason = null
      capLatchHeld = false
      shrinkLatchHeld = false
      shrinkSignalRevision = null
      shrinkOutsideBeforeDoc = null
      activeHostContentStart = options.getHostContentGeneration()
      localTransactions = 0
      localDocChangedTransactions = 0
      lastCommitHostTransactionDelta = null
      lastCommitHostContentDelta = null
      lastMappedAnchor = null
      lastMappedHead = null
      lastObservedHostAnchor = null
      lastObservedHostHead = null
      lastDispatchDisposition = 'none'
      lastCloseHandoffProof = null
      lastShiftArrowHandoff = null
      lastSpecialInlineHandoff = null
      lastSpecialInlineBoundary = null
      specialInlineBoundaryLatched = false
      specialInlineBoundaryClosePending = false
      specialInlineBoundaryCalls = 0
      lastArrowBoundary = null
      arrowBoundaryCalls = 0
      lastHostNavKey = null
      hostNavKeyCalls = 0
      specialInlineRejectedTransactions = 0
      compositionActive = false
      pendingBoundaryReason = null
      closingPhase = 'idle'
      closingCheckpointRevision = null
      localRevision = 0
      recoveryIntent = null
      recoveryCompositionFinalizationPending = false
      publishedDraftDirty = false
      setMode('active-clean')
      localView?.focus()
      // Start成功の再評価はfocus取得後。setMode時のrAFがfocus前に消費されても
      // native-hidden / overlay を取りこぼさない。
      options.schedulePseudoCaretLocalWindowUpdate?.()
      scheduleReservation()
      return { ok: true, sessionGeneration: generation }
    },
    stop: (reason = 'explicit-stop') => close(reason),
    prepareForDocumentAction: (reason = 'document-action') => prepareForDocumentAction(reason),
    notifyDocumentChange(reason) {
      const result = prepareForDocumentAction(reason)
      if (result.status !== 'ready') return false
      generation += 1
      return true
    },
    notifyHostContentChange: handleHostContentChange,
    readRecoveryProbe: () => ({
      recoveryIntent: mode === 'recovery-required' ? recoveryIntent : null,
      dispatchDisposition: lastDispatchDisposition,
      compositionActive,
      compositionFinalizationPending: recoveryCompositionFinalizationPending,
      draftRetained: draftDirty(),
      draftLength: draftDirty() && localView ? localView.state.doc.content.size : null,
      // proveBaseはbase / identity / generation / Fragment / DOM proofの既存正本。
      baseProofExact: mode === 'recovery-required' && proveBase(),
      localRootPresent: localView?.dom.isConnected === true,
    }),
    readRetainedRecoveryDraftDoc: () =>
      mode === 'recovery-required' && localView ? localView.state.doc : null,
    retryRecoveryCommitToOff() {
      const view = localView
      if (
        mode !== 'recovery-required' ||
        recoveryIntent !== 'dispatch-before-apply' ||
        lastDispatchDisposition === 'after-apply' ||
        compositionActive ||
        recoveryCompositionFinalizationPending ||
        !view ||
        !draftDirty() ||
        !proveBase()
      ) return toSessionMode()
      // 明示Retryは「同じretained draftのclose / commitだけ」を新しい試行として
      // 完了させる。元のsave / tab / load / close / quit / selection intentは
      // recovery突入時にcancel済みで、ここでもqueue / replayしない。
      view.setProps({ editable: () => true })
      view.dom.removeAttribute('aria-readonly')
      view.dom.tabIndex = 0
      recoveryIntent = null
      recoveryCompositionFinalizationPending = false
      closingPhase = 'idle'
      closingCheckpointRevision = null
      pendingBoundaryReason = null
      // 旧epochのboundary latch / pending callbackは再利用しない。
      capLatchHeld = false
      shrinkLatchHeld = false
      shrinkSignalRevision = null
      shrinkOutsideBeforeDoc = null
      specialInlineBoundaryLatched = false
      specialInlineBoundaryClosePending = false
      setMode('active-dirty')
      // 既存closeがpending DOM flush → revision checkpoint → window全体commit
      // exact 1 → mapped caret同一transaction → post-dispatch proof → cleanupを
      // 担う。失敗時は既存分類のまま recovery-required でdraftを保持する。
      return close(LOCAL_IME_LOCAL_WINDOW_RECOVERY_RETRY_REASON)
    },
    resolveRecoveryDiscard() { options.cancelPendingDocumentAction(); finish(); return 'off' },
    forceReset() { options.cancelPendingDocumentAction(); generation += 1; finish() },
    destroy() {
      if (mode === 'off') return true
      if (!draftDirty() && !compositionActive && mode !== 'composing') { finish(); return true }
      freezeRecovery('destroy')
      return false
    },
    isActive: () => mode !== 'off',
    isPayloadBearing: () =>
      draftDirty() || compositionActive || mode === 'composing' || mode === 'recovery-required',
    getSessionMode: toSessionMode,
    resolvePointerSelectionHandoffEligibility,
    getRetainedDraftLength: () => draftDirty() && localView ? localView.state.doc.content.size : null,
    getPseudoCaretExternalGeometrySource: resolvePseudoCaretExternalGeometrySource,
    snapshot: () => ({
      mode, generation, localRootPresent: localView?.dom.isConnected === true,
      sourceDecorationPresent: reservationOwner?.hasTarget() === true,
      sourceDecorationCount: hostView.dom.querySelectorAll('.nyoze-local-window-source').length,
      hostContentTransactionsWhileActive: options.getHostContentGeneration() - activeHostContentStart,
      localTransactions, localDocChangedTransactions, lastCommitHostTransactionDelta,
      lastCommitHostContentDelta,
      lastMappedAnchor, lastMappedHead, lastObservedHostAnchor, lastObservedHostHead,
      reservationBasePx, reservationLocalExtentPx,
      reservationDeltaPx, reservationFramePending: reservationFrame !== null,
      lastDispatchDisposition, draftDirty: draftDirty(),
      localDocContentSize: localView?.state.doc.content.size ?? null,
      localBlockCount: localView?.state.doc.childCount ?? null,
      acquisitionMode,
      minimumBlocks: LOCAL_IME_LOCAL_WINDOW_MIN_BLOCKS,
      captureMaximumBlocks: LOCAL_IME_LOCAL_WINDOW_CAPTURE_MAX_BLOCKS,
      growthHardCap: LOCAL_IME_LOCAL_WINDOW_GROWTH_HARD_CAP,
      capturedBlockCount,
      capturedHostStartIndex,
      capturedHostEndIndex,
      capturedBlockNodeSizes: base
        ? Array.from({ length: base.originalFragment.childCount }, (_, index) =>
            base!.originalFragment.child(index).nodeSize)
        : null,
      currentLocalBlockIndex: currentLocalBlockIndex(),
      viewportIntersectingBlockCount,
      logicalGuardCount,
      capBoundaryCalls,
      capLatchHeld,
      capBeforeBlockCount,
      capAfterBlockCount,
      lastCapCloseStatus,
      capDirtyExactOneApplied,
      boundedFreshAcquisitionRequestCount,
      shrinkLatchHeld,
      shrinkBeforeExtentPx,
      shrinkAfterExtentPx,
      shrinkTolerancePx,
      shrinkBoundaryCalls,
      lastShrinkCloseStatus,
      shrinkDirtyExactOneApplied,
      shrinkFreshAcquisitionRequestCount,
      shrinkOutsidePrefixPreserved,
      shrinkOutsideSuffixPreserved,
      lastDomRangeProofFailureReason,
      localUndoDepth: localView ? undoDepth(localView.state) : null,
      localRedoDepth: localView ? redoDepth(localView.state) : null,
      historyHandoffCalls,
      localHistoryCommandCalls,
      hostHistoryCommandCalls,
      lastHistoryHandoff,
      lastSpecialInlineHandoff,
      lastSpecialInlineBoundary,
      specialInlineBoundaryCalls,
      lastArrowBoundary,
      lastHostNavKey,
      hostNavKeyCalls,
      homeEndStatePhase: _getHomeEndState()?.phase ?? null,
      arrowBoundaryCalls,
      localSelectionAnchor: localView?.state.selection.anchor ?? null,
      localSelectionHead: localView?.state.selection.head ?? null,
      hostSelectionAnchor: hostView.state.selection.anchor,
      hostSelectionHead: hostView.state.selection.head,
      localSelectionMappedAnchor:
        base && localView ? base.range.from + localView.state.selection.anchor : null,
      localSelectionMappedHead:
        base && localView ? base.range.from + localView.state.selection.head : null,
      specialInlineRejectedTransactions,
      localSpecialInlineCount: localView
        ? collectLocalImeLocalWindowSpecialInlines(localView.state.doc).length
        : null,
      localSentinelCount:
        localView?.dom.querySelectorAll('[data-nyoze-special-inline-boundary]').length ?? 0,
      localRubyPunctPluginCount: localView
        ? localView.state.plugins.filter(
            (plugin) => (plugin as { spec?: { key?: unknown } }).spec?.key ===
              rubyPunctuationNowrapPluginKey,
          ).length
        : 0,
      localRubyPunctRunCount: localView
        ? rubyPunctuationNowrapPluginKey.getState(localView.state)?.runs.length ?? null
        : null,
      localRubyPunctWrapperCount:
        localView?.dom.querySelectorAll(`.${RUBY_PUNCT_RUN_WRAPPER_CLASS}`).length ?? 0,
      historyShortcutCount, compositionActive, pendingBoundaryReason, closingPhase,
      localRevision, recoveryIntent, recoveryCompositionFinalizationPending,
      // 実DOMの`pointer-events`を読む。内部flagではなく適用結果を証拠にする。
      pointerHostFirst: wrapper?.style.pointerEvents === 'none',
      hostSelectionIsAll: isHostFullDocumentAllSelection(hostView.state),
      lastShiftArrowHandoff,
    }),
    getNavigationPerformanceSelectionForTest: () => {
      if (!localView) return null
      return readLocalImeNavigationPerformanceSelectionSnapshot({
        view: localView,
        owner: 'local-window',
        ownerIdentity: options.getDocumentIdentity(),
        generation,
      })
    },
    setFailureForTest: (failure) => { injectedFailure = failure },
    dispatchHostContentChangeForTest(kind) {
      if (kind === 'root') {
        hostView.dispatch(hostView.state.tr.insertText('外部変更').setMeta('addToHistory', false))
        return true
      }
      // nonpackaged E2E専用。docを変えないroot metaにだけ応答する一時PM pluginで、
      // rootDocChanged=false / appendedDocChangedCount=1の実applyTransaction batchを作る。
      // state/doc/selectionは通常dispatch結果を保ったまま、pluginだけ同期reconfigureで戻す。
      const appendMeta = 'localWindowHostNavigationAppendedProof'
      const originalPlugins = hostView.state.plugins
      const appendOnlyPlugin = new Plugin({
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((transaction) => transaction.getMeta(appendMeta) === true)) {
            return null
          }
          return newState.tr.insertText('外部追加変更').setMeta('addToHistory', false)
        },
      })
      hostView.updateState(hostView.state.reconfigure({
        plugins: [...originalPlugins, appendOnlyPlugin],
      }))
      try {
        hostView.dispatch(hostView.state.tr.setMeta(appendMeta, true).setMeta('addToHistory', false))
      } finally {
        hostView.updateState(hostView.state.reconfigure({ plugins: originalPlugins }))
      }
      return true
    },
    setLocalSelectionForTest(anchor, head = anchor) {
      const view = localView
      if (
        !view || !view.dom.isConnected ||
        !Number.isInteger(anchor) || !Number.isInteger(head) ||
        mode === 'closing' || mode === 'recovery-required' || mode === 'composing' ||
        compositionActive || view.composing || pendingBoundaryReason !== null ||
        !identityValid() || !proveBase()
      ) return false
      try {
        const $anchor = view.state.doc.resolve(anchor)
        const $head = view.state.doc.resolve(head)
        if (
          $anchor.depth !== 1 || $head.depth !== 1 ||
          !$anchor.parent.isTextblock || !$head.parent.isTextblock
        ) return false
        view.dispatch(
          view.state.tr
            .setSelection(TextSelection.create(view.state.doc, anchor, head))
            .setMeta('addToHistory', false),
        )
        return view.state.selection.anchor === anchor && view.state.selection.head === head
      } catch {
        return false
      }
    },
    dispatchLocalGrowthForTest(additionalBlocks, text = '') {
      const view = localView
      if (
        !view || !Number.isInteger(additionalBlocks) || additionalBlocks < 0 ||
        additionalBlocks > LOCAL_IME_LOCAL_WINDOW_GROWTH_HARD_CAP * 2 ||
        (mode !== 'active-clean' && mode !== 'active-dirty' && mode !== 'composing')
      ) return false
      const paragraphType = view.state.schema.nodes.paragraph
      if (!paragraphType) return false
      try {
        const transaction = view.state.tr
        if (text) transaction.insertText(text)
        for (let index = 0; index < additionalBlocks; index += 1) {
          transaction.insert(transaction.doc.content.size, paragraphType.create())
        }
        transaction.setSelection(TextSelection.create(
          transaction.doc,
          transaction.doc.content.size - 1,
        ))
        view.dispatch(transaction)
        return true
      } catch {
        return false
      }
    },
    routeEditMenuCommand(operation) {
      const view = localView
      if (operation === 'select-all') {
        const decision = resolveLocalImeLocalWindowSelectAllHandoff({
          operation,
          mode,
          compositionActive: compositionActive || view?.composing === true,
          pendingBoundary: pendingBoundaryReason !== null,
          localViewConnected: view?.dom.isConnected === true,
          localRootFocused: isLocalImeLocalWindowRootDomFocused(view?.dom),
          identityValid: identityValid(),
          baseProof: base !== null && proveBase(),
        })
        if (!decision.handoff) {
          if (mode === 'off' || !view) return { status: 'not-active' }
          if (decision.reason === 'local-root-not-focused') return { status: 'not-active' }
          if (decision.reason === 'composing') return { status: 'blocked', reason: 'composing' }
          if (decision.reason === 'closing-or-busy' || decision.reason === 'pending-boundary') {
            return { status: 'blocked', reason: 'busy' }
          }
          if (decision.reason === 'recovery-required') {
            return { status: 'blocked', reason: 'recovery-required' }
          }
          return { status: 'blocked', reason: 'state-mismatch' }
        }
        const preparation = prepareForDocumentAction(LOCAL_IME_LOCAL_WINDOW_SELECT_ALL_HANDOFF_REASON)
        if (preparation.status === 'wait-for-composition') {
          return { status: 'blocked', reason: 'composing' }
        }
        if (preparation.status === 'busy-flushing') return { status: 'blocked', reason: 'busy' }
        if (preparation.status === 'recovery-required') {
          return { status: 'blocked', reason: 'recovery-required' }
        }
        if (preparation.status !== 'ready') return { status: 'blocked', reason: 'state-mismatch' }
        const applied = applyLocalImeLocalWindowHostSelectAll({
          hostView,
          getHostTransactionCounts: options.getHostTransactionCounts,
        })
        if (!applied.ok) return { status: 'blocked', reason: 'state-mismatch' }
        return {
          status: 'handled',
          operation,
          transactionCount: applied.transactionCount,
          noop: false,
        }
      }
      return routeHistoryCommand(operation, null)
    },
    readSearchCloseFocusLive: () => ({
      mode,
      generation,
      documentIdentity: options.getDocumentIdentity(),
      localRootConnected: localView?.dom.isConnected === true,
      compositionActive:
        compositionActive || mode === 'composing' || localView?.composing === true,
    }),
    tryFocusLocalWindowRoot(proof) {
      const documentIdentity = options.getDocumentIdentity()
      if (!documentIdentity || documentIdentity !== proof.documentIdentity) return false
      if (generation !== proof.controllerGeneration) return false
      if (mode !== 'active-clean' && mode !== 'active-dirty') return false
      const view = localView
      if (!view || view.dom.isConnected !== true) return false
      try { view.focus() } catch { return false }
      return true
    },
  }
}
