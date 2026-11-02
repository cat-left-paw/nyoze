/**
 * PIS-S10-ENTRY-UI1・PIS-S10-PREEDIT-DISPLAY1: UIの側から入力面へ渡す、表示の値の薄い入口。
 *
 * - 入力面はsettingsもUIのi18nも読まない。UI（製品の入口のhook）が、設定と表示の言語から決めた値をここへ書く。
 * - 変換中の文字の表示は、入力面が`compositionstart`の時点で1回だけ読む（その変換の間は固定）。
 * - 入力欄の名前は、変わったときに通知する（入力面が`aria-label`を書き直す）。timer・pollingは使わない。
 */
export type InputSurfacePreeditDisplay = 'inline' | 'overlay'

/** UIが名前を渡す前（unit testなど）の名前。製品ではUIが表示の言語に合わせて上書きする。 */
const FALLBACK_ACCESSIBLE_NAME = '本文の入力'

let preeditDisplay: InputSurfacePreeditDisplay = 'inline'
let accessibleName = FALLBACK_ACCESSIBLE_NAME
const nameListeners = new Set<() => void>()

export function setInputSurfacePreeditDisplay(next: InputSurfacePreeditDisplay): void {
  preeditDisplay = next === 'overlay' ? 'overlay' : 'inline'
}
export function readInputSurfacePreeditDisplay(): InputSurfacePreeditDisplay { return preeditDisplay }

export function setInputSurfaceAccessibleName(next: string): void {
  if (!next || next === accessibleName) return
  accessibleName = next
  for (const listener of Array.from(nameListeners)) listener()
}
export function readInputSurfaceAccessibleName(): string { return accessibleName }
export function subscribeInputSurfaceAccessibleName(listener: () => void): () => void {
  nameListeners.add(listener)
  return () => { nameListeners.delete(listener) }
}

/**
 * 変換の開始の時点で、Hostに予約領域を置く（押し出しの表示）か。
 *
 * - 写しからの再変換（RECONVERT1）: 設定によらず置く（押し出し）。
 * - 範囲の変換（打鍵で選択範囲を打ち替える）: 設定によらず置かない（重ねる）。
 * - collapsedなcaretから始まる変換: 設定が`inline`なら置く、`overlay`なら置かない。
 */
export function shouldPresentCompositionAtStart(input: {
  preeditDisplay: InputSurfacePreeditDisplay
  collapsed: boolean
  reconversion: boolean
}): boolean {
  if (input.reconversion) return true
  if (!input.collapsed) return false
  return input.preeditDisplay === 'inline'
}

/** unit test専用。 */
export function resetInputSurfacePreferencesForTest(): void {
  preeditDisplay = 'inline'
  accessibleName = FALLBACK_ACCESSIBLE_NAME
  nameListeners.clear()
}
