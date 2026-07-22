import { useCallback, useRef, useState } from 'react'
import {
  interpretAssetSaveResult,
  isAssetEditDirty,
  resolveSaveTransition,
} from '../../project/projectAssetEdit'

/**
 * Slice B4: Project タブ資料の右ペイン内編集 state hook。
 *
 * 境界 / 方針:
 * - 編集対象は呼び出し側で選択済みの資料 absolutePath のみ。任意 path 書き込みにしない。
 * - 保存は既存 `window.nyozeBridge.fs.writeFile`（workspace / allowedDocumentPath 境界、
 *   atomic save、`expectedStat` による外部変更検知）をそのまま通す。renderer から
 *   projectRoot は渡さない。
 * - 保存失敗・競合では textarea 内容を失わない。
 * - read-only preview を持つ {@link useProjectPanel} とは別 hook に分離する。
 */

type SavedStat = { mtimeMs: number; size: number }

export type AssetEditStatus =
  | { kind: 'none' }
  /** 保存に失敗（検証 / ディスク等）。編集内容は保持。 */
  | { kind: 'save-error' }
  /** 外部変更を検知（上書きしていない）。 */
  | { kind: 'conflict'; conflictKind: 'modified' | 'deleted' }
  /** 編集用の読み込みに失敗。textarea は無効化し、保存させない。 */
  | { kind: 'load-error' }

export type ProjectAssetEditState =
  | { kind: 'preview' }
  | {
      kind: 'editing'
      absolutePath: string
      original: string
      draft: string
      /** 読み込み時の mtime / size。保存時の expectedStat に使う。 */
      baseStat: SavedStat | null
      saving: boolean
      status: AssetEditStatus
    }

type FsBridge = NonNullable<typeof window.nyozeBridge>['fs']

function getFsBridge(): FsBridge | null {
  return window.nyozeBridge?.fs ?? null
}

async function readAssetForEdit(
  fs: FsBridge,
  absolutePath: string,
): Promise<{ ok: true; content: string; stat: SavedStat | null } | { ok: false }> {
  const read = await fs.readFile(absolutePath).catch(() => null)
  if (!read || !read.ok) return { ok: false }
  const stat = await fs.getFileStat(absolutePath).catch(() => null)
  return {
    ok: true,
    content: read.content,
    stat: stat ? { mtimeMs: stat.mtimeMs, size: stat.size } : null,
  }
}

type UseProjectAssetEditorOptions = {
  /** 保存成功時に preview を再生成するためのコールバック。 */
  onSaved: (absolutePath: string) => void
}

