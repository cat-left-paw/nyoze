import { useCallback, useEffect, useRef, useState } from 'react'
import type { UnregisteredProjectFile } from '../../project/bookManifestV3UnregisteredFiles'
import type {
  BookManifestV3UnregisteredFilesIpcResult,
  ProjectPanelWriteAnchor,
} from '../../project/projectIpcTypes'

/**
 * Book manifest v3: Project タブの未登録ファイル一覧（read-only query）。
 *
 * - renderer は write anchor（または bounded file path）だけを bridge に渡す。projectRoot は送らない。
 * - v3 registry を正本に list する。
 * - `enabled`（v3 ready Project）のときだけ query する。IPC error は UI に出さず idle へ畳む。
 */

export type UnregisteredFilesState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; files: UnregisteredProjectFile[] }

type ProjectBridge = NonNullable<typeof window.nyozeBridge>['project']

function getProjectBridge(): ProjectBridge | null {
  return window.nyozeBridge?.project ?? null
}

function mapUnregisteredIpcResult(
  result: BookManifestV3UnregisteredFilesIpcResult,
): UnregisteredFilesState {
  if (result.ok && result.kind === 'ready') {
    return { kind: 'ready', files: result.files }
  }
  return { kind: 'idle' }
}

/** anchor の identity 比較キー（refresh / 競合判定用）。 */
function anchorKey(anchor: ProjectPanelWriteAnchor | null): string {
  if (anchor === null) return ''
  if (typeof anchor === 'string') return `file:${anchor}`
  return `ctx:${anchor.kind}:${anchor.source}:${anchor.selectedPath}`
}

type UseBookManifestV3UnregisteredFilesOptions = {
  getAnchor: () => ProjectPanelWriteAnchor | null
  /** v3 ready Project のとき true。 */
  enabled: boolean
}

export function useBookManifestV3UnregisteredFiles({
  getAnchor,
  enabled,
}: UseBookManifestV3UnregisteredFilesOptions) {
  const getAnchorRef = useRef(getAnchor)
  const refreshGenerationRef = useRef(0)
  getAnchorRef.current = getAnchor

  const [state, setState] = useState<UnregisteredFilesState>({ kind: 'idle' })

  const refreshUnregisteredFiles = useCallback(async () => {
    if (!enabled) {
      setState({ kind: 'idle' })
      return
    }

    const anchor = getAnchorRef.current()
    if (anchor === null) {
      setState({ kind: 'idle' })
      return
    }

    const bridge = getProjectBridge()
    if (!bridge?.resolveUnregisteredFilesV3) {
      setState({ kind: 'idle' })
      return
    }

    const generation = ++refreshGenerationRef.current
    const key = anchorKey(anchor)
    setState({ kind: 'loading' })

    const result = await bridge.resolveUnregisteredFilesV3(anchor).catch(() => null)
    if (
      generation !== refreshGenerationRef.current ||
      anchorKey(getAnchorRef.current()) !== key ||
      !enabled
    ) {
      return
    }

    if (!result) {
      setState({ kind: 'idle' })
      return
    }
    setState(mapUnregisteredIpcResult(result))
  }, [enabled])

  const key = anchorKey(getAnchor())

  useEffect(() => {
    if (!enabled) {
      refreshGenerationRef.current += 1
      setState({ kind: 'idle' })
      return
    }
    void refreshUnregisteredFiles()
  }, [key, enabled, refreshUnregisteredFiles])

  return {
    unregisteredFilesState: state,
    refreshUnregisteredFiles,
  }
}
