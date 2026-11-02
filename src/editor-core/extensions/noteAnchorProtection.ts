import { Extension } from '@tiptap/core'
import { createNoteAnchorProtectionPlugin } from '../features/noteAnchorProtection'

export { noteAnchorProtectionPluginKey } from '../features/noteAnchorProtection'

export const NoteAnchorProtection = Extension.create({
  name: 'noteAnchorProtection',

  addProseMirrorPlugins() {
    return [createNoteAnchorProtectionPlugin()]
  },
})
