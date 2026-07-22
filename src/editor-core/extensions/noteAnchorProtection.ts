import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import {
  NOTE_ANCHOR_DOCUMENT_LOAD_META_KEY,
  buildStripNoteAnchorMarksTransaction,
  NOTE_ANCHOR_DELETE_META_KEY,
  transactionRemovesNoteAnchor,
} from '../features/noteAnchorProtection'

export const noteAnchorProtectionPluginKey = new PluginKey('noteAnchorProtection')

export const NoteAnchorProtection = Extension.create({
  name: 'noteAnchorProtection',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: noteAnchorProtectionPluginKey,
        filterTransaction(tr, state) {
          if (!tr.docChanged) return true
          if (tr.getMeta(NOTE_ANCHOR_DELETE_META_KEY)) return true
          if (tr.getMeta(NOTE_ANCHOR_DOCUMENT_LOAD_META_KEY)) return true
          if (!transactionRemovesNoteAnchor(tr, state.doc)) return true
          return false
        },
        appendTransaction(_transactions, _oldState, newState) {
          return buildStripNoteAnchorMarksTransaction(newState)
        },
      }),
    ]
  },
})
