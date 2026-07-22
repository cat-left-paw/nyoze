import { useCallback, useEffect, useState } from 'react'
import type { LibraryRegistryReadResult } from '../../settings/libraryRegistry'

/**
 * 書庫 (library / workspace) registry の表示用 hook。
 *
 * 書庫管理画面が canonical な registry を購読できるよう、main 側 `library:getRegistry`
 * を呼んで loading / ready / error の state を返す。`reload()` で read-only に再取得できる
 * (書庫切り替え成功後などに使う)。
 *
 * このフック自体は registry を書き換えない。File Explorer の既存 workspace root state は
 * そのまま使い、置き換えず parallel な model として並走する。`.nyoze` を作らない方針
 * (filesystem に触れない) を保つため、ここから Project / Book / Notes の write IPC や
 * `.nyoze` 関連 IPC は呼ばない。active 書庫の切り替え mutation は呼び出し側 (modal) が
 * `library.setActive(libraryId)` で行い、成功後に `reload()` する。
 */
export type LibraryRegistryHookState =
  | { status: 'loading' }
  | ({ status: 'ready' } & LibraryRegistryReadResult)
  | { status: 'error'; message: string }

export function useLibraryRegistry(): {
  state: LibraryRegistryHookState
  reload: () => void
} {
  const [state, setState] = useState<LibraryRegistryHookState>({ status: 'loading' })
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    const bridge = window.nyozeBridge?.library
    if (!bridge) {
      setState({ status: 'error', message: 'library bridge unavailable' })
      return
    }
    setState({ status: 'loading' })
    bridge
      .getRegistry()
      .then((result) => {
        if (cancelled) return
        setState({ status: 'ready', ...result })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : String(err),
        })
      })
    return () => {
      cancelled = true
    }
  }, [nonce])

  return { state, reload }
}
