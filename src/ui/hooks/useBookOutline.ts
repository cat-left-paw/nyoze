import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  BookOutlineChapter,
  BookDisplayMeta,
} from '../../project/bookFullOutlineQuery'

/**
 * Outline 拡張: Book全体Outline（右ペイン）の state hook。
 *
 * 境界:
 * - renderer は解決済み project root を渡さない。active file path だけを bridge に渡し、
 *   project root の解決・章 scan・各章の見出し抽出は main 側で行う。
 * - read-only。見出しクリックによる別ファイル open / jump は持たない。
 * - mount 中（= Book全体モード表示中）だけ読み込む。Workspace 側で document モードに
 *   切り替えるとこの hook はアンマウントされ、不要なファイル読み取りを行わない。
 */

export type BookOutlineState =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'not-in-project' }
  | { kind: 'no-current-book' }
  | { kind: 'error' }
  | {
      kind: 'ready'
      currentBook: string
      /** Book manifest overlay（read-only）。header 表示名に使う。 */
      book: BookDisplayMeta
      chapters: BookOutlineChapter[]
      currentRelativePath: string
    }

type ProjectBridge = NonNullable<typeof window.nyozeBridge>['project']

function getProjectBridge(): ProjectBridge | null {
  return window.nyozeBridge?.project ?? null
}

export async function loadBookOutlineForFile(
  bridge: ProjectBridge,
  activeFilePath: string,
): Promise<BookOutlineState> {
  const result = await bridge.resolveBookFullOutline(activeFilePath)
  if (!result.ok) {
    if (result.reason === 'invalid-path') return { kind: 'unavailable' }
    return { kind: 'error' }
  }
  if (result.kind === 'not-in-project') return { kind: 'not-in-project' }
  if (result.kind === 'no-current-book') return { kind: 'no-current-book' }
  return {
    kind: 'ready',
    currentBook: result.currentBook,
    book: result.book,
    chapters: result.chapters,
    currentRelativePath: result.currentRelativePath,
  }
}

type UseBookOutlineOptions = {
  getActiveFilePath: () => string | null
  isInternalDoc: () => boolean
  /** Project Books が更新されたら bump して再取得する（v3 metadata 編集の保存後など）。 */
  refreshNonce?: number
}

export function useBookOutline({
  getActiveFilePath,
  isInternalDoc,
  refreshNonce = 0,
}: UseBookOutlineOptions) {
  const getActiveFilePathRef = useRef(getActiveFilePath)
  const isInternalDocRef = useRef(isInternalDoc)
  const generationRef = useRef(0)
  getActiveFilePathRef.current = getActiveFilePath
  isInternalDocRef.current = isInternalDoc

  const [state, setState] = useState<BookOutlineState>({ kind: 'loading' })

  const refreshBookOutline = useCallback(async () => {
    const generation = ++generationRef.current

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
    const next = await loadBookOutlineForFile(bridge, activeFilePath)
    if (
      generation !== generationRef.current ||
      getActiveFilePathRef.current() !== activeFilePath ||
      isInternalDocRef.current()
    ) {
      return
    }
    setState(next)
  }, [])

  const activeFilePath = getActiveFilePath()
  useEffect(() => {
    void refreshBookOutline()
  }, [activeFilePath, refreshNonce, refreshBookOutline])

  return { bookOutlineState: state, refreshBookOutline }
}
