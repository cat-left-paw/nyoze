/**
 * PIS-OS-INPUT1 段階C: 写しがある間、MacのControl付きのキー（Cocoaのkey binding。Control+N・P・O、Control+Option+Bなど）の
 * nativeの既定を止める。既定は`beforeinput`なしに入力面の中の選択を畳み、次の直接入力が写しと合わずに捨てられる
 * （`direct-text-mismatch`）。止めると範囲の表示と次の1文字の行き先がそろう（次の1文字は範囲を置き換える）。
 * PM・アプリのshortcutが処理したキー（`defaultPrevented`）、Meta付き、変換中・229、写しのないとき、Mac以外は対象外。
 */
export type MirrorNativeCommandKey = Pick<KeyboardEvent, 'key' | 'code' | 'keyCode' | 'ctrlKey' | 'metaKey' | 'isComposing' | 'defaultPrevented'>
export function blocksMirrorNativeCommand(event: MirrorNativeCommandKey, context: { mac: boolean; mirror: boolean; composing: boolean }): boolean {
  return context.mac && context.mirror && !context.composing && !event.isComposing && event.keyCode !== 229
    && event.ctrlKey && !event.metaKey && !event.defaultPrevented
    && (/^Key[A-Z]$/.test(event.code) || /^[a-z]$/i.test(event.key))
}

/**
 * アプリのshortcut（`useGlobalShortcuts`、windowのbubble）は入力面のlistenerより後に処理し、`defaultPrevented`のeventを
 * 処理しない。判定は同じeventの伝播の最後（その時点で足したwindowのlistenerは、既存のlistenerの後に呼ばれる）に行う。
 * 伝播が途中で止められたeventには何もしない（次のkeydownで外す）。
 */
export function createMirrorNativeCommandGuard(win: Window, onBlock: (event: KeyboardEvent) => void) {
  let pending: ((event: Event) => void) | null = null
  const clear = () => { if (pending) win.removeEventListener('keydown', pending); pending = null }
  return {
    arm(event: KeyboardEvent, context: { mac: boolean; mirror: boolean; composing: boolean }) {
      clear()
      if (!blocksMirrorNativeCommand(event, context)) return
      const last = (seen: Event) => {
        clear()
        if (seen !== event || !blocksMirrorNativeCommand(event, context)) return
        event.preventDefault()
        onBlock(event)
      }
      pending = last
      win.addEventListener('keydown', last)
    },
    destroy: clear,
  }
}
