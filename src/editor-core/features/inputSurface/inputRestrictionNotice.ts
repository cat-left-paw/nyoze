import type { EditorView } from '@tiptap/pm/view'
import type { CommitTargetRestriction } from './commitTargetRestriction'

/**
 * PIS-INPUT-BLOCK-WARN1: 確定先の位置だけで確定が拒否されると、打つ前に分かった場面（縦中横の中・付箋のマーカーを含む
 * 範囲・段落を置けないblockのatomの直後）を、ユーザーへ知らせるための受け口。
 *
 * 判定は入力面（`commitTargetRestriction.ts`の1つの関数）が持ち、ここは typed に通知を受け渡すだけ。
 * 表示（既存の inline hint）と連打の抑制は受け手（App の hook）が持つ。view ごとに sink は最大 1 件で、
 * timer / queue は持たない（`noteAnchorProtectionNotice.ts`と同じ形）。
 */
export type InputRestrictionNotice = {
  readonly restriction: CommitTargetRestriction
  /** `direct`: 直接入力を止めた。`composition`: 変換の開始で知らせた（変換は止めず、確定した文字は入力欄に残る）。 */
  readonly via: 'direct' | 'composition'
}
export type InputRestrictionNoticeSink = (notice: InputRestrictionNotice) => void

const sinks = new WeakMap<EditorView, InputRestrictionNoticeSink>()

export function registerInputRestrictionNoticeSink(view: EditorView, sink: InputRestrictionNoticeSink | null): void {
  if (sink) sinks.set(view, sink)
  else sinks.delete(view)
}

export function notifyInputRestriction(view: EditorView, notice: InputRestrictionNotice): void {
  sinks.get(view)?.(notice)
}
