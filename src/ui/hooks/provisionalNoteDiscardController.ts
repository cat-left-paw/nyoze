/**
 * STICKY-NOTE-DISCARD-CONSISTENCY1: 明示的な破棄時の provisional note cleanup を
 * 実行する controller（DI / unit テスト対象）。
 *
 * document leave の authority 自体は既存の共通経路
 * （`confirmContinueWithUnsavedChanges` / save-before-close の close handshake）に
 * 残し、ここは「追跡済み provisional note を project 単位で 1 回ずつ取り除く」
 * だけを担当する。第二の document-leave state machine は作らない。
 *
 * fail-closed: 1 group でも失敗したら失敗を返す。呼び出し側は document leave /
 * close / quit を成功扱いにしてはならない。timer / polling / 再試行はしない。
 */

import {
  groupProvisionalNotesByProject,
  type ProvisionalNoteCleanupRequest,
  type ProvisionalNoteRecord,
} from '../../project/provisionalNoteCleanup'
import type { ProjectDiscardProvisionalNotesResult } from '../../project/projectIpcTypes'

export const PROVISIONAL_NOTE_DISCARD_ERROR_MESSAGE =
  '付箋データ (notes.json) を更新できなかったため、変更を破棄できませんでした。\n' +
  '本文と付箋データは変更していません。'

/**
 * 複数 project にまたがる cleanup は、この時点では安全に行えない。
 *
 * `notes.json` は project ごとに別ファイル・別 lock なので、2 番目の project で
 * 失敗したとき 1 番目の削除を巻き戻せない。「失敗したら本文も付箋も変更しない」
 * という fail-closed 契約を破るくらいなら、**1 件も書かずに拒否する**。
 */
export const PROVISIONAL_NOTE_DISCARD_MULTI_PROJECT_MESSAGE =
  '複数の作品にまたがる未保存の付箋があるため、まとめて破棄できません。\n' +
  '付箋データは変更していません。保存するか、作品ごとにタブを閉じてください。'

/**
 * 未保存 anchor の付箋がある document の「名前を付けて保存」は拒否する。
 *
 * 追跡 record は anchor を追加した時点の絶対 path / project root を持つ。Save As は
 * 保存先を変えるため、(1) 新しい本文には anchor があるのに (2) 追跡は旧 path のまま
 * 残り、後続の破棄 cleanup が旧 project の note を消して「marker だけが残る」最悪の
 * 不整合を作り得る。安全な note 移送は本スライスの対象外なので、明示的に止める。
 */
export const PROVISIONAL_NOTE_SAVE_AS_BLOCKED_MESSAGE =
  '未保存の付箋があるため、この文書は「名前を付けて保存」できません。\n' +
  'いったん上書き保存して付箋を確定してから、改めて保存し直してください。'

export type ProvisionalNoteDiscardBridge = {
  discardProvisionalNotes: (
    filePath: string,
    request: ProvisionalNoteCleanupRequest,
  ) => Promise<ProjectDiscardProvisionalNotesResult>
}

export type ProvisionalNoteDiscardOutcome =
  | { kind: 'cleaned'; removedIds: string[] }
  | { kind: 'failed'; message: string; reason: string }

/**
 * 追跡済み provisional note を取り除く。
 *
 * 対象 0 件は正常系（bridge を呼ばず disk write も起こさない）。
 * bridge 未提供は失敗にする（cleanup できないまま破棄を通さないため）。
 */
export async function discardProvisionalNotes(
  bridge: ProvisionalNoteDiscardBridge | null,
  records: readonly ProvisionalNoteRecord[],
): Promise<ProvisionalNoteDiscardOutcome> {
  const groups = groupProvisionalNotesByProject(records)
  if (groups.length === 0) return { kind: 'cleaned', removedIds: [] }
  if (groups.length > 1) {
    // partial write を残さないため、bridge を呼ぶ前に拒否する（disk write 0）。
    return {
      kind: 'failed',
      message: PROVISIONAL_NOTE_DISCARD_MULTI_PROJECT_MESSAGE,
      reason: 'multi-project-scope',
    }
  }
  if (!bridge) {
    return {
      kind: 'failed',
      message: PROVISIONAL_NOTE_DISCARD_ERROR_MESSAGE,
      reason: 'bridge-unavailable',
    }
  }

  // ここへ来る時点で group は必ず 1 つ（＝write は最大 1 回）。
  const removedIds: string[] = []
  for (const group of groups) {
    let result: ProjectDiscardProvisionalNotesResult
    try {
      result = await bridge.discardProvisionalNotes(group.filePath, {
        projectRoot: group.projectRoot,
        entries: group.entries,
      })
    } catch {
      return {
        kind: 'failed',
        message: PROVISIONAL_NOTE_DISCARD_ERROR_MESSAGE,
        reason: 'bridge-threw',
      }
    }
    if (!result.ok) {
      return {
        kind: 'failed',
        message: PROVISIONAL_NOTE_DISCARD_ERROR_MESSAGE,
        reason: result.reason,
      }
    }
    for (const id of result.removedIds) {
      if (!removedIds.includes(id)) removedIds.push(id)
    }
  }
  return { kind: 'cleaned', removedIds }
}
