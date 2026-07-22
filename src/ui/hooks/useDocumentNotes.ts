import { useCallback, useEffect, useRef, useState } from 'react'
import { getNoteDisplayColorKey, type NoteColorId } from '../../project/noteColor'
import {
  buildTagRegistry,
  buildTagSlotViews,
  listDefinedTags,
  padTagSlotsToSix,
  resolveNoteTagLabels,
  type StickyNoteTagDefinition,
  type StickyNoteTagSlotView,
} from '../../project/noteTags'
import {
  deriveNoteDisplayTitle,
  listOpenNotesForFile,
  listResolvedNotesForFile,
} from '../../project/documentNotesQuery'
import type { DocumentNoteEntry } from '../../project/documentNotesQuery'
import { toProjectRelativeFilePath } from '../../project/notePath'
import { renderNoteMarkdownPreview } from '../utils/noteMarkdownPreview'
import type { NoteAnchorProjectBridge } from './noteAnchorInsertController'
import type { NyozeNotesStore } from '../../project/noteStore'

export type DocumentNoteView = {
  id: string
  displayTitle: string
  bodyHtml: string
  updatedAt: string
  /** カード / CSS 用の resolved palette id。 */
  displayColorKey: NoteColorId
  /** 編集 UI 初期値用の store 生 color。 */
  rawColor: string
  /** 編集 UI 初期値用の生タイトル (欠損時 undefined)。表示は displayTitle を使う。 */
  rawTitle?: string
  /** 編集 UI 初期値用の生 Markdown 本文。 */
  rawText: string
  /** store 上の tag id 配列 (未知 id 含む)。 */
  tagIds: string[]
  /** 表示用に解決できたタグのみ。 */
  displayTags: StickyNoteTagDefinition[]
}

export type DocumentNotesTagContext = {
  tagSlots: StickyNoteTagSlotView[]
  definedTags: StickyNoteTagDefinition[]
}

export type DocumentNotesViewState =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string }
  | { kind: 'empty'; tagContext: DocumentNotesTagContext }
  | {
      kind: 'ready'
      notes: DocumentNoteView[]
      resolvedNotes: DocumentNoteView[]
      tagContext: DocumentNotesTagContext
    }

export const DOCUMENT_NOTES_READ_ERROR_MESSAGE =
  '付箋データを読み込めませんでした。'

function getProjectBridge(): NoteAnchorProjectBridge | null {
  return window.nyozeBridge?.project ?? null
}

function buildTagContext(store: NyozeNotesStore): DocumentNotesTagContext {
  const tagSlots = buildTagSlotViews(store.stickyNoteTags)
  const definedTags = listDefinedTags(padTagSlotsToSix(store.stickyNoteTags))
  return { tagSlots, definedTags }
}

function mapNoteEntriesToViews(
  entries: DocumentNoteEntry[],
  registry: ReadonlyMap<string, StickyNoteTagDefinition>,
): DocumentNoteView[] {
  return entries.map(({ id, note }) => ({
    id,
    displayTitle: deriveNoteDisplayTitle(note),
    bodyHtml: renderNoteMarkdownPreview(note.text),
    updatedAt: note.updatedAt,
    displayColorKey: getNoteDisplayColorKey(note.color),
    rawColor: note.color,
    rawTitle: note.title,
    rawText: note.text,
    tagIds: note.tags ? [...note.tags] : [],
    displayTags: resolveNoteTagLabels(note.tags, registry),
  }))
}

export async function loadDocumentNotesForFile(
  bridge: NoteAnchorProjectBridge,
  activeFilePath: string,
): Promise<DocumentNotesViewState> {
  const resolved = await bridge.resolveForFile(activeFilePath)
  if (!resolved.ok || resolved.project === null) {
    return { kind: 'unavailable' }
  }

  const relativeFile = toProjectRelativeFilePath(
    resolved.project.projectRoot,
    activeFilePath,
  )
  if (relativeFile === null) {
    return { kind: 'unavailable' }
  }

  const notes = await bridge.readNotes(activeFilePath)
  if (!notes.ok) {
    return { kind: 'error', message: DOCUMENT_NOTES_READ_ERROR_MESSAGE }
  }

  const tagContext = buildTagContext(notes.store)
  const registry = buildTagRegistry(notes.store.stickyNoteTags)
  const openNotes = listOpenNotesForFile(notes.store, relativeFile)
  const resolvedNotes = listResolvedNotesForFile(notes.store, relativeFile)
  if (openNotes.length === 0 && resolvedNotes.length === 0) {
    return { kind: 'empty', tagContext }
  }

  return {
    kind: 'ready',
    notes: mapNoteEntriesToViews(openNotes, registry),
    resolvedNotes: mapNoteEntriesToViews(resolvedNotes, registry),
    tagContext,
  }
}

type UseDocumentNotesOptions = {
  getActiveFilePath: () => string | null
  isInternalDoc: () => boolean
}

export function useDocumentNotes({
  getActiveFilePath,
  isInternalDoc,
}: UseDocumentNotesOptions) {
  const getActiveFilePathRef = useRef(getActiveFilePath)
  const isInternalDocRef = useRef(isInternalDoc)
  const refreshGenerationRef = useRef(0)
  getActiveFilePathRef.current = getActiveFilePath
  isInternalDocRef.current = isInternalDoc

  const [state, setState] = useState<DocumentNotesViewState>({ kind: 'loading' })

  const refreshDocumentNotes = useCallback(async () => {
    const generation = ++refreshGenerationRef.current

    if (isInternalDocRef.current()) {
      setState({ kind: 'unavailable' })
      return
    }

    const activeFilePath = getActiveFilePathRef.current()
    if (!activeFilePath) {
      setState({ kind: 'unavailable' })
      return
    }

    const bridge = getProjectBridge()
    if (!bridge) {
      setState({ kind: 'unavailable' })
      return
    }

    setState({ kind: 'loading' })
    const next = await loadDocumentNotesForFile(bridge, activeFilePath)
    if (
      generation !== refreshGenerationRef.current ||
      getActiveFilePathRef.current() !== activeFilePath ||
      isInternalDocRef.current()
    ) {
      return
    }
    setState(next)
  }, [])

  const activeFilePath = getActiveFilePath()

  useEffect(() => {
    void refreshDocumentNotes()
  }, [activeFilePath, refreshDocumentNotes])

  return { documentNotesState: state, refreshDocumentNotes }
}
