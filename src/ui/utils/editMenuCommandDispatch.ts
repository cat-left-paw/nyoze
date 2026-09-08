/**
 * P2-G1b — Edit menu Undo / Redo / Select All の dispatch 契約（pure + 薄い実行）。
 *
 * core port を先に呼び、`not-active` のときだけ classifier へ進む。
 * target 抽出・DOM・React は呼び出し側（hook）の責務。
 *
 * dedupe: 期限付き queue。consumeOpposite と record を分離し、
 * menu は dispatch outcome 確認後にだけ pair 登録する。
 */

import { classifyLocalImeHistoryChord } from '../../editor-core/features/localImeHistoryHandoffState'
import type { LocalImeEditMenuCommandResult } from '../../editor-core/features/localImeEditMenuCommandState'
import {
  shouldFallBackToNormalEditingForEditMenuCommand,
  type LocalImeEditMenuOperation,
} from '../../editor-core/features/localImeEditMenuCommandState'
import type { PlainModeKind } from './plainModeCommandGate'
import {
  resolveEditMenuCommandRoute,
  type EditMenuCommandRoute,
  type EditMenuCommandTargetInfo,
} from './editMenuCommandRouting'

export const EDIT_MENU_CHANNEL_UNDO = 'menu:edit-undo' as const
export const EDIT_MENU_CHANNEL_REDO = 'menu:edit-redo' as const
export const EDIT_MENU_CHANNEL_SELECT_ALL = 'menu:edit-select-all' as const

export type EditMenuChannel =
  | typeof EDIT_MENU_CHANNEL_UNDO
  | typeof EDIT_MENU_CHANNEL_REDO
  | typeof EDIT_MENU_CHANNEL_SELECT_ALL

export function editMenuChannelToOperation(
  channel: string,
): LocalImeEditMenuOperation | null {
  if (channel === EDIT_MENU_CHANNEL_UNDO) return 'undo'
  if (channel === EDIT_MENU_CHANNEL_REDO) return 'redo'
  if (channel === EDIT_MENU_CHANNEL_SELECT_ALL) return 'select-all'
  return null
}

export function isEditMenuChannel(channel: string): channel is EditMenuChannel {
  return editMenuChannelToOperation(channel) !== null
}

/** keyboard と menu accelerator IPC の反対 source ペアを抑止する短い窓（ms）。 */
export const EDIT_MENU_COMMAND_DEDUPE_MS = 100

export type EditMenuCommandSource = 'keyboard' | 'menu'

export type EditMenuCommandDedupeEntry = {
  operation: LocalImeEditMenuOperation
  source: EditMenuCommandSource
  atMs: number
}

export type EditMenuCommandDedupeState = {
  pending: EditMenuCommandDedupeEntry[]
}

export function createEditMenuCommandDedupeState(): EditMenuCommandDedupeState {
  return { pending: [] }
}

function pruneExpiredEditMenuCommandPairs(
  state: EditMenuCommandDedupeState,
  nowMs: number,
  windowMs: number,
): void {
  state.pending = state.pending.filter(
    (entry) => nowMs - entry.atMs >= 0 && nowMs - entry.atMs < windowMs,
  )
}

/**
 * 反対 source・同 operation・窓内の最古 entry を1件消費する。
 * @returns true = 自分は抑止すべき（相手が既に実行済み）
 */
export function consumeOppositeEditMenuCommandPair(
  state: EditMenuCommandDedupeState,
  operation: LocalImeEditMenuOperation,
  source: EditMenuCommandSource,
  nowMs: number,
  windowMs: number = EDIT_MENU_COMMAND_DEDUPE_MS,
): boolean {
  pruneExpiredEditMenuCommandPairs(state, nowMs, windowMs)
  const index = state.pending.findIndex(
    (entry) => entry.operation === operation && entry.source !== source,
  )
  if (index < 0) return false
  state.pending.splice(index, 1)
  return true
}

/** dispatch / browser default が実際に走った後に pair 候補を積む。 */
export function recordEditMenuCommandPending(
  state: EditMenuCommandDedupeState,
  operation: LocalImeEditMenuOperation,
  source: EditMenuCommandSource,
  nowMs: number,
  windowMs: number = EDIT_MENU_COMMAND_DEDUPE_MS,
): void {
  pruneExpiredEditMenuCommandPairs(state, nowMs, windowMs)
  state.pending.push({ operation, source, atMs: nowMs })
}

/**
 * menu / keydown の outcome が「対応する反対 source を抑止すべき terminal」か。
 * direct-arm の state-mismatch と未実行 fallback は記録しない。
 */
export function shouldRecordEditMenuDedupePair(
  outcome: EditMenuCommandDispatchOutcome,
): boolean {
  if (outcome.kind === 'core') {
    return !(
      outcome.result.status === 'blocked' &&
      outcome.result.reason === 'state-mismatch'
    )
  }
  if (outcome.kind === 'fallback') {
    return outcome.executed
  }
  return true
}

export type EditMenuCommandDispatchDeps = {
  routeLocalImeEditMenuCommand: (
    operation: LocalImeEditMenuOperation,
  ) => LocalImeEditMenuCommandResult | null | undefined
  extractTarget: () => EditMenuCommandTargetInfo
  plainModeKind: PlainModeKind | null
  internalDocActive: boolean
  hasEditorCore: boolean
  hasFullPlainEditor: boolean
  runSourceMode: (operation: LocalImeEditMenuOperation) => void
  runParagraphPlain: (operation: LocalImeEditMenuOperation) => void
  runEditorUndoRedo: (operation: 'undo' | 'redo') => void
  runEditorSelectAll: () => void
  runNative: (operation: LocalImeEditMenuOperation) => void
  runReadOnlySelectAll: () => void
}

