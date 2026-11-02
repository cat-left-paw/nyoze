import type { OwnerInsertionSnapshot } from './editOwner'
import { sameMirrorRange, type SelectionMirror } from './selectionMirror'
import { resolveReconversionReplacement } from './reconversionReplacement'

export type SurfaceContent =
  | { kind: 'empty' }
  | { kind: 'mirror'; copy: SelectionMirror }
  | { kind: 'composition'; origin: 'normal' | 'mirror' | 'rejected'; copy: SelectionMirror | null; keyed?: boolean; continuation?: boolean; retained?: boolean; mirrored?: boolean }
  | { kind: 'retained' }
export type ReconversionRejection =
  | { kind: 'snapshot'; snapshot: OwnerInsertionSnapshot }
  | { kind: 'unkeyed' }
/**
 * 確定の直後の印。`armed`はKEYLESS-CONTINUATION1の有効化（確定の後に、変換の外でキーを押し、修飾キーをまだ押している）。
 * 有効化された印だけが、keyなしのcollapsedの開始を拒否する（部分確定・音声入力の続きは、確定から開始までkeydownがない。
 * 音声入力・絵文字パネルを修飾キーで開く場合は、修飾キーをすべて離してから始まる。確定の直後の再変換は、押したまま始まる）。
 */
export type RecentInput = OwnerInsertionSnapshot & { readonly armed: boolean }
export type ReconversionState = {
  content: SurfaceContent
  mark: SelectionMirror | null
  consumed: SelectionMirror | null
  rejected: ReconversionRejection | null
  recent: RecentInput | null
}
export const emptyReconversionState = (): ReconversionState => ({ content: { kind: 'empty' }, mark: null, consumed: null, rejected: null, recent: null })
export type ReconversionReason = 'stale-mirror' | 'partial-selection' | 'start-data-mismatch' | 'rejected-identity' | 'end-text-mismatch' | 'direct-text-mismatch' | 'unmirrored-range' | 'keyless-empty-end' | 'mirror-delete' | 'keyless-after-input'

/** 取得不能の拒否は、後からsnapshotが読めても明示の解除境界まで狭めない。 */
function rejectionAt(state: ReconversionState, snapshot: OwnerInsertionSnapshot | null): ReconversionRejection {
  if (state.rejected?.kind === 'unkeyed' || !snapshot) return { kind: 'unkeyed' }
  const { identity, docRef, from, to } = snapshot
  return { kind: 'snapshot', snapshot: { identity, docRef, from, to } }
}
function rejectionMatches(rejected: ReconversionRejection | null, snapshot: OwnerInsertionSnapshot | null): boolean {
  return rejected?.kind === 'unkeyed' || (rejected?.kind === 'snapshot' && sameMirrorRange(rejected.snapshot, snapshot))
}
export function rejectReconversion(state: ReconversionState, snapshot: OwnerInsertionSnapshot | null): ReconversionState {
  return { ...state, mark: null, rejected: rejectionAt(state, snapshot) }
}

/**
 * 確定後のsnapshotを記録する。開始snapshotや時間を使わない。
 * 確定の成功（ownerの`'committed'`）の後は有効化されていない印で始め、成功しなかった入力の終わりは前の印の有効化を引き継ぐ。
 */
export function noteInputFinished(state: ReconversionState, current: OwnerInsertionSnapshot | null, outcome: { committed: boolean }): ReconversionState {
  const armed = !outcome.committed && !!state.recent?.armed
  return { ...state, recent: current ? { identity: current.identity, docRef: current.docRef, from: current.from, to: current.to, armed } : null }
}

/** 変換の外のkeydown（`isComposing: false`）で、印を外さなかったときだけ呼ぶ。印がなければ何もしない。 */
export function armRecentInput(state: ReconversionState): ReconversionState {
  return state.recent && !state.recent.armed ? { ...state, recent: { ...state.recent, armed: true } } : state
}

/** 変換の外のkeyupで、修飾キーがどれも押されていないときだけ呼ぶ。有効化されていなければ何もしない。 */
export function disarmRecentInput(state: ReconversionState): ReconversionState {
  return state.recent?.armed ? { ...state, recent: { ...state.recent, armed: false } } : state
}

/** KEYLESS-CONTINUATION1: 有効化されていない印のある、keyなしのcollapsedの開始（診断の記録だけに使う。判定は`beginReconversion()`）。 */
export function allowsKeylessAfterInput(state: ReconversionState, snapshot: OwnerInsertionSnapshot | null, keyed: boolean): boolean {
  return !keyed && !!state.recent && !state.recent.armed && sameMirrorRange(state.recent, snapshot) && snapshot!.from === snapshot!.to
}

/** D10: identityの失効は同期の事実で判断。変換中のDOMを書き換える指示は出さない。 */
export function syncReconversion(state: ReconversionState, current: OwnerInsertionSnapshot | null, candidate: SelectionMirror | null): ReconversionState {
  const recent = sameMirrorRange(state.recent, current) ? state.recent : null
  const mark = sameMirrorRange(state.mark, current) ? state.mark : null
  const consumed = sameMirrorRange(state.consumed, current) ? state.consumed : null
  const rejected = rejectionMatches(state.rejected, current) ? state.rejected : null
  if (state.content.kind === 'composition' || state.content.kind === 'retained') return { ...state, mark, consumed, rejected, recent }
  return { content: candidate && !consumed && !rejected ? { kind: 'mirror', copy: candidate } : { kind: 'empty' }, mark, consumed, rejected, recent }
}

