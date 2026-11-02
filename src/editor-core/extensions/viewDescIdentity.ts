import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { repairViewDescNodeIdentity } from '../features/viewDescIdentityRepair'

export const viewDescIdentityPluginKey = new PluginKey('nyozeViewDescIdentity')

/**
 * EDITOR-VIEWDESC-IDENTITY-PERF1: 本文の変わった view の更新の後に、block の desc が持つ node を
 * 現在の文書の node と同じ object へ付け替える（`features/viewDescIdentityRepair.ts`）。
 *
 * plugin view の `update` は `EditorView.updateState()` の中で、DOM と Selection の同期の後に同期で
 * 呼ばれる。ここでは transaction を出さず、DOM・Selection に触れず、timer・rAF も使わない。
 * state・props・decoration を持たないので、ほかの plugin との順序に意味はない。
 */
export function createViewDescIdentityPlugin(): Plugin {
  return new Plugin({
    key: viewDescIdentityPluginKey,
    view(view) {
      repairViewDescNodeIdentity(view)
      return {
        update(updatedView, prevState) {
          if (prevState.doc === updatedView.state.doc) return
          repairViewDescNodeIdentity(updatedView)
        },
      }
    },
  })
}

export const ViewDescIdentity = Extension.create({
  name: 'viewDescIdentity',

  addProseMirrorPlugins() {
    return [createViewDescIdentityPlugin()]
  },
})
