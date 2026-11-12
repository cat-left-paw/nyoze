import type { EditorView } from '@tiptap/pm/view'
import type { InlineMarkInputRuleNoticeReason } from './inlineMarkInputRules'

/**
 * EDITOR-INPUT-RULE-INLINE-NODE1: code の入力規則（`` ` ``）が、中身の inline node（ルビ・縦中横・画像・
 * 付箋のマーカーなど）で変換しなかった理由を、ユーザーへ知らせるための受け口。
 *
 * 変換するかどうかの判定は共有の run（`inlineMarkInputRules.ts`）が持ち、ここは typed に通知を
 * 受け渡すだけ。表示（既存の inline hint）と連打の抑制は受け手（App の hook）が持つ。
 * view ごとに sink は最大 1 件で、timer / queue は持たない（付箋の拒否の通知と同じ形）。
 */
export type InlineMarkInputRuleNoticeSink = (reason: InlineMarkInputRuleNoticeReason) => void

const sinks = new WeakMap<EditorView, InlineMarkInputRuleNoticeSink>()

export function registerInlineMarkInputRuleNoticeSink(
  view: EditorView,
  sink: InlineMarkInputRuleNoticeSink | null,
): void {
  if (sink) sinks.set(view, sink)
  else sinks.delete(view)
}

export function notifyInlineMarkInputRule(
  view: EditorView,
  reason: InlineMarkInputRuleNoticeReason,
): void {
  sinks.get(view)?.(reason)
}
