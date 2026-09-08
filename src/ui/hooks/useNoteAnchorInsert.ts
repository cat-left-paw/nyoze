import { useCallback, useRef, useState } from 'react'
import type { EditorCoreHandle, SelectionRange } from '../../editor-core/types'
import type { PlainModeKind } from '../utils/plainModeCommandGate'
import {
  commitNoteAnchorInsert,
  prepareNoteAnchorInsert,
} from './noteAnchorInsertController'
import type { NoteAnchorInsertDeps } from './noteAnchorInsertController'

/**
 * 付箋追加 (Task 3A-3) の UI 状態 hook。
 * flow 本体は noteAnchorInsertController.ts (DI / unit テスト対象) に分離し、
 * ここでは modal 状態と EditorCore / bridge の接続だけを持つ。
 */

export type NoteAnchorModalState =
  | { kind: 'first-notice' }
  | { kind: 'input' }
  | { kind: 'notice'; message: string }

type UseNoteAnchorInsertOptions = {
  coreRef: { current: EditorCoreHandle | null }
  getActiveFilePath: () => string | null
  isInternalDoc: () => boolean
  getPlainModeKind: () => PlainModeKind | null
  noticeConfirmed: boolean
  onNoticeConfirmedChange: (value: boolean) => void
  /**
   * notes.json write + anchor 挿入成功後に呼ぶ (hover preview 再反映用)。
   * STICKY-NOTE-DISCARD-CONSISTENCY1: anchor はまだ durable save されていないので、
   * 呼び出し側は identity を受け取って provisional として追跡する。
   */
  onInsertSuccess?: (inserted: {
    id: string
    projectRoot: string
    relativeFile: string
    fingerprint: string
  }) => void
}

type PendingInsert = {
  activeFilePath: string
  range: SelectionRange
}

export function useNoteAnchorInsert({
  coreRef,
  getActiveFilePath,
  isInternalDoc,
  getPlainModeKind,
  noticeConfirmed,
  onNoticeConfirmedChange,
  onInsertSuccess,
}: UseNoteAnchorInsertOptions) {
  const [modal, setModal] = useState<NoteAnchorModalState | null>(null)
  const [titleValue, setTitleValue] = useState('')
  const [bodyValue, setBodyValue] = useState('')
  const pendingRef = useRef<PendingInsert | null>(null)
  const busyRef = useRef(false)

  const buildDeps = useCallback(
    (): NoteAnchorInsertDeps => ({
      getActiveFilePath,
      isInternalDoc,
      getPlainModeKind,
      getBridge: () => window.nyozeBridge?.project ?? null,
      insertAnchor: (id, range) => coreRef.current?.insertNoteAnchor(id, range) ?? false,
    }),
    [coreRef, getActiveFilePath, getPlainModeKind, isInternalDoc],
  )

  const openNoteAnchorPrompt = useCallback((rangeOverride?: SelectionRange): Promise<void> => {
    if (busyRef.current) return Promise.resolve()
    const core = coreRef.current
    if (!core) return Promise.resolve()
    // modal 操作で selection が動く前にキャレット位置を捕捉する
    const range = rangeOverride ?? core.getSelectionRange()
    busyRef.current = true
    return prepareNoteAnchorInsert(buildDeps())
      .then((result) => {
        if (result.kind === 'blocked') {
          pendingRef.current = null
          setModal({ kind: 'notice', message: result.message })
          return
        }
        pendingRef.current = { activeFilePath: result.activeFilePath, range }
        setTitleValue('')
        setBodyValue('')
        setModal(noticeConfirmed ? { kind: 'input' } : { kind: 'first-notice' })
      })
      .finally(() => {
        busyRef.current = false
      })
  }, [buildDeps, coreRef, noticeConfirmed])

  const handleFirstNoticeConfirm = useCallback(() => {
    onNoticeConfirmedChange(true)
    setModal({ kind: 'input' })
  }, [onNoticeConfirmedChange])

  const handleSubmit = useCallback(() => {
    const pending = pendingRef.current
    if (!pending || busyRef.current) return
    // タイトル・本文ともに空なら submit しない (modal 側でも OK を無効化している)。
    if (titleValue.trim().length === 0 && bodyValue.trim().length === 0) return
    busyRef.current = true
    void commitNoteAnchorInsert(buildDeps(), {
      activeFilePath: pending.activeFilePath,
      title: titleValue,
      text: bodyValue,
      range: pending.range,
    })
      .then((result) => {
        pendingRef.current = null
        if (result.kind === 'failed') {
          setModal({ kind: 'notice', message: result.message })
          return
        }
        setModal(null)
        onInsertSuccess?.({ id: result.id, ...result.provisional })
      })
      .finally(() => {
        busyRef.current = false
      })
  }, [buildDeps, titleValue, bodyValue, onInsertSuccess])

  const handleCancel = useCallback(() => {
    pendingRef.current = null
    setModal(null)
  }, [])

  /**
   * STICKY-NOTE-DISCARD-CONSISTENCY1: 付箋関連の失敗を同じ notice modal で見せる。
   * 破棄 cleanup の fail-closed を、ユーザーが必ず気付ける形で伝えるために使う。
   */
  const showNotice = useCallback((message: string) => {
    pendingRef.current = null
    setModal({ kind: 'notice', message })
  }, [])

  return {
    noteAnchorModal: modal,
    noteAnchorTitleValue: titleValue,
    setNoteAnchorTitleValue: setTitleValue,
    noteAnchorBodyValue: bodyValue,
    setNoteAnchorBodyValue: setBodyValue,
    openNoteAnchorPrompt,
    handleNoteAnchorFirstNoticeConfirm: handleFirstNoticeConfirm,
    handleNoteAnchorSubmit: handleSubmit,
    handleNoteAnchorCancel: handleCancel,
    showNoteAnchorNotice: showNotice,
  }
}
