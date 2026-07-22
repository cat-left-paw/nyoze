/**
 * Slice B4: Project タブ資料簡易編集の pure ロジック。
 *
 * - filesystem / React に依存しない。dirty 判定・保存結果の解釈・編集可能 role 判定だけを持つ。
 * - 編集対象は Project タブの資料 role のみ（body file は右ペイン内編集の対象外）。
 * - 外部変更検知そのものは main 側 `fs:writeFile`（expectedStat / conflictKind）に委譲し、
 *   ここではその結果を UI 向け outcome へ変換する。
 */

import { PROJECT_ASSET_ROLES, type ProjectAssetRole } from './projectBooksQuery'

/** `fs:writeFile` 戻り値のうち、保存結果の解釈に必要な最小サブセット。 */
export type AssetWriteResult = {
  saved: boolean
  conflictKind?: 'modified' | 'deleted'
}

export type AssetSaveOutcome =
  | { kind: 'saved' }
  | { kind: 'conflict'; conflictKind: 'modified' | 'deleted' }
  | { kind: 'error' }

/** textarea の内容が読み込み時から変化しているか。 */
export function isAssetEditDirty(original: string, draft: string): boolean {
  return original !== draft
}

/**
 * `fs:writeFile` の結果を編集 UI 向けの outcome へ変換する。
 * - saved: 保存成功。
 * - conflict: 外部変更を検知し上書きしなかった（expectedStat 不一致）。
 * - error: 検証・ディスクエラー等（保存できなかった）。textarea 内容は保持する想定。
 */
export function interpretAssetSaveResult(result: AssetWriteResult): AssetSaveOutcome {
  if (result.saved) return { kind: 'saved' }
  if (result.conflictKind) {
    return { kind: 'conflict', conflictKind: result.conflictKind }
  }
  return { kind: 'error' }
}

/** 保存に失敗 / 競合したときに編集状態へ残す status。 */
export type AssetEditFailureStatus =
  | { kind: 'save-error' }
  | { kind: 'conflict'; conflictKind: 'modified' | 'deleted' }

/**
 * 保存 outcome から編集状態の遷移を決める。
 * - saved → preview へ戻す（dirty 解除、preview 再生成は呼び出し側）。
 * - conflict / error → 編集を続行し、textarea 内容は保持する（失わない）。
 */
export type AssetSaveTransition =
  | { kind: 'to-preview' }
  | { kind: 'keep-editing'; status: AssetEditFailureStatus }

export function resolveSaveTransition(outcome: AssetSaveOutcome): AssetSaveTransition {
  if (outcome.kind === 'saved') return { kind: 'to-preview' }
  if (outcome.kind === 'conflict') {
    return { kind: 'keep-editing', status: { kind: 'conflict', conflictKind: outcome.conflictKind } }
  }
  return { kind: 'keep-editing', status: { kind: 'save-error' } }
}

const ASSET_ROLE_SET: ReadonlySet<string> = new Set(PROJECT_ASSET_ROLES)

/**
 * 右ペイン内編集を許可してよい role か。
 * `synopsis` / `character` / `setting` / `material` / `unsorted` のみ true。
 * `body` / `note` / unknown は false（body file は右ペイン内編集の対象外）。
 */
export function isEditableAssetRole(role: string): role is ProjectAssetRole {
  return ASSET_ROLE_SET.has(role)
}
