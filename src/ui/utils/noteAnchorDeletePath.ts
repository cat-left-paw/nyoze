import type { NyozeNotesStore } from '../../project/noteStore'
import type { NoteAnchorProjectBridge } from '../hooks/noteAnchorInsertController'
import type { DocumentNotesViewState } from '../hooks/useDocumentNotes'

export type NoteAnchorDeletePath = 'full' | 'markerOnly'

/** notes.json read 結果から削除経路を判定する。 */
export function classifyNoteAnchorDeletePathFromStore(
  id: string,
  store: NyozeNotesStore | null,
  readOk: boolean,
): NoteAnchorDeletePath {
  if (!readOk || !store) return 'markerOnly'
  const note = store.notes[id]
  if (note && note.status === 'open') return 'full'
  return 'markerOnly'
}

/** action 実行時に bridge 経由で削除経路を解決する。 */
export async function resolveNoteAnchorDeletePath(
  bridge: NoteAnchorProjectBridge | null,
  activeFilePath: string | null,
  id: string,
): Promise<NoteAnchorDeletePath> {
  if (!bridge || !activeFilePath) return 'markerOnly'
  const notes = await bridge.readNotes(activeFilePath)
  return classifyNoteAnchorDeletePathFromStore(
    id,
    notes.ok ? notes.store : null,
    notes.ok,
  )
}

/** context menu 表示用の軽量推定。同期 I/O は行わない。 */
export function deriveMarkerDeleteModeForMenu(
  id: string | null,
  documentNotesState: DocumentNotesViewState,
): NoteAnchorDeletePath | null {
  if (!id) return null
  if (documentNotesState.kind === 'ready') {
    return documentNotesState.notes.some((note) => note.id === id) ? 'full' : 'markerOnly'
  }
  return 'markerOnly'
}
