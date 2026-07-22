import { DEFAULT_NOTE_ANCHOR_NOTICE_CONFIRMED } from './defaults'

/** 付箋 (Task 3A-3): 初回説明の確認済みフラグを安全値へ正規化する。 */
export function normalizeNoteAnchorNoticeConfirmed(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  return DEFAULT_NOTE_ANCHOR_NOTICE_CONFIRMED
}
