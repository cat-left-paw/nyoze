import { useCallback, useRef, useState } from 'react'
import type { ProjectListEntry } from '../../project/projectIpcTypes'

/**
 * Project 一覧（作品切り替え用）の read-only query hook。
 *
 * 境界:
 * - `window.nyozeBridge.project.listProjects()` を引数なしで呼ぶ（projectRoot は送らない）。
 *   workspace root の解決と走査は main 側で行う。
 * - 書き込みは一切しない（read-only）。localStorage / settings / project.json / books.json へ保存しない。
 * - open 中の refresh / 遅延結果は generation guard で破棄する。
 * - `refresh()` は一度でも load 済み（idle でない）のときだけ再取得する。Project タブの
 *   title / books.json 更新後や登録解除後に呼んでも、一覧未表示なら no-op で済む。
 */
export type ProjectListUiState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; projects: ProjectListEntry[] }
  | { kind: 'unavailable' }
  | { kind: 'error' }

export function useProjectList() {
  const [state, setState] = useState<ProjectListUiState>({ kind: 'idle' })
  const generationRef = useRef(0)
  const stateRef = useRef(state)
  stateRef.current = state

  const run = useCallback(async () => {
    const bridge = window.nyozeBridge?.project
    if (!bridge?.listProjects) {
      setState({ kind: 'unavailable' })
      return
    }
    const generation = ++generationRef.current
    setState({ kind: 'loading' })

    const result = await bridge.listProjects().catch(() => null)
    if (generation !== generationRef.current) return

    if (!result || !result.ok) {
      setState({ kind: 'error' })
      return
    }
    if (result.kind === 'unavailable') {
      setState({ kind: 'unavailable' })
      return
    }
    setState({ kind: 'ready', projects: result.projects })
  }, [])

  /** 一覧を取得する（一覧を開くとき / 明示 refresh 時）。 */
  const load = run

  /** 既に load 済みのときだけ再取得する（未表示なら no-op）。 */
  const refresh = useCallback(() => {
    if (stateRef.current.kind === 'idle') return
    void run()
  }, [run])

  /** 一覧を閉じる。generation を進めて遅延結果を破棄し、idle に戻す。 */
  const reset = useCallback(() => {
    generationRef.current += 1
    setState({ kind: 'idle' })
  }, [])

  return { projectListState: state, load, refresh, reset }
}

export type ProjectListApi = ReturnType<typeof useProjectList>
