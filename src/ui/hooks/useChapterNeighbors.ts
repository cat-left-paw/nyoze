import { useCallback, useEffect, useRef, useState } from 'react'
import type { BookOutlineItem } from '../../project/bookOutlineTypes'

/**
 * Outline 拡張: 同一 Book 内の前後章ナビゲーション用 state hook。
 *
 * 境界:
 * - renderer は解決済み project root を渡さない。active file path だけを bridge に渡し、
 *   project root 解決・章 scan は main 側で行う（見出し読み取りを伴わない軽量 scan）。
 * - read-only。対象ファイルを書き換えない。
 * - 章移動自体（open）は呼び出し側の既存 openFileInTab flow に委ねる。
 */

export type ChapterNeighborsState =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; previous: BookOutlineItem | null; next: BookOutlineItem | null }

type ProjectBridge = NonNullable<typeof window.nyozeBridge>['project']

function getProjectBridge(): ProjectBridge | null {
  return window.nyozeBridge?.project ?? null
}

export async function loadChapterNeighborsForFile(
  bridge: ProjectBridge,
  activeFilePath: string,
): Promise<ChapterNeighborsState> {
  const result = await bridge.resolveChapterNeighbors(activeFilePath)
  // nav できない状況（未所属 / book なし / エラー）はすべて unavailable に畳む。
  if (!result.ok) return { kind: 'unavailable' }
  if (result.kind !== 'ready') return { kind: 'unavailable' }
  return { kind: 'ready', previous: result.previous, next: result.next }
}

type UseChapterNeighborsOptions = {
  getActiveFilePath: () => string | null
  isInternalDoc: () => boolean
  /** Project Books が更新されたら bump して再取得する（v3 metadata 編集の保存後など）。 */
  refreshNonce?: number
}

export function useChapterNeighbors({
  getActiveFilePath,
  isInternalDoc,
  refreshNonce = 0,
}: UseChapterNeighborsOptions) {
  const getActiveFilePathRef = useRef(getActiveFilePath)
  const isInternalDocRef = useRef(isInternalDoc)
  const generationRef = useRef(0)
  getActiveFilePathRef.current = getActiveFilePath
  isInternalDocRef.current = isInternalDoc

  const [state, setState] = useState<ChapterNeighborsState>({ kind: 'loading' })

  const refreshChapterNeighbors = useCallback(async () => {
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
    const next = await loadChapterNeighborsForFile(bridge, activeFilePath)
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
    void refreshChapterNeighbors()
  }, [activeFilePath, refreshNonce, refreshChapterNeighbors])

  return { chapterNeighborsState: state, refreshChapterNeighbors }
}
