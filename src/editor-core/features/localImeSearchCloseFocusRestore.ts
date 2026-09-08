/**
 * 検索barを閉じたあとの focus 復帰。既存 BETA-A11Y1 の host editor 復帰を、
 * 同一 identity / generation の active Local Window があるときは local root へ
 * 限定的に向ける。timer / polling / rAF は持たない。
 * captured proof がある request は core / epoch / identity / generation を
 * mode fallback より先に判定し、不一致や live 不明は skip する。
 */

export type SearchCloseFocusRestoreMode =
  | 'off'
  | 'active-clean'
  | 'active-dirty'
  | 'composing'
  | 'closing'
  | 'recovery-required'

export type SearchCloseFocusOwner =
  | 'vacant'
  | 'local-window'
  | 'host-editor'
  | 'search'
  | 'other'

export type SearchCloseFocusRestoreToken = {
  readonly epoch: number
  readonly coreInstanceId: number
  readonly documentIdentity: string | null
  readonly controllerGeneration: number | null
}

export type SearchCloseFocusRestoreLive = {
  readonly mode: SearchCloseFocusRestoreMode
  readonly documentIdentity: string | null
  readonly controllerGeneration: number | null
  readonly localRootConnected: boolean
  readonly compositionActive: boolean
}

export type SearchCloseFocusRestoreDecision =
  | {
      readonly action: 'skip'
      readonly reason:
        | 'stale-core'
        | 'stale-epoch'
        | 'live-unavailable'
        | 'stale-identity'
        | 'stale-generation'
        | 'composing'
        | 'foreign-focus-owner'
    }
  | { readonly action: 'focus-local-window' }
  | {
      readonly action: 'focus-host-editor'
      readonly reason:
        | 'local-unavailable'
        | 'local-off'
        | 'recovery-required'
        | 'closing'
        | 'local-detached'
    }

type SearchCloseFocusTraceSink = {
  records: Array<Record<string, unknown>>
}

type NodeLike = {
  readonly nodeName?: string
  readonly isConnected?: boolean
}

let nextCoreInstanceId = 0

export function allocateSearchCloseFocusRestoreCoreInstanceId(): number {
  nextCoreInstanceId += 1
  return nextCoreInstanceId
}

/** E2E が `window.__searchCloseFocusTrace` を置いたときだけ記録する。production 経路は no-op。 */
export function emitSearchCloseFocusTraceForTest(
  label: string,
  extra: Record<string, unknown> = {},
): void {
  if (typeof window === 'undefined') return
  const trace = (window as Window & {
    __searchCloseFocusTrace?: SearchCloseFocusTraceSink
  }).__searchCloseFocusTrace
  if (!trace || !Array.isArray(trace.records)) return
  trace.records.push({
    label,
    atMs: typeof performance !== 'undefined' ? performance.now() : 0,
    ...extra,
  })
}

export function nextSearchCloseFocusRestoreEpoch(current: number): number {
  if (!Number.isInteger(current) || current < 0) return 1
  return current + 1
}

export function classifySearchCloseFocusOwner(input: {
  readonly activeElement: NodeLike | null
  readonly searchContainsActive: boolean
  readonly localContainsActive: boolean
  readonly hostContainsActive: boolean
}): SearchCloseFocusOwner {
  const active = input.activeElement
  if (!active || active.isConnected === false) return 'vacant'
  const name = active.nodeName
  if (name === 'BODY' || name === 'HTML') return 'vacant'
  if (input.searchContainsActive) return 'search'
  if (input.localContainsActive) return 'local-window'
  if (input.hostContainsActive) return 'host-editor'
  return 'other'
}

export function resolveSearchCloseFocusRestore(input: {
  readonly token: SearchCloseFocusRestoreToken
  readonly currentEpoch: number
  readonly currentCoreInstanceId: number
  readonly live: SearchCloseFocusRestoreLive | null
  readonly focusOwner: SearchCloseFocusOwner
}): SearchCloseFocusRestoreDecision {
  if (input.token.coreInstanceId !== input.currentCoreInstanceId) {
    return { action: 'skip', reason: 'stale-core' }
  }
  if (input.token.epoch !== input.currentEpoch) {
    return { action: 'skip', reason: 'stale-epoch' }
  }

  const live = input.live
  const capturedIdentity = input.token.documentIdentity
  if (capturedIdentity) {
    if (!live) return { action: 'skip', reason: 'live-unavailable' }
    if (live.documentIdentity !== capturedIdentity) {
      return { action: 'skip', reason: 'stale-identity' }
    }
    if (
      input.token.controllerGeneration == null ||
      live.controllerGeneration !== input.token.controllerGeneration
    ) {
      return { action: 'skip', reason: 'stale-generation' }
    }
  } else {
    if (input.focusOwner === 'search' || input.focusOwner === 'other') {
      return { action: 'skip', reason: 'foreign-focus-owner' }
    }
    return { action: 'focus-host-editor', reason: 'local-unavailable' }
  }
  if (!live) return { action: 'skip', reason: 'live-unavailable' }

  if (live.mode === 'composing' || live.compositionActive) {
    return { action: 'skip', reason: 'composing' }
  }
  if (input.focusOwner === 'search' || input.focusOwner === 'other') {
    return { action: 'skip', reason: 'foreign-focus-owner' }
  }
  if (live.mode === 'recovery-required') {
    return { action: 'focus-host-editor', reason: 'recovery-required' }
  }
  if (live.mode === 'closing') {
    return { action: 'focus-host-editor', reason: 'closing' }
  }
  if (live.mode !== 'active-clean' && live.mode !== 'active-dirty') {
    return { action: 'focus-host-editor', reason: 'local-off' }
  }
  if (!live.localRootConnected) {
    return { action: 'focus-host-editor', reason: 'local-detached' }
  }
  return { action: 'focus-local-window' }
}
