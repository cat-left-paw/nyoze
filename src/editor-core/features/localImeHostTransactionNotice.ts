/**
 * OVERLAY-ARMRACE1: host PM transaction を局所 IME auto-arm へ伝える薄い adapter。
 *
 * TipTap の同期的な transaction 通知だけを入口にする。`keydown` / `beforeinput` /
 * `compositionstart` の owner state machine、IME event 順序 taxonomy、timer、polling、
 * quiet period、汎用 input-intent framework は持たない。
 *
 * 失効の唯一の入口は `onTransaction` である。TipTap の `dispatchTransaction` は
 * `transaction` → `selectionUpdate` → `update` の順に emit し、root transaction が
 * 適用された dispatch では `transaction` だけが必ず emit される。`update` は
 *
 * - root transaction が `preventUpdate` meta を持つとき
 * - root も appended も doc を変えていないとき
 *
 * に skip される。さらに **plugin の appendTransaction だけが doc を変えた場合、
 * `update` / `selectionUpdate` へ渡る root transaction の `docChanged` は false** に
 * なる。よってその 2 つを入口にすると host content change を取りこぼし、pending arm が
 * host 入力を跨いで生存し得る。root と appended の両方を `onTransaction` で分類するのが
 * 唯一の漏れない境界である。
 */

import { isProseMirrorHistoryTransaction } from './localImeHistoryTransaction'
import type { LocalImeHostInputCycleToken } from './localImeHostInputCycle'
import { NOTE_ANCHOR_DOCUMENT_LOAD_META_KEY } from './noteAnchorProtection'

function isLocalImeHostContentChange(input: {
  docChanged: boolean
  documentLoad: boolean
}): boolean {
  return input.docChanged && !input.documentLoad
}

export type {
  LocalImeHostInputCycleToken,
  LocalImeHostInputSource,
} from './localImeHostInputCycle'

type LocalImeHostTransactionLike = {
  docChanged: boolean
  selectionSet?: boolean
  getMeta: (key: string) => unknown
}

export type LocalImeHostContentChangeNotice<T extends LocalImeHostTransactionLike> = {
  readonly rootTransaction: T
  readonly appendedTransactions: readonly T[]
  readonly fromHistory: boolean
  readonly rootDocChanged: boolean
  readonly appendedDocChangedCount: number
  /** HOSTINPUT-REARM1: DOM input cycleと実PM batchを結ぶbounded token。 */
  readonly hostInputCycle: LocalImeHostInputCycleToken | null
}

export type LocalImeHostInputSelectionStableNotice<T extends LocalImeHostTransactionLike> = {
  readonly cycle: LocalImeHostInputCycleToken
  /** content proofと同じroot transactionであることをidentityで再証明する。 */
  readonly rootTransaction: T
}

export type LocalImeHostTransactionBatchNotice<T extends LocalImeHostTransactionLike> = {
  readonly rootTransaction: T
  readonly appendedTransactions: readonly T[]
}

export type LocalImeHostTransactionSink<T extends LocalImeHostTransactionLike> = {
  /** 既存のhost transaction counter。分類とは独立に全root transactionへ届ける。 */
  noteTransaction: (transaction: T) => void
  /** HISTORY-HANDOFF1: rootとappendedを同一dispatch batchとして記録する。 */
  noteTransactionBatch?: (notice: LocalImeHostTransactionBatchNotice<T>) => void
  /** host content changeでpending armを失効させ、host ownershipを保持する。 */
  notifyHostContentChange: (
    fromHistory?: boolean,
    notice?: LocalImeHostContentChangeNotice<T>,
  ) => void
  /** trusted DOM input cycle開始。transaction適用や完了のauthorityではない。 */
  notifyHostInputCycleStart?: (cycle: LocalImeHostInputCycleToken) => void
  /** direct inputのtrusted `input`到達。実PM batch proofが別途必要。 */
  notifyHostDirectInputConfirmed?: (cycle: LocalImeHostInputCycleToken) => void
  /** content-changing rootに付随したselection updateだけをtypedに渡す。 */
  notifyHostInputSelectionStablePoint?: (
    notice: LocalImeHostInputSelectionStableNotice<T>,
  ) => void
  /** hintだけで終わったcycleを通常selection stable pointへ昇格させない。 */
  cancelHostInputCycle?: (cycle: LocalImeHostInputCycleToken) => void
  /** committed host selectionのstable point。auto-arm候補の再評価に使う。 */
  notifyHostSelectionStablePoint: (fromHistory?: boolean) => void
  notifyHostCompositionStart: (cycle?: LocalImeHostInputCycleToken) => void
  notifyHostCompositionEnd: (cycle?: LocalImeHostInputCycleToken) => void
}

