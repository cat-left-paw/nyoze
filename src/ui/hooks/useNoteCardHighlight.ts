import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 右ペイン付箋カードの「一時 reveal」と「選択状態」を分離して管理する小さな hook。
 *
 * - reveal: 本文上の noteAnchor marker click で対応カードを見つけやすくする一時表示。
 *   `focusedNoteEventKey` (単調増加) が変わったときだけ発火し、timer で必ず消える。
 *   同じ note id を連続クリックしても event key が変われば再発火する。
 *   永続的な `focusedNoteId` 値へフォールバックして残り続けないこと。
 * - selected: カード click による選択状態。timer で消えない明示的な選択。
 *
 * active file 変更 / notes reload で存在しない id が selected / reveal に残らないよう、
 * 表示中 note id 群 (`presentNoteIds`) と突き合わせて不整合を消す。
 */

export const NOTE_REVEAL_HIGHLIGHT_MS = 2000

type UseNoteCardHighlightOptions = {
  focusedNoteId: string | null
  focusedNoteEventKey: number
  /** 現在表示中の note id 群。未確定 (loading 等) は null = 不整合チェックを行わない。 */
  presentNoteIds: ReadonlySet<string> | null
}

export function useNoteCardHighlight({
  focusedNoteId,
  focusedNoteEventKey,
  presentNoteIds,
}: UseNoteCardHighlightOptions) {
  const [revealNoteId, setRevealNoteId] = useState<string | null>(null)
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // event key だけを依存にして同じ id の再 click でも発火させるため、id は ref 経由で読む。
  const focusedNoteIdRef = useRef(focusedNoteId)
  focusedNoteIdRef.current = focusedNoteId

  const clearRevealTimer = useCallback(() => {
    if (revealTimerRef.current !== null) {
      clearTimeout(revealTimerRef.current)
      revealTimerRef.current = null
    }
  }, [])

  useEffect(() => clearRevealTimer, [clearRevealTimer])

  // marker click イベント (event key 変化) のときだけ reveal を発火し、timer で消す。
  useEffect(() => {
    if (focusedNoteEventKey <= 0) return
    const id = focusedNoteIdRef.current
    if (!id) return
    clearRevealTimer()
    setRevealNoteId(id)
    revealTimerRef.current = setTimeout(() => {
      setRevealNoteId(null)
      revealTimerRef.current = null
    }, NOTE_REVEAL_HIGHLIGHT_MS)
  }, [clearRevealTimer, focusedNoteEventKey])

  // active file 変更 / notes reload で存在しない id を残さない。
  useEffect(() => {
    if (presentNoteIds === null) return
    if (selectedNoteId !== null && !presentNoteIds.has(selectedNoteId)) {
      setSelectedNoteId(null)
    }
    if (revealNoteId !== null && !presentNoteIds.has(revealNoteId)) {
      clearRevealTimer()
      setRevealNoteId(null)
    }
  }, [clearRevealTimer, presentNoteIds, revealNoteId, selectedNoteId])

  const selectNote = useCallback((id: string) => {
    setSelectedNoteId(id)
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedNoteId(null)
  }, [])

  return { revealNoteId, selectedNoteId, selectNote, clearSelection }
}
