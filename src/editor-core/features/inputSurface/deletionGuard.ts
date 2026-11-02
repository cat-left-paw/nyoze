import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { auditOwnerDeletionTransaction, auditTextPreservingTransaction, resolveOwnerDeletion, type DeleteKey, type OwnerDeletionPlan } from './deletionRules'
import type { SurfaceRecord } from './inputSurface'

/** ownerの同期delete呼び出し中だけ有効。rootとappendedの両方を適用前に拒否できる。 */
export function createOwnerDeletionGuard(record: SurfaceRecord, getLiveState: () => EditorState) {
  let active: { state: EditorState; plan: OwnerDeletionPlan; deleteKey: DeleteKey; accepted: number; rejected: boolean } | null = null
  const key = new PluginKey('pisOwnerDeletionGuard')
  const plugin = new Plugin({ key, filterTransaction(tr, state) {
    if (!active) return true
    // PMはappendedTransaction metaをfilter通過後に付ける。apply中のstateは
    // 未公開なので、metaがまだなくてもlive view.stateとのidentity差で区別できる。
    const appended = !!tr.getMeta('appendedTransaction') || state !== getLiveState()
    if (!tr.steps.length && !tr.selectionSet && !tr.storedMarksSet && tr.isGeneric) {
      if (appended) record('owner-delete-appended', { empty: true })
      return true // 完全な空transactionは通すがrootとして数えない。
    }
    // 空root由来のappended正規化でDocが更新された場合も最新の計画で検査する。
    const plan = appended || (state.doc === active.state.doc && state.selection.eq(active.state.selection))
      ? active.plan : resolveOwnerDeletion(state, active.deleteKey)
    const reason = tr.before !== state.doc ? 'stale-delete-base'
      : appended ? auditTextPreservingTransaction(tr)
        : active.accepted ? 'multiple-delete-transactions' : auditOwnerDeletionTransaction(state, plan, tr)
    if (reason) {
      active.rejected = true
      record('owner-delete-rejected', { reason, appended, from: plan.from, to: plan.to })
      return false
    }
    if (appended) record('owner-delete-appended', { steps: tr.steps.length, docChanged: tr.docChanged })
    else active.accepted++
    return true
  } })
  return { key, plugin,
    rejected: () => active?.rejected ?? false,
    dispatched: () => (active?.accepted ?? 0) > 0,
    run<T>(state: EditorState, plan: OwnerDeletionPlan, deleteKey: DeleteKey, callback: () => T): T {
      if (active) throw new Error('reentrant owner deletion')
      active = { state, plan, deleteKey, accepted: 0, rejected: false }
      try { return callback() } finally { active = null }
    },
  }
}
