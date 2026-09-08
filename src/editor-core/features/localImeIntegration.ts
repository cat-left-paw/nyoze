/**
 * EditorCoreとLocal Windowの結線を集約するhost integration。
 *
 * Local Windowだけを生成し、legacy controller、target、scheduler、DOMは生成しない。
 */

import type { Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import type { LineBreakPolicy, MarkdownDocumentOptions } from '../types'
import type {
  RubyPunctuationDomSyncCounts,
  RubyPunctuationDomSyncToken,
  RubyPunctuationNowrapApplyDiagnostics,
} from '../extensions/rubyPunctuationNowrapState'
import type {
  LocalImeEditMenuCommandResult,
  LocalImeEditMenuOperation,
} from './localImeEditMenuCommandState'
import type { LocalImePerfSpan } from './localImePerformanceSpan'
import type { LocalImePostFlushFrameConsumer } from './localImePostFlushFrameState'
import {
  selectLocalImePseudoCaretExternalGeometrySource,
  type LocalImePseudoCaretGeometrySource,
} from './localImePseudoCaretGeometrySource'
import {
  noteLocalImeHostTransaction,
  type LocalImeHostTransactionCounts,
} from './localImeHostTransaction'
import {
  createLocalImeLocalWindowIntegration,
  type LocalImeLocalWindowIntegrationHandle,
} from './localImeLocalWindowIntegration'
import type { LocalImeLocalWindowSnapshot } from './localImeLocalWindowController'
import type {
  LocalImeHostContentChangeNotice,
  LocalImeHostInputCycleToken,
  LocalImeHostInputSelectionStableNotice,
} from './localImeHostTransactionNotice'
import type { LocalImeHostHistoryTransactionBatch } from './localImeLocalWindowHistoryHandoff'
import {
  readLocalImeNavigationPerformanceSelectionSnapshot,
  type LocalImeNavigationPerformanceSelectionSnapshot,
} from './localImeNavigationPerformanceSnapshot'

export type LocalImeAttachOptions = {
  view: EditorView
  editorSurface: HTMLElement | null
  getIsSourceModeActive: () => boolean
  getIsParagraphPlainActive: () => boolean
  getHostCompositionActive: () => boolean
  getLineBreakPolicy: () => LineBreakPolicy
  getDocumentMarkdownOptions: () => MarkdownDocumentOptions
  schedulePseudoCaretLocalWindowUpdate?: () => void
  notePseudoCaretLocalWindowKeyboardIntent?: (
    event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>,
  ) => void
  onBareArrowNavigationDisplayHandoff?: (event: KeyboardEvent) => void
  onHomeEndNavigationHandoff?: (event: KeyboardEvent) => void
  onPageUpDownNavigationHandoff?: (event: KeyboardEvent) => void
}

export type LocalImeIntegrationHandle = {
  isActive: () => boolean
  isHistoryBlocking: () => boolean
  notifyHostSelectionStablePoint: (fromHistory?: boolean) => void
  notifyHostContentChange: (
    fromHistory?: boolean,
    notice?: LocalImeHostContentChangeNotice<Transaction>,
  ) => void
  notifyHostInputCycleStart: (cycle: LocalImeHostInputCycleToken) => void
  notifyHostDirectInputConfirmed: (cycle: LocalImeHostInputCycleToken) => void
  notifyHostInputSelectionStablePoint: (
    notice: LocalImeHostInputSelectionStableNotice<Transaction>,
  ) => void
  cancelHostInputCycle: (cycle: LocalImeHostInputCycleToken) => void
  notifyHostCompositionStart: (cycle?: LocalImeHostInputCycleToken) => void
  notifyHostCompositionEnd: (cycle?: LocalImeHostInputCycleToken) => void
  tryCommitShortcutEdit: (operation: 'undo' | 'redo') => boolean
  routeEditMenuCommand: (operation: LocalImeEditMenuOperation) => LocalImeEditMenuCommandResult
  noteTransaction: (transaction: Transaction) => void
  noteTransactionBatch: (notice: {
    rootTransaction: Transaction
    appendedTransactions: readonly Transaction[]
  }) => void
  beginFlushPerfSpan: (span: LocalImePerfSpan) => (() => void) | null
  runWithFlushPerfSpan: <T>(span: LocalImePerfSpan, run: () => T) => T
  beginRubyDecorationApplyDiagnostics: () => RubyPunctuationNowrapApplyDiagnostics | null
  readRubyDecorationDomSyncToken: () => RubyPunctuationDomSyncToken | null
  reportRubyDecorationDomSync: (
    token: RubyPunctuationDomSyncToken,
    counts: RubyPunctuationDomSyncCounts,
  ) => void
  joinPostFlushFrame: (consumer: LocalImePostFlushFrameConsumer) => (() => void) | null
  getPseudoCaretExternalGeometrySource: () => LocalImePseudoCaretGeometrySource | null
  attach: (options: LocalImeAttachOptions) => void
  notifyDocumentChange: (reason: string) => boolean
  /**
   * LOCAL-WINDOW-PACKAGED-REARM-POLISH1: 明示操作 (writing-mode 切替 / 同一 tab
   * document 切替) の bounded token 入口。Local Window の既存 AUTOARM へそのまま渡す。
   */
  beginLocalWindowTransition: (
    kind: import('./localImeLocalWindowAutoArm').LocalImeLocalWindowTransitionKind,
  ) => boolean
  cancelLocalWindowTransition: (
    kind: import('./localImeLocalWindowAutoArm').LocalImeLocalWindowTransitionKind,
  ) => void
  completeLocalWindowTransition: (
    kind: import('./localImeLocalWindowAutoArm').LocalImeLocalWindowTransitionKind,
    expectedWritingMode?: string | null,
  ) => boolean
  getLocalWindowSnapshotForE2e: () => LocalImeLocalWindowSnapshot | null
  injectLocalWindowRestartStartFailureForE2e: (
    kind: 'start-wiring' | 'start-wiring-and-settlement',
  ) => void
  setLocalWindowFailureForE2e: (
    failure: Parameters<LocalImeLocalWindowIntegrationHandle['setFailureForTest']>[0],
  ) => void
  dispatchLocalWindowHostContentChangeForE2e: (
    kind: import('./localImeLocalWindowController').LocalImeLocalWindowHostContentChangeForTest,
  ) => boolean
  setLocalWindowSelectionForE2e: (anchor: number, head?: number) => boolean
  dispatchLocalWindowGrowthForE2e: (additionalBlocks: number, text?: string) => boolean
  readSearchCloseFocusLive: () => ReturnType<
    LocalImeLocalWindowIntegrationHandle['readSearchCloseFocusLive']
  >
  tryFocusLocalWindowRoot: (
    proof: Parameters<LocalImeLocalWindowIntegrationHandle['tryFocusLocalWindowRoot']>[0],
  ) => boolean
  getNavigationPerformanceSnapshotForE2e: () => {
    selection: LocalImeNavigationPerformanceSelectionSnapshot
    hostTransactions: LocalImeHostTransactionCounts
    recentHostBatches: readonly {
      sequence: number
      root: { docChanged: boolean; selectionSet: boolean }
      appended: readonly { docChanged: boolean; selectionSet: boolean }[]
    }[]
    localTransactions: { root: number; docChanged: number; selectionOnly: number } | null
  } | null
  destroy: () => boolean
}

export function createLocalImeIntegration(): LocalImeIntegrationHandle {
  let hostView: EditorView | null = null
  let documentLoadSeq = 0
  let transactionCount = 0
  const hostTransactionBatches: LocalImeHostHistoryTransactionBatch[] = []
  const hostTransactionCounts: LocalImeHostTransactionCounts = {
    total: 0,
    docChanged: 0,
    blurMeta: 0,
    focusMeta: 0,
    selectionOnly: 0,
    otherNonContent: 0,
  }
  const localWindow = createLocalImeLocalWindowIntegration()

  return {
    isActive: () => localWindow.isActive(),
    isHistoryBlocking: () => localWindow.isPayloadBearing(),
    tryCommitShortcutEdit: (operation) =>
      localWindow.routeEditMenuCommand(operation).status !== 'not-active',
    routeEditMenuCommand: (operation) => localWindow.routeEditMenuCommand(operation),
    noteTransaction: (transaction) => {
      transactionCount += 1
      noteLocalImeHostTransaction(hostTransactionCounts, transaction)
    },
    noteTransactionBatch: ({ rootTransaction, appendedTransactions }) => {
      hostTransactionBatches.push({
        sequence: transactionCount,
        rootTransaction,
        appendedTransactions,
      })
      if (hostTransactionBatches.length > 16) hostTransactionBatches.shift()
    },
    // Retired strategy diagnostics no longer own editor dispatch spans. Keeping
    // this no-op port preserves existing editor instrumentation call sites.
    runWithFlushPerfSpan: (_span, run) => run(),
    beginFlushPerfSpan: () => null,
    beginRubyDecorationApplyDiagnostics: () => null,
    readRubyDecorationDomSyncToken: () => null,
    reportRubyDecorationDomSync: () => undefined,
    joinPostFlushFrame: () => null,
    getPseudoCaretExternalGeometrySource: () =>
      selectLocalImePseudoCaretExternalGeometrySource({
        localWindow: localWindow.getPseudoCaretExternalGeometrySource(),
      }),
    attach(options) {
      if (hostView) return
      hostView = options.view
      localWindow.attach({
        view: options.view,
        editorSurface: options.editorSurface,
        getDocumentIdentity: () => `local-window-doc-${documentLoadSeq}`,
        getHostContentGeneration: () => hostTransactionCounts.docChanged,
        getHostTransactionCounts: () => ({
          total: hostTransactionCounts.total,
          docChanged: hostTransactionCounts.docChanged,
          selectionOnly: hostTransactionCounts.selectionOnly,
        }),
        getHostTransactionSequence: () => transactionCount,
        getHostTransactionBatchesSince: (sequence) =>
          hostTransactionBatches.filter((batch) => batch.sequence > sequence),
        getIsSourceModeActive: options.getIsSourceModeActive,
        getIsParagraphPlainActive: options.getIsParagraphPlainActive,
        getHostCompositionActive: options.getHostCompositionActive,
        getOtherStrategyActive: () => false,
        schedulePseudoCaretLocalWindowUpdate: options.schedulePseudoCaretLocalWindowUpdate,
        notePseudoCaretLocalWindowKeyboardIntent:
          options.notePseudoCaretLocalWindowKeyboardIntent,
        onBareArrowNavigationDisplayHandoff:
          options.onBareArrowNavigationDisplayHandoff,
        onHomeEndNavigationHandoff: options.onHomeEndNavigationHandoff,
        onPageUpDownNavigationHandoff: options.onPageUpDownNavigationHandoff,
        getLineBreakPolicy: options.getLineBreakPolicy,
        getDocumentMarkdownOptions: options.getDocumentMarkdownOptions,
      })
    },
    notifyDocumentChange(reason) {
      if (!localWindow.notifyDocumentChange(reason)) return false
      documentLoadSeq += 1
      hostTransactionBatches.length = 0
      return true
    },
    beginLocalWindowTransition: (kind) => localWindow.beginTransition(kind),
    cancelLocalWindowTransition: (kind) => localWindow.cancelTransition(kind),
    completeLocalWindowTransition: (kind, expectedWritingMode) =>
      localWindow.completeTransition(kind, expectedWritingMode),
    getLocalWindowSnapshotForE2e: () => localWindow.snapshot(),
    setLocalWindowFailureForE2e: (failure) => localWindow.setFailureForTest(failure),
    injectLocalWindowRestartStartFailureForE2e: (kind) =>
      localWindow.injectRestartStartFailureForTest(kind),
    dispatchLocalWindowHostContentChangeForE2e: (kind) =>
      localWindow.dispatchHostContentChangeForTest(kind),
    setLocalWindowSelectionForE2e: (anchor, head) =>
      localWindow.setLocalSelectionForTest(anchor, head),
    dispatchLocalWindowGrowthForE2e: (additionalBlocks, text) =>
      localWindow.dispatchLocalGrowthForTest(additionalBlocks, text),
    readSearchCloseFocusLive: () => localWindow.readSearchCloseFocusLive(),
    tryFocusLocalWindowRoot: (proof) => localWindow.tryFocusLocalWindowRoot(proof),
    getNavigationPerformanceSnapshotForE2e: () => {
      if (!hostView) return null
      const local = localWindow.getNavigationPerformanceSelectionForTest()
      const localSnapshot = localWindow.snapshot()
      return {
        selection:
          local ??
          readLocalImeNavigationPerformanceSelectionSnapshot({
            view: hostView,
            owner: 'host-pm',
            ownerIdentity: `doc-${documentLoadSeq}`,
            generation: documentLoadSeq,
          }),
        hostTransactions: { ...hostTransactionCounts },
        recentHostBatches: hostTransactionBatches.map((batch) => ({
          sequence: batch.sequence,
          root: {
            docChanged: batch.rootTransaction.docChanged,
            selectionSet: batch.rootTransaction.selectionSet,
          },
          appended: batch.appendedTransactions.map((transaction) => ({
            docChanged: transaction.docChanged,
            selectionSet: transaction.selectionSet,
          })),
        })),
        localTransactions:
          local && localSnapshot
            ? {
                root: localSnapshot.localTransactions,
                docChanged: localSnapshot.localDocChangedTransactions,
                selectionOnly:
                  localSnapshot.localTransactions - localSnapshot.localDocChangedTransactions,
              }
            : null,
      }
    },
    notifyHostSelectionStablePoint: (fromHistory) =>
      localWindow.notifyHostSelectionStablePoint(fromHistory),
    notifyHostInputCycleStart: (cycle) => localWindow.notifyHostInputCycleStart(cycle),
    notifyHostDirectInputConfirmed: (cycle) =>
      localWindow.notifyHostDirectInputConfirmed(cycle),
    notifyHostInputSelectionStablePoint: (notice) =>
      localWindow.notifyHostInputSelectionStablePoint(notice),
    cancelHostInputCycle: (cycle) => localWindow.cancelHostInputCycle(cycle),
    notifyHostContentChange: (_fromHistory, notice) =>
      localWindow.notifyHostContentChange(notice),
    notifyHostCompositionStart: (cycle) => localWindow.notifyHostCompositionStart(cycle),
    notifyHostCompositionEnd: (cycle) => localWindow.notifyHostCompositionEnd(cycle),
    destroy() {
      if (!localWindow.destroy()) return false
      hostView = null
      return true
    },
  }
}