export function useProjectAssetEditor({ onSaved }: UseProjectAssetEditorOptions) {
  const [editState, setEditState] = useState<ProjectAssetEditState>({ kind: 'preview' })
  const [leaveBlocked, setLeaveBlocked] = useState(false)
  // 進行中の非同期読み込み / 保存を無効化するための世代カウンタ。
  const generationRef = useRef(0)
  const stateRef = useRef(editState)
  stateRef.current = editState
  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved

  const reset = useCallback(() => {
    generationRef.current += 1
    setLeaveBlocked(false)
    setEditState({ kind: 'preview' })
  }, [])

  /**
   * 未保存変更がなければ preview へ戻す。dirty なら何もしない（draft を保持する）。
   * 中央 active file 切替のような「ガードできない外部要因」で無言破棄しないために使う。
   * 戻り値: true = reset した / もともと編集していない、false = dirty で保持した。
   */
  const resetIfClean = useCallback((): boolean => {
    const current = stateRef.current
    if (current.kind === 'editing' && isAssetEditDirty(current.original, current.draft)) {
      return false
    }
    generationRef.current += 1
    setLeaveBlocked(false)
    setEditState({ kind: 'preview' })
    return true
  }, [])

  const cancelEdit = useCallback(() => {
    generationRef.current += 1
    setLeaveBlocked(false)
    setEditState({ kind: 'preview' })
  }, [])

  const beginEdit = useCallback(async (absolutePath: string) => {
    const current = stateRef.current
    if (current.kind === 'editing' && current.absolutePath === absolutePath) return
    const generation = ++generationRef.current
    setLeaveBlocked(false)

    const fs = getFsBridge()
    if (!fs) {
      setEditState({
        kind: 'editing',
        absolutePath,
        original: '',
        draft: '',
        baseStat: null,
        saving: false,
        status: { kind: 'load-error' },
      })
      return
    }

    const result = await readAssetForEdit(fs, absolutePath)
    if (generation !== generationRef.current) return
    if (!result.ok) {
      setEditState({
        kind: 'editing',
        absolutePath,
        original: '',
        draft: '',
        baseStat: null,
        saving: false,
        status: { kind: 'load-error' },
      })
      return
    }
    setEditState({
      kind: 'editing',
      absolutePath,
      original: result.content,
      draft: result.content,
      baseStat: result.stat,
      saving: false,
      status: { kind: 'none' },
    })
  }, [])

  const setDraft = useCallback((text: string) => {
    setLeaveBlocked(false)
    setEditState((prev) => {
      if (prev.kind !== 'editing') return prev
      // 入力で save-error は解消するが、外部変更 conflict は解決まで保持する。
      const status: AssetEditStatus =
        prev.status.kind === 'save-error' ? { kind: 'none' } : prev.status
      return { ...prev, draft: text, status }
    })
  }, [])

  const runSave = useCallback(async (allowOverwrite: boolean) => {
    const current = stateRef.current
    if (current.kind !== 'editing') return
    if (current.saving || current.status.kind === 'load-error') return

    const fs = getFsBridge()
    if (!fs) {
      setEditState({ ...current, saving: false, status: { kind: 'save-error' } })
      return
    }
    const generation = generationRef.current
    setEditState({ ...current, saving: true, status: { kind: 'none' } })

    const result = await fs
      .writeFile(current.absolutePath, current.draft, {
        expectedStat: current.baseStat,
        allowConflictOverwrite: allowOverwrite,
      })
      .catch(() => ({ saved: false }) as { saved: boolean })

    // 保存中に reset / cancel / 別ファイル編集が走っていたら破棄する。
    if (generation !== generationRef.current) return

    const transition = resolveSaveTransition(interpretAssetSaveResult(result))
    if (transition.kind === 'to-preview') {
      generationRef.current += 1
      setLeaveBlocked(false)
      setEditState({ kind: 'preview' })
      onSavedRef.current(current.absolutePath)
      return
    }
    // 競合 / 失敗時は編集を続行し、draft（textarea 内容）を保持する。
    setEditState({ ...current, saving: false, status: transition.status })
  }, [])

  const save = useCallback(() => runSave(false), [runSave])
  const overwriteSave = useCallback(() => runSave(true), [runSave])

  const reloadFromDisk = useCallback(async () => {
    const current = stateRef.current
    if (current.kind !== 'editing') return
    const fs = getFsBridge()
    if (!fs) return
    const generation = ++generationRef.current
    setLeaveBlocked(false)
    const result = await readAssetForEdit(fs, current.absolutePath)
    if (generation !== generationRef.current) return
    if (!result.ok) {
      setEditState({ ...current, saving: false, status: { kind: 'load-error' } })
      return
    }
    setEditState({
      kind: 'editing',
      absolutePath: current.absolutePath,
      original: result.content,
      draft: result.content,
      baseStat: result.stat,
      saving: false,
      status: { kind: 'none' },
    })
  }, [])

  /**
   * 編集中の領域から離れてよいか確認する。
   * 未保存変更があれば離脱をブロック（notice 表示）して true を返す。
   * 編集していない / 変更がなければ preview へ戻して false を返す。
   */
  const requestLeave = useCallback((): boolean => {
    const current = stateRef.current
    if (current.kind !== 'editing') return false
    if (isAssetEditDirty(current.original, current.draft)) {
      setLeaveBlocked(true)
      return true
    }
    generationRef.current += 1
    setLeaveBlocked(false)
    setEditState({ kind: 'preview' })
    return false
  }, [])

  const isDirty =
    editState.kind === 'editing' && isAssetEditDirty(editState.original, editState.draft)

  return {
    editState,
    leaveBlocked,
    isDirty,
    beginEdit,
    setDraft,
    save,
    overwriteSave,
    reloadFromDisk,
    cancelEdit,
    requestLeave,
    reset,
    resetIfClean,
  }
}

export type ProjectAssetEditorApi = ReturnType<typeof useProjectAssetEditor>
