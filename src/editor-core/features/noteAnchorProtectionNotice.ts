import type { EditorView } from '@tiptap/pm/view'

/**
 * STICKY-NOTE-LIFECYCLE1: 付箋のマーカーを含む範囲の削除・切り取りを拒否したとき、
 * 理由をユーザーへ知らせるための受け口。
 *
 * 拒否の判定（Host の keydown / cut、PIS の deletionRules）は変えず、拒否した場所から
 * ここへ typed に通知するだけ。表示（既存の inline hint）と連打の抑制は受け手（App）が持つ。
 * view ごとに sink は最大 1 件で、timer / queue は持たない。
 */

export type NoteAnchorProtectionNoticeKind = 'delete-key' | 'cut'
export type NoteAnchorProtectionNoticeSink = (kind: NoteAnchorProtectionNoticeKind) => void

const sinks = new WeakMap<EditorView, NoteAnchorProtectionNoticeSink>()

export function registerNoteAnchorProtectionNoticeSink(
  view: EditorView,
  sink: NoteAnchorProtectionNoticeSink | null,
): void {
  if (sink) sinks.set(view, sink)
  else sinks.delete(view)
}

export function notifyNoteAnchorProtection(view: EditorView, kind: NoteAnchorProtectionNoticeKind): void {
  sinks.get(view)?.(kind)
}

/**
 * STICKY-NOTE-LIFECYCLE1（REVIEWFIX2 R3）: 文字の編集（Paragraph Plain の確定）で anchor が消えた id の通知。
 * 消えた id は、その確定の transaction の前後の anchor の id の差から求める（文書全体の走査を足さない）。
 */
export type NoteAnchorEditDetachListener = (ids: readonly string[]) => void
const detachListeners = new WeakMap<EditorView, NoteAnchorEditDetachListener>()

export function registerNoteAnchorEditDetachListener(view: EditorView, listener: NoteAnchorEditDetachListener | null): void {
  if (listener) detachListeners.set(view, listener)
  else detachListeners.delete(view)
}

export function notifyNoteAnchorsDetachedByEdit(view: EditorView, ids: readonly string[]): void {
  if (ids.length > 0) detachListeners.get(view)?.(ids)
}