export type LocalImeHostTransactionNotifier<T extends LocalImeHostTransactionLike> = {
  /** trusted `beforeinput`はdirect cycleのassociation hintにだけ使う。 */
  noteBeforeInput: (input: { readonly isTrusted: boolean; readonly isComposing: boolean }) => void
  /** trusted `input`はDOM mutationが実際に起きた確認にだけ使う。 */
  noteInput: (input: { readonly isTrusted: boolean; readonly isComposing: boolean }) => void
  /** `onTransaction` payload。root と appended の両方を見る唯一の失効入口。 */
  noteTransaction: (payload: { transaction: T; appendedTransactions?: readonly T[] }) => void
  /** `onSelectionUpdate` payload の root transaction。 */
  noteSelectionUpdate: (transaction: T | undefined) => void
  /** host DOM composition cycleの既存listenerから渡す。 */
  noteCompositionStart: () => void
  /** compositionend DOM event到達。final PM flushやacquisitionのauthorityではない。 */
  noteCompositionEndEvent: () => void
  /** app/view composition predicateがclearされた後に渡す。 */
  noteCompositionEnd: () => void
}

export function createLocalImeHostTransactionNotifier<T extends LocalImeHostTransactionLike>(
  sink: LocalImeHostTransactionSink<T>,
): LocalImeHostTransactionNotifier<T> {
  /**
   * 直近で host content change と分類した root transaction。
   *
   * 同じ dispatch の `selectionUpdate` を明示 stable point として扱わないための
   * identity 記録であり、入力 intent 分類でも state machine でもない。`onTransaction`
   * は毎 dispatch で必ず先に走って上書き / クリアするので、保持は常に高々 1 件である。
   */
  let contentChangeRootTransaction: {
    readonly transaction: T
    readonly cycle: LocalImeHostInputCycleToken | null
    readonly docChanged: boolean
    readonly retainCycleOnSelection: boolean
  } | null = null
  let nextInputCycleId = 1
  let directCycle: {
    readonly token: LocalImeHostInputCycleToken
    transactionConsumed: boolean
    inputConfirmed: boolean
  } | null = null
  let compositionCycle: {
    readonly token: LocalImeHostInputCycleToken
    endEventSeen: boolean
  } | null = null
  let recentlyFinalizedComposition: LocalImeHostInputCycleToken | null = null

  const beginDirectCycle = (): LocalImeHostInputCycleToken => {
    const token: LocalImeHostInputCycleToken = {
      source: 'host-direct-input',
      cycleId: nextInputCycleId++,
    }
    if (directCycle) sink.cancelHostInputCycle?.(directCycle.token)
    recentlyFinalizedComposition = null
    directCycle = { token, transactionConsumed: false, inputConfirmed: false }
    sink.notifyHostInputCycleStart?.(token)
    return token
  }

  const transactionHasCompositionMeta = (
    transaction: T,
    appendedTransactions: readonly T[],
  ): boolean =>
    transaction.getMeta('composition') !== undefined ||
    appendedTransactions.some((appended) => appended.getMeta('composition') !== undefined)

  const resolveInputAssociation = (
    transaction: T,
    appendedTransactions: readonly T[],
    classification: {
      readonly docChanged: boolean
      readonly documentLoad: boolean
      readonly fromHistory: boolean
      readonly selectionChanged: boolean
    },
  ): LocalImeHostInputCycleToken | null => {
    if (compositionCycle) return compositionCycle.token
    if (
      recentlyFinalizedComposition &&
      transactionHasCompositionMeta(transaction, appendedTransactions)
    ) return recentlyFinalizedComposition
    if (directCycle && !directCycle.transactionConsumed) {
      const token = directCycle.token
      if (classification.documentLoad || classification.fromHistory) {
        sink.cancelHostInputCycle?.(token)
        directCycle = null
        return null
      }
      if (classification.docChanged) directCycle.transactionConsumed = true
      else if (classification.selectionChanged) {
        sink.cancelHostInputCycle?.(token)
        directCycle = null
      }
      return token
    }
    if (recentlyFinalizedComposition) recentlyFinalizedComposition = null
    return null
  }

  return {
    noteBeforeInput: ({ isTrusted, isComposing }) => {
      if (!isTrusted || isComposing || compositionCycle) return
      beginDirectCycle()
    },
    noteInput: ({ isTrusted, isComposing }) => {
      if (!isTrusted || isComposing || compositionCycle) return
      const token = directCycle?.token ?? beginDirectCycle()
      if (!directCycle || directCycle.token.cycleId !== token.cycleId) return
      directCycle.inputConfirmed = true
      sink.notifyHostDirectInputConfirmed?.(token)
      if (directCycle.transactionConsumed) directCycle = null
    },
    noteTransaction: ({ transaction, appendedTransactions }) => {
      const appended = appendedTransactions ?? []
      sink.noteTransaction(transaction)
      sink.noteTransactionBatch?.({
        rootTransaction: transaction,
        appendedTransactions: appended,
      })
      // document load batch は epoch 境界であり、`notifyDocumentChange()` 側が epoch
      // reset と初回候補の通知を持つ。ここで host ownership を保持すると初回 auto-arm を
      // 殺すため、root が load meta を持つ batch ごと除外する。
      const documentLoad = Boolean(transaction.getMeta(NOTE_ANCHOR_DOCUMENT_LOAD_META_KEY))
      const docChanged =
        transaction.docChanged ||
        (appendedTransactions?.some((appended) => appended.docChanged) ?? false)
      const fromHistory = isProseMirrorHistoryTransaction(transaction)
      const selectionChanged =
        transaction.selectionSet === true ||
        appended.some((item) => item.selectionSet === true)
      const inputCycle = resolveInputAssociation(transaction, appended, {
        docChanged,
        documentLoad,
        fromHistory,
        selectionChanged,
      })
      if (!isLocalImeHostContentChange({ docChanged, documentLoad })) {
        contentChangeRootTransaction = inputCycle
          ? {
              transaction,
              cycle: inputCycle,
              docChanged: false,
              retainCycleOnSelection:
                !selectionChanged ||
                (inputCycle.source === 'host-direct-input' && directCycle === null),
            }
          : null
        return
      }
      const associatedInputCycle = fromHistory ? null : inputCycle
      contentChangeRootTransaction = {
        transaction,
        cycle: associatedInputCycle,
        docChanged: true,
        retainCycleOnSelection: false,
      }
      sink.notifyHostContentChange(fromHistory, {
        rootTransaction: transaction,
        appendedTransactions: appended,
        fromHistory,
        rootDocChanged: transaction.docChanged,
        appendedDocChangedCount: appended.filter((item) => item.docChanged).length,
        hostInputCycle: associatedInputCycle,
      })
    },

    // host content change に付随する selection update は明示 stable point ではない。
    noteSelectionUpdate: (transaction) => {
      if (transaction && transaction === contentChangeRootTransaction?.transaction) {
        const matched = contentChangeRootTransaction
        contentChangeRootTransaction = null
        if (matched.cycle) {
          if (matched.docChanged) {
            sink.notifyHostInputSelectionStablePoint?.({
              cycle: matched.cycle,
              rootTransaction: matched.transaction,
            })
          } else if (!matched.retainCycleOnSelection) {
            sink.cancelHostInputCycle?.(matched.cycle)
            if (
              matched.cycle.source === 'host-direct-input' &&
              directCycle?.token.cycleId === matched.cycle.cycleId
            ) directCycle = null
          }
          if (
            matched.cycle.source === 'host-direct-input' &&
            directCycle?.token.cycleId === matched.cycle.cycleId &&
            directCycle.inputConfirmed &&
            directCycle.transactionConsumed
          ) directCycle = null
        }
        return
      }
      sink.notifyHostSelectionStablePoint(isProseMirrorHistoryTransaction(transaction))
    },
    noteCompositionStart: () => {
      if (directCycle) sink.cancelHostInputCycle?.(directCycle.token)
      directCycle = null
      recentlyFinalizedComposition = null
      const token: LocalImeHostInputCycleToken = {
        source: 'host-ime-input',
        cycleId: nextInputCycleId++,
      }
      compositionCycle = { token, endEventSeen: false }
      sink.notifyHostInputCycleStart?.(token)
      sink.notifyHostCompositionStart(token)
    },
    noteCompositionEndEvent: () => {
      if (compositionCycle) compositionCycle.endEventSeen = true
    },
    noteCompositionEnd: () => {
      const cycle = compositionCycle
      if (!cycle || !cycle.endEventSeen) return
      recentlyFinalizedComposition = cycle.token
      compositionCycle = null
      sink.notifyHostCompositionEnd(cycle.token)
    },
  }
}
