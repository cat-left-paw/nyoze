import type { OwnerInsertionSnapshot } from './editOwner'
import { sameMirrorRange } from './selectionMirror'

export type CompositionKey = Pick<KeyboardEvent, 'isComposing' | 'keyCode' | 'ctrlKey' | 'metaKey' | 'code'> & { snapshot: OwnerInsertionSnapshot | null }
const IME_FUNCTION_CODES = new Set(['Convert', 'NonConvert', 'KanaMode', 'Lang1', 'Lang2', 'Lang3', 'Lang4', 'Lang5'])
/** 直前のkeydownとsnapshotだけを使う。時間・文字・DOMの見え方から推測しない。 */
export function isKeyStartedComposition(last: CompositionKey | null, current: OwnerInsertionSnapshot | null): boolean {
  return !!last && !last.isComposing && last.keyCode === 229 && !last.ctrlKey && !last.metaKey
    && !IME_FUNCTION_CODES.has(last.code) && sameMirrorRange(last.snapshot, current)
}
/**
 * IMPLICIT-COMMIT1: 変換中の文字のキー（K）。IMEはこのキーの中で前の変換を確定し、次の変換を始めることがある。
 * `altKey`・`shiftKey`は`isKeyStartedComposition()`と同じく見ない。
 */
export function isComposingTypingKey(event: Omit<CompositionKey, 'snapshot'>): boolean {
  return event.isComposing && event.keyCode === 229 && !event.ctrlKey && !event.metaKey && !IME_FUNCTION_CODES.has(event.code)
}
/**
 * Kの後の経過。`ending`は前の変換の終了の処理中、`ended`はその処理の後に記録したsnapshot（`recent`と同じ値）を持つ。
 * Kと同じcodeのkeyup・別のkeydown・次の開始・明示の境界（pointer・blur・mode・document）で外す。
 */
export type ContinuedCompositionKey =
  | { phase: 'composing' | 'ending'; code: string }
  | { phase: 'ended'; code: string; snapshot: OwnerInsertionSnapshot | null }
/** Kの後、前の変換の終了を1回だけ挟んで、同じsnapshotで始まった変換。打鍵で始まった変換として扱う。 */
export function isContinuedKeyComposition(key: ContinuedCompositionKey | null, current: OwnerInsertionSnapshot | null): boolean {
  return key?.phase === 'ended' && sameMirrorRange(key.snapshot, current)
}
export const isMirrorNavigationKey = (key: string) => /^(Arrow(?:Up|Down|Left|Right)|Home|End|PageUp|PageDown)$/.test(key)
/** WindowsのIMEが引き受けなかったWin+文字だけ。Hostの経路には適用しない。 */
export function blocksUnclaimedWindowsCharacter(event: Pick<KeyboardEvent, 'metaKey' | 'key' | 'keyCode' | 'isComposing'>, mac: boolean, composing: boolean): boolean {
  return !mac && event.metaKey && event.key.length === 1 && !event.isComposing && !composing && event.keyCode !== 229
}

/**
 * KEYLESS-CONTINUATION1: 変換の外のkeyupで、修飾キー（Control・Meta・Alt・Shift）がどれも押されていない。
 * 確定の直後の再変換は修飾キーを押したまま始まり、音声入力（Control 2回・Win+H）は離してから始まる（作者の記録）。
 * keyupを取りこぼした場合は有効化が残る（拒否の側）。
 */
export function releasesAllModifiers(event: Pick<KeyboardEvent, 'isComposing' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): boolean {
  return !event.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
}

/** 直後の印は拒否帳簿とは別。IMEの再変換の合図では外さない。 */
export function releasesRecentInput(last: CompositionKey & { key: string }, current: OwnerInsertionSnapshot | null): boolean {
  if (IME_FUNCTION_CODES.has(last.code)) return false
  if (isKeyStartedComposition(last, current)) return true
  return last.keyCode !== 229 && !/^(Shift|Control|Alt|Meta|AltGraph|CapsLock|Fn)$/.test(last.key)
}