/** D6: DOM全選択が正本。空のstart.data（ATOK）は照合を要求しない。 */
export function beginReconversion(state: ReconversionState, snapshot: OwnerInsertionSnapshot | null, wholeSelection: boolean, data: string, keyed = false): { state: ReconversionState; reason: ReconversionReason | null } {
  const copy = state.content.kind === 'mirror' ? state.content.copy : null
  state = { ...state, recent: sameMirrorRange(state.recent, snapshot) ? state.recent : null }
  const retained = state.content.kind === 'retained'
  if (keyed) return { state: { ...state, content: { kind: 'composition', origin: 'normal', copy: null, keyed: true, retained, mirrored: !!copy }, mark: null, consumed: copy, rejected: null, recent: null }, reason: null }
  if (state.recent?.armed && snapshot?.from === snapshot?.to) {
    return { state: { ...rejectReconversion(state, snapshot), content: { kind: 'composition', origin: 'rejected', copy } }, reason: 'keyless-after-input' }
  }
  if (!copy && snapshot && snapshot.from === snapshot.to && !rejectionMatches(state.rejected, snapshot)) {
    return { state: { ...state, mark: null, content: { kind: 'composition', origin: 'normal', copy: null, retained, mirrored: !!copy } }, reason: null }
  }
  const continuation = !copy && sameMirrorRange(state.mark, snapshot)
  const reason = rejectionMatches(state.rejected, snapshot) ? 'rejected-identity'
    : copy && !sameMirrorRange(copy, snapshot) ? 'stale-mirror'
    : copy && !wholeSelection ? 'partial-selection'
    : copy && data && data !== copy.text ? 'start-data-mismatch'
    : !copy && !continuation && snapshot && snapshot.from !== snapshot.to && state.content.kind !== 'retained' ? 'unmirrored-range' : null
  if (reason) return { state: { ...rejectReconversion(state, snapshot), content: { kind: 'composition', origin: 'rejected', copy } }, reason }
  const original = copy ?? (continuation ? state.mark : null)
  return { state: { ...state, content: { kind: 'composition', origin: original ? 'mirror' : 'normal', copy: original, continuation, retained },
    mark: null, consumed: original ?? state.consumed }, reason: null }
}

/** D7/D8: 写しのDOMをpayloadへ昇格しない。空endでも消費済みと元の範囲の印を残す。 */
export function finishReconversion(state: ReconversionState, snapshot: OwnerInsertionSnapshot | null, data: string, raw: string, current: OwnerInsertionSnapshot | null = snapshot) {
  const content = state.content
  if (content.kind !== 'composition') return null
  if (content.origin === 'normal') {
    if (content.retained) return null
    if (!content.keyed && !data && snapshot?.from === snapshot?.to) {
      return { state: { ...rejectReconversion(state, current), content: { kind: 'empty' } as SurfaceContent }, reason: 'keyless-empty-end' as ReconversionReason, payload: '', original: null, snapshot, retain: false }
    }
    if (content.keyed && snapshot && (snapshot.from !== snapshot.to || content.mirrored)) {
      const mismatch = raw !== data
      return { state: { ...state, mark: null, content: { kind: mismatch && data ? 'retained' : 'empty' } as SurfaceContent }, reason: mismatch ? 'end-text-mismatch' as ReconversionReason : null, payload: data, original: null, snapshot, retain: mismatch && !!data }
    }
    if (content.mirrored) return { state: { ...state, content: { kind: 'empty' } as SurfaceContent }, reason: null, payload: data, original: null, snapshot, retain: false }
    return null
  }
  const replacement = data && content.copy ? resolveReconversionReplacement(content.copy, snapshot, raw, data, content.continuation) : null
  const reason: ReconversionReason | null = content.origin === 'rejected' ? 'rejected-identity'
    : data && !replacement ? 'end-text-mismatch' : null
  return { state: { ...state, content: { kind: 'empty' } as SurfaceContent,
    mark: !reason && !data && !raw && content.copy && sameMirrorRange(content.copy, snapshot) ? content.copy : null,
    rejected: reason ? rejectionAt(state, current) : state.rejected },
    reason, payload: reason ? '' : data,
    original: replacement?.original ?? null, snapshot: replacement?.snapshot ?? snapshot, retain: false }
}

export function finishMirrorInput(state: ReconversionState, snapshot: OwnerInsertionSnapshot | null, data: string | null, raw: string) {
  if (state.content.kind !== 'mirror') return null
  const copy = state.content.copy, reason: ReconversionReason | null = data === null || raw !== data ? 'direct-text-mismatch' : null
  return { state: { ...state, content: { kind: 'empty' } as SurfaceContent, consumed: copy, rejected: reason ? rejectionAt(state, snapshot) : state.rejected },
    reason, payload: reason ? '' : data!, original: copy }
}

/** keydown/pointer/blur/mode/documentの明示的な境界。現在の拒否cycle自体は確定しないまま。 */
export function releaseReconversion(state: ReconversionState): ReconversionState {
  return { ...emptyReconversionState(), content: state.content.kind === 'composition' || state.content.kind === 'retained' ? state.content : { kind: 'empty' } }
}

/** D1: 既存の読み手に渡すのはpayload/保持文字だけ。DOMの写しは0文字として扱う。 */
export function surfacePayloadText(state: ReconversionState, raw: string): string {
  return state.content.kind === 'mirror' ? '' : raw
}
