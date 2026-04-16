import { useCallback, useRef, useState } from 'react'

/**
 * BETA-SP9: 大文書での全文変換操作に対する guard UX
 *
 * 50,000文字以上の文書で全文 parse / serialize / replace を伴う操作を
 * 実行する前に確認ダイアログを出す。
 */

/** 大文書 guard の文字数閾値。これ以上で全文変換操作前に確認を出す。 */
export const LARGE_DOCUMENT_CHAR_THRESHOLD = 50_000

/** 文字数が guard 閾値を超えているかの純粋判定。 */
export function shouldGuardLargeDocumentTransform(
  characterCount: number,
): boolean {
  return characterCount >= LARGE_DOCUMENT_CHAR_THRESHOLD
}

export type LargeDocumentGuardAction = {
  label: string
  execute: () => void
}

export type LargeDocumentGuard = {
  /** guard 付きで操作を実行する。大文書なら確認待ちにして true を返す。 */
  requestGuardedAction: (
    characterCount: number,
    label: string,
    action: () => void,
  ) => boolean
  pendingAction: LargeDocumentGuardAction | null
  confirmPendingAction: () => void
  cancelPendingAction: () => void
}

export function useLargeDocumentGuard(): LargeDocumentGuard {
  const [pendingAction, setPendingAction] =
    useState<LargeDocumentGuardAction | null>(null)
  // ref で最新の pending を保持（confirm 時に stale closure を防ぐ）
  const pendingRef = useRef<LargeDocumentGuardAction | null>(null)

  const requestGuardedAction = useCallback(
    (characterCount: number, label: string, action: () => void): boolean => {
      if (!shouldGuardLargeDocumentTransform(characterCount)) {
        action()
        return false
      }
      const pending = { label, execute: action }
      pendingRef.current = pending
      setPendingAction(pending)
      return true
    },
    [],
  )

  const confirmPendingAction = useCallback(() => {
    const action = pendingRef.current
    pendingRef.current = null
    setPendingAction(null)
    action?.execute()
  }, [])

  const cancelPendingAction = useCallback(() => {
    pendingRef.current = null
    setPendingAction(null)
  }, [])

  return {
    requestGuardedAction,
    pendingAction,
    confirmPendingAction,
    cancelPendingAction,
  }
}