export type EditMenuCommandDispatchOutcome =
  | { kind: 'core'; result: LocalImeEditMenuCommandResult }
  | { kind: 'fallback'; route: EditMenuCommandRoute; executed: boolean }
  | {
      kind: 'fail-closed'
      reason: 'missing-core-result'
    }

/**
 * 1. core port を先に呼ぶ
 * 2. handled / blocked / failed ならそこで終了
 * 3. not-active のときだけ classifier へ進む
 * 4. route別実行は最大1回。失敗しても別routeへfallbackしない
 */
export function dispatchEditMenuCommand(
  operation: LocalImeEditMenuOperation,
  deps: EditMenuCommandDispatchDeps,
): EditMenuCommandDispatchOutcome {
  const coreResult = deps.routeLocalImeEditMenuCommand(operation)
  if (!coreResult) {
    return { kind: 'fail-closed', reason: 'missing-core-result' }
  }
  if (!shouldFallBackToNormalEditingForEditMenuCommand(coreResult)) {
    return { kind: 'core', result: coreResult }
  }

  const target = deps.extractTarget()

  const route = resolveEditMenuCommandRoute({
    target,
    plainModeKind: deps.plainModeKind,
    internalDocActive: deps.internalDocActive,
    hasEditorCore: deps.hasEditorCore,
    hasFullPlainEditor: deps.hasFullPlainEditor,
  })

  try {
    switch (route) {
      case 'source-mode':
        deps.runSourceMode(operation)
        return { kind: 'fallback', route, executed: true }
      case 'paragraph-plain':
        deps.runParagraphPlain(operation)
        return { kind: 'fallback', route, executed: true }
      case 'editor':
        if (operation === 'select-all') deps.runEditorSelectAll()
        else deps.runEditorUndoRedo(operation)
        return { kind: 'fallback', route, executed: true }
      case 'native':
        deps.runNative(operation)
        return { kind: 'fallback', route, executed: true }
      case 'read-only-editor':
        if (operation === 'select-all') {
          deps.runReadOnlySelectAll()
          return { kind: 'fallback', route, executed: true }
        }
        return { kind: 'fallback', route, executed: false }
      case 'blocked-dialog':
      case 'none':
        return { kind: 'fallback', route, executed: false }
      default: {
        const _exhaustive: never = route
        void _exhaustive
        return { kind: 'fallback', route: 'none', executed: false }
      }
    }
  } catch {
    return { kind: 'fallback', route, executed: false }
  }
}

/**
 * capture keydown から operation を分類する。
 *
 * useGlobalShortcuts / P2-D1 と同型の IME 安全条件:
 * isComposing / keyCode 229 / Process / Unidentified / non-cancelable は null。
 * 分類は key のみ（code fallback なし。Process+KeyZ で Undo に落ちない）。
 */
/**
 * window capture keydown を Edit menu の typed operation へ分類する。
 *
 * **この listener は capture 段階で target 側 keydown より先に走る**ため、
 * host PM / Local Window / native input のいずれが owner でも最初にここを通る。
 * したがって Undo / Redo の割り当てと AltGr 拒否は、Local Window 専用ではなく
 * 共有 classifier `classifyLocalImeHistoryChord()` を正本にする
 * （`Ctrl+Y` を片方だけが知っている、AltGr を片方だけが拒否する状態を作らない）。
 *
 * `altGraphKey` は `readLocalImeAltGraphState()` の結果で、識別不能なら true。
 * true のときは Undo / Redo だけでなく Select All も返さない。
 *
 * **`isTrusted` は fail-closed で必須**（`undefined` も拒否）。この listener は
 * host PM の Undo / Redo / Select All を実行する経路なので、script 生成 event が
 * 本文 history を動かせてはならない。`classifyLocalImeHistoryShortcut()`（Local Window
 * 側の入口）と同じ姿勢に揃える。
 */
export function classifyEditMenuKeyboardOperation(event: {
  key: string
  code?: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  altGraphKey?: boolean
  /** `KeyboardEvent.isTrusted`。true 以外（未指定を含む）は分類しない。 */
  isTrusted?: boolean
  isComposing?: boolean
  keyCode?: number
  cancelable?: boolean
}): LocalImeEditMenuOperation | null {
  // untrusted / 不明は最初に拒否する（synthetic event で本文 history を動かさない）。
  if (event.isTrusted !== true) return null
  if (event.isComposing) return null
  if (event.keyCode === 229) return null
  if (event.key === 'Process' || event.key === 'Unidentified') return null
  if (event.cancelable === false) return null
  // AltGr はすべての Edit menu shortcut より先に拒否する。
  if (event.altGraphKey === true) return null
  // Undo / Redo（`Ctrl+Z` / `Cmd+Z` / `Mod+Shift+Z` / Windows の `Ctrl+Y`）は共有正本。
  const history = classifyLocalImeHistoryChord(event)
  if (history) return history
  const mod = event.metaKey || event.ctrlKey
  if (!mod || event.altKey) return null
  const key = event.key.toLowerCase()
  if (key === 'a' && !event.shiftKey) {
    return 'select-all'
  }
  return null
}
