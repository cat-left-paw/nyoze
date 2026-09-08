export type LocalImeHistoryOperation = 'undo' | 'redo'

export type LocalImeHistoryHandoffMode =
  | 'off'
  | 'active-clean'
  | 'active-dirty'
  | 'composing'
  | 'closing'
  | 'recovery-required'

export type LocalImeHistoryHandoffDecision =
  | { readonly owner: 'not-active' }
  | { readonly owner: 'local'; readonly execute: boolean; readonly reason: 'requested-depth' | 'opposite-depth' }
  | { readonly owner: 'host' }
  | { readonly owner: 'noop'; readonly reason: 'host-history-empty' }
  | {
      readonly owner: 'blocked'
      readonly reason:
        | 'composing'
        | 'keycode-229'
        | 'closing-or-recovery'
        | 'pending'
        | 'local-view-detached'
        | 'local-root-not-focused'
        | 'stale-identity'
        | 'base-proof-failed'
        | 'local-selection-unsafe'
        | 'dirty-without-local-history'
        | 'history-depth-invalid'
    }

export type LocalImeHistoryHandoffProbe = {
  readonly operation: LocalImeHistoryOperation
  readonly mode: LocalImeHistoryHandoffMode
  readonly compositionActive: boolean
  readonly keyCode: number | null
  readonly pending: boolean
  readonly localViewConnected: boolean
  readonly localRootFocused: boolean
  readonly identityValid: boolean
  readonly baseProof: boolean
  readonly localSelectionSafe: boolean
  readonly draftClean: boolean
  readonly localUndoDepth: number
  readonly localRedoDepth: number
  readonly hostRequestedDepth: number
}

const validDepth = (value: number): boolean => Number.isInteger(value) && value >= 0

/**
 * HISTORY-HANDOFF1 ownership authority. DOM flushやcommand実行は行わず、flush後の
 * PM state / history depth / proofだけからownerを決める。
 */
export function resolveLocalImeHistoryHandoff(
  probe: LocalImeHistoryHandoffProbe,
): LocalImeHistoryHandoffDecision {
  if (probe.mode === 'off') return { owner: 'not-active' }
  if (probe.compositionActive || probe.mode === 'composing') {
    return { owner: 'blocked', reason: 'composing' }
  }
  if (probe.keyCode === 229) return { owner: 'blocked', reason: 'keycode-229' }
  if (probe.mode === 'closing' || probe.mode === 'recovery-required') {
    return { owner: 'blocked', reason: 'closing-or-recovery' }
  }
  if (probe.pending) return { owner: 'blocked', reason: 'pending' }
  if (!probe.localViewConnected) return { owner: 'blocked', reason: 'local-view-detached' }
  if (!probe.localRootFocused) return { owner: 'blocked', reason: 'local-root-not-focused' }
  if (!probe.identityValid) return { owner: 'blocked', reason: 'stale-identity' }
  if (!probe.baseProof) return { owner: 'blocked', reason: 'base-proof-failed' }
  if (!probe.localSelectionSafe) return { owner: 'blocked', reason: 'local-selection-unsafe' }
  if (
    !validDepth(probe.localUndoDepth) ||
    !validDepth(probe.localRedoDepth) ||
    !validDepth(probe.hostRequestedDepth)
  ) {
    return { owner: 'blocked', reason: 'history-depth-invalid' }
  }

  const requestedDepth = probe.operation === 'undo'
    ? probe.localUndoDepth
    : probe.localRedoDepth
  const oppositeDepth = probe.operation === 'undo'
    ? probe.localRedoDepth
    : probe.localUndoDepth
  if (requestedDepth > 0) {
    return { owner: 'local', execute: true, reason: 'requested-depth' }
  }
  if (oppositeDepth > 0) {
    return { owner: 'local', execute: false, reason: 'opposite-depth' }
  }
  if (!probe.draftClean) {
    return { owner: 'blocked', reason: 'dirty-without-local-history' }
  }
  if (probe.hostRequestedDepth === 0) {
    return { owner: 'noop', reason: 'host-history-empty' }
  }
  return { owner: 'host' }
}

/**
 * LOCAL-WINDOW-WINDOWS1: `getModifierState('AltGraph')`の観測結果（typed）。
 *
 * `indeterminate`は「AltGrかどうかを識別できなかった」状態で、**AltGr扱い（拒否）へ
 * 収束させる**。ここをfalse相当へ倒すとAltGr中のCtrl+Zを許してしまうため、
 * fail-openにしない。
 */
