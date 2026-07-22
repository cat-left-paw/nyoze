import { useCallback, useState } from 'react'
import type { UiTextKey } from '../i18n/uiText'
import type { ProjectCreateResult } from '../../project/projectIpcTypes'

/**
 * Slice B5: Project 作成 UI の状態 hook。
 *
 * 境界:
 * - ユーザー明示操作（ボタン / 作成フォーム）からのみ project を作成する。自動 project 化はしない。
 * - 既存 `project:create` IPC だけを使う。新 IPC は作らない。
 * - renderer は対象 folder path と作成オプション（作品名 / 最初の Book 名）だけを渡し、
 *   realpath 解決・workspace 境界検査・既存 project の検出は main 側で行う。
 *   解決済み project root を renderer から申告させない。
 * - 作成成功時に main 側が `.nyoze/project.json` と v3 `.nyoze/books.json` を初期作成する。
 *
 * read-only な {@link useProjectPanel} に作成状態を詰め込まないよう、独立した小さな
 * hook として分離している。
 */

type ProjectCreateBridge = NonNullable<typeof window.nyozeBridge>['project']

export type ProjectCreateState =
  | { kind: 'idle' }
  | { kind: 'creating' }
  | { kind: 'error'; messageKey: UiTextKey }

export type CreateErrorReason = Extract<ProjectCreateResult, { ok: false }>['reason']

/**
 * main 側の失敗理由を、表示用 i18n キーへ畳み込む。
 * Project タブ / File Explorer の両方の作成導線で共有する（メッセージ文言を一元化）。
 */
export function projectCreateErrorMessageKey(reason: CreateErrorReason): UiTextKey {
  switch (reason) {
    case 'outside-workspace':
      return 'projectPanel.createErrorOutsideWorkspace'
    case 'workspace-root-not-allowed':
      return 'projectPanel.createErrorWorkspaceRoot'
    case 'already-exists':
      return 'projectPanel.createErrorExists'
    case 'inside-existing-project':
      return 'projectPanel.createErrorInsideProject'
    case 'contains-existing-project':
      return 'projectPanel.createErrorContainsProject'
    default:
      return 'projectPanel.createErrorGeneric'
  }
}

function getProjectBridge(): ProjectCreateBridge | null {
  return window.nyozeBridge?.project ?? null
}

type UseProjectCreateOptions = {
  /** 作成成功後に呼ぶ。通常は Project タブの再読み込み。 */
  onCreated: () => void
}

export function useProjectCreate({ onCreated }: UseProjectCreateOptions) {
  const [createState, setCreateState] = useState<ProjectCreateState>({ kind: 'idle' })

  const createProjectForFolder = useCallback(
    async (
      folderPath: string,
      options?: { projectTitle?: string; initialBookName?: string },
    ) => {
      const bridge = getProjectBridge()
      if (!bridge) {
        setCreateState({ kind: 'error', messageKey: 'projectPanel.createErrorGeneric' })
        return
      }
      setCreateState({ kind: 'creating' })
      // 作品名 / 最初の Book 名だけを渡す。解決済み root は送らず、root 解決と
      // `.nyoze/{project,books}.json` 初期作成は main 側が行う。
      const result = await bridge.createProject(folderPath, options).catch(() => null)
      if (!result || !result.ok) {
        setCreateState({
          kind: 'error',
          messageKey: result
            ? projectCreateErrorMessageKey(result.reason)
            : 'projectPanel.createErrorGeneric',
        })
        return
      }
      setCreateState({ kind: 'idle' })
      onCreated()
    },
    [onCreated],
  )

  const resetCreateState = useCallback(() => {
    setCreateState({ kind: 'idle' })
  }, [])

  return { createState, createProjectForFolder, resetCreateState }
}
