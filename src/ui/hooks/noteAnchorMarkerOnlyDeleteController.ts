import { NOTE_ANCHOR_BRIDGE_UNAVAILABLE_MESSAGE } from './noteAnchorInsertController'
import { getPlainFormattingUnavailableMessage, type PlainModeKind } from '../utils/plainModeCommandGate'

/**
 * dangling marker cleanup: 本文 anchor のみ削除。notes.json は変更しない。
 */

export const NOTE_ANCHOR_MARKER_ONLY_REMOVE_ERROR_MESSAGE =
  '本文の付箋マーカーを削除できませんでした。'

export type NoteAnchorMarkerOnlyDeleteDeps = {
  isInternalDoc: () => boolean
  getPlainModeKind: () => PlainModeKind | null
  removeAnchorAtDom: (markerElement: Element | null, id: string) => boolean
}

export type NoteAnchorMarkerOnlyDeletePrepareResult =
  | { kind: 'ready' }
  | { kind: 'blocked'; message: string }

export type NoteAnchorMarkerOnlyDeleteCommitResult =
  | { kind: 'removed'; id: string }
  | { kind: 'failed'; message: string }

export async function prepareNoteAnchorMarkerOnlyDelete(
  deps: NoteAnchorMarkerOnlyDeleteDeps,
): Promise<NoteAnchorMarkerOnlyDeletePrepareResult> {
  if (deps.isInternalDoc()) {
    return { kind: 'blocked', message: NOTE_ANCHOR_BRIDGE_UNAVAILABLE_MESSAGE }
  }
  const plainModeKind = deps.getPlainModeKind()
  if (plainModeKind !== null) {
    return { kind: 'blocked', message: getPlainFormattingUnavailableMessage(plainModeKind) }
  }
  return { kind: 'ready' }
}

export function commitNoteAnchorMarkerOnlyDelete(
  deps: NoteAnchorMarkerOnlyDeleteDeps,
  options: {
    id: string
    domMarker: Element | null
  },
): NoteAnchorMarkerOnlyDeleteCommitResult {
  if (!deps.removeAnchorAtDom(options.domMarker, options.id)) {
    return { kind: 'failed', message: NOTE_ANCHOR_MARKER_ONLY_REMOVE_ERROR_MESSAGE }
  }
  return { kind: 'removed', id: options.id }
}