export type LocalImeAltGraphState = 'off' | 'on' | 'indeterminate'

/** `getModifierState`が無い / throwするeventは`indeterminate`（= 拒否側）。 */
export function readLocalImeAltGraphState(
  event: Pick<KeyboardEvent, 'getModifierState'>,
): LocalImeAltGraphState {
  if (typeof event.getModifierState !== 'function') return 'indeterminate'
  try {
    return event.getModifierState('AltGraph') ? 'on' : 'off'
  } catch {
    return 'indeterminate'
  }
}

/** classifierへ渡すboolean。`off`だけがfalse（＝shortcutを許可してよい）。 */
export function isLocalImeAltGraphBlocking(state: LocalImeAltGraphState): boolean {
  return state !== 'off'
}

export type LocalImeHistoryChordProbe = {
  readonly key: string
  readonly metaKey: boolean
  readonly ctrlKey: boolean
  readonly altKey: boolean
  readonly shiftKey: boolean
  /**
   * LOCAL-WINDOW-WINDOWS1: `getModifierState('AltGraph')`。
   *
   * Windows AltGrは`ctrlKey` + `altKey`として届くが、その暗黙依存を契約にしない。
   * AltGrは**すべてのhistory shortcutより先に**拒否し、通常文字入力を`beforeinput`へ委ねる。
   * 識別不能（`readLocalImeAltGraphState`が`indeterminate`）も`true`で渡すこと。
   */
  readonly altGraphKey?: boolean
}

/**
 * `Cmd/Ctrl+Z`、`Cmd/Ctrl+Shift+Z`、`Ctrl+Y`を同じtyped operationへ正規化する**唯一の正本**。
 *
 * host PM（Edit menu keyboard capture）、Local Window controller、Edit menu accelerator IPCが
 * この1つを共有する。片方だけがCtrl+Yを知っている、片方だけがAltGrを拒否する、という
 * ownership差を作らないための共有classifierである。
 *
 * `Ctrl+Y`はWindows標準のRedoなので`ctrlKey`限定にし、`Cmd+Y` / `Ctrl+Shift+Y`は対象外。
 */
export function classifyLocalImeHistoryChord(
  probe: LocalImeHistoryChordProbe,
): LocalImeHistoryOperation | null {
  // AltGrは全history shortcutより先に拒否する（printableはbeforeinputが正本）。
  if (probe.altGraphKey === true) return null
  if (probe.key === 'Process' || probe.key === 'Unidentified') return null
  if ((!probe.metaKey && !probe.ctrlKey) || probe.altKey) return null
  const key = probe.key.toLowerCase()
  if (key === 'z') return probe.shiftKey ? 'redo' : 'undo'
  if (key === 'y' && probe.ctrlKey && !probe.metaKey && !probe.shiftKey) return 'redo'
  return null
}

export type LocalImeHistoryShortcutProbe = Pick<
  KeyboardEvent,
  | 'key'
  | 'metaKey'
  | 'ctrlKey'
  | 'altKey'
  | 'shiftKey'
  | 'isTrusted'
  | 'cancelable'
  | 'isComposing'
  | 'keyCode'
> & {
  /** `classifyLocalImeHistoryChord`と同じ契約。識別不能は`true`。 */
  readonly altGraphKey?: boolean
}

/** Local Window local keydown用。trusted / cancelable / IME特殊eventを先に落とす。 */
export function classifyLocalImeHistoryShortcut(
  event: LocalImeHistoryShortcutProbe,
): LocalImeHistoryOperation | null {
  if (!event.isTrusted || !event.cancelable || event.isComposing || event.keyCode === 229) return null
  return classifyLocalImeHistoryChord(event)
}

/**
 * DOM `KeyboardEvent`からAltGraph込みのprobeを作る。
 *
 * `getModifierState`が無い / throwする場合は`altGraphKey: true`（拒否側）へ収束させる。
 * 識別できないままCtrl+ZをUndoとして許可しない。
 */
export function toLocalImeHistoryShortcutProbe(
  event: KeyboardEvent,
): LocalImeHistoryShortcutProbe {
  return {
    key: event.key,
    metaKey: event.metaKey,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    isTrusted: event.isTrusted,
    cancelable: event.cancelable,
    isComposing: event.isComposing,
    keyCode: event.keyCode,
    altGraphKey: isLocalImeAltGraphBlocking(readLocalImeAltGraphState(event)),
  }
}
