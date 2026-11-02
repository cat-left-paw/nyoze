/**
 * EDITOR-TAB-HISTORY1: タブごとのUndo / Redoの保持。
 *
 * タブを離れるとき、その時点の`EditorState`（Doc・Selection・history を含む plugin state）を、
 * 「どの入力で直列化すると、タブの`markdownSnapshot`になるか」の記録と一緒に capsule として持つ。
 * タブへ戻るとき、capsule の記録が現在の入力（Markdown・改行の方針・Ruby表示・schema）と一致し、
 * capsule の Doc を直列化した本文が`markdownSnapshot`と一致するときだけ、履歴つきの状態へ戻す。
 * どれかが成り立たなければ、従来の`loadMarkdown`（履歴なし）。
 *
 * タブの`markdownSnapshot`は正本のまま。この module は判定だけを持ち、PM の view・DOM・timer に触れない。
 * 接続は`EditorCore.ts`（保持・復元・破棄の薄いAPI）と`useTabManager.ts`（離れる・戻る・閉じる）。
 */
import type { Schema } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'
import type { LineBreakPolicy, MarkdownDocumentOptions } from '../types'

export type DocumentStateCapsule = {
  /** タブの id。 */
  readonly key: string
  /** 離れたときの PM state（Doc・Selection・storedMarks・plugin state を含む）。 */
  readonly state: EditorState
  /** 離れたときに`peekMarkdown()`が返した文字列（＝タブの`markdownSnapshot`になる値）。 */
  readonly markdown: string
  /** 離れたときの文書の同一性（タブの`filePath`。未保存の文書は`null`）。戻すときに一致を要求する。 */
  readonly filePath: string | null
  /** 直列化の入力。戻すときに同じ値へ戻す。 */
  readonly frontmatterPrefix: string
  readonly lineBreakPolicy: LineBreakPolicy
  readonly documentMarkdownOptions: MarkdownDocumentOptions
  /** parse の入力（全体の設定）。戻すときに一致を要求する。 */
  readonly rubyEnabled: boolean
  /** core と schema の同一性。別の core の capsule は使わない。 */
  readonly schema: Schema
}

export type DocumentStateCaptureRefusal =
  | 'composing'
  | 'surface-payload'
  | 'composition-presented'
  | 'paragraph-plain-active'

/**
 * 離れるときに capsule を作ってよいか。作らない場合は、戻るときに従来の読み込み直し（いまと同じ）。
 * - composing: Host / Local Window / 入力面のいずれかの変換中（document-leave barrier の対象外である Host の変換中を含む）。
 * - surface-payload: 入力面に保持文字・変換中の文字がある（barrier が止めるはずだが、二重に確かめる）。
 * - composition-presented: PIS の preedit の表示（widget decoration）が残っている。
 * - paragraph-plain-active: Paragraph Plain の plugin が入ったまま（確定は済んでいる。保険）。
 */
export function resolveDocumentStateCaptureRefusal(input: {
  readonly composing: boolean
  readonly surfacePayloadBearing: boolean
  readonly compositionPresented: boolean
  readonly paragraphPlainActive: boolean
}): DocumentStateCaptureRefusal | null {
  if (input.composing) return 'composing'
  if (input.surfacePayloadBearing) return 'surface-payload'
  if (input.compositionPresented) return 'composition-presented'
  if (input.paragraphPlainActive) return 'paragraph-plain-active'
  return null
}

export type DocumentStateRestoreRefusal =
  | 'no-capsule'
  | 'schema-mismatch'
  | 'document-mismatch'
  | 'markdown-mismatch'
  | 'line-break-policy-mismatch'
  | 'ruby-mismatch'
  | 'serialization-mismatch'

export type DocumentStateRestoreDecision =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: DocumentStateRestoreRefusal }

/**
 * view に触れる前の検証（R1〜R5）。`serialize`は core と同じ関数で、capsule の Doc を
 * capsule の prefix・方針・options で直列化する。
 */
export function resolveDocumentStateRestore(input: {
  readonly capsule: DocumentStateCapsule | null
  readonly expected: {
    readonly markdown: string
    readonly filePath: string | null
    readonly lineBreakPolicy: LineBreakPolicy
    readonly rubyEnabled: boolean
    readonly schema: Schema
  }
  readonly serialize: (capsule: DocumentStateCapsule) => string
}): DocumentStateRestoreDecision {
  const { capsule, expected } = input
  if (!capsule) return { ok: false, reason: 'no-capsule' }
  if (capsule.schema !== expected.schema) return { ok: false, reason: 'schema-mismatch' }
  if (capsule.filePath !== expected.filePath) return { ok: false, reason: 'document-mismatch' }
  if (capsule.markdown !== expected.markdown) return { ok: false, reason: 'markdown-mismatch' }
  if (capsule.lineBreakPolicy !== expected.lineBreakPolicy) return { ok: false, reason: 'line-break-policy-mismatch' }
  if (capsule.rubyEnabled !== expected.rubyEnabled) return { ok: false, reason: 'ruby-mismatch' }
  if (input.serialize(capsule) !== expected.markdown) return { ok: false, reason: 'serialization-mismatch' }
  return { ok: true }
}

/** capsule の store。タブの id ごとに最大 1 件。戻すときは成功・失敗を問わず消費する。 */
export function createDocumentStateCapsuleStore() {
  const capsules = new Map<string, DocumentStateCapsule>()
  return {
    put(capsule: DocumentStateCapsule): void {
      capsules.set(capsule.key, capsule)
    },
    /** 取り出して削除する。 */
    take(key: string): DocumentStateCapsule | null {
      const capsule = capsules.get(key) ?? null
      capsules.delete(key)
      return capsule
    },
    peek(key: string): DocumentStateCapsule | null {
      return capsules.get(key) ?? null
    },
    discard(key: string): boolean {
      return capsules.delete(key)
    },
    clear(): void {
      capsules.clear()
    },
    keys(): string[] {
      return [...capsules.keys()]
    },
    size(): number {
      return capsules.size
    },
  }
}

export type DocumentStateCapsuleStore = ReturnType<typeof createDocumentStateCapsuleStore>

export type SearchStateLike = {
  readonly query: string
  readonly caseSensitive: boolean
}

export type SearchStateCorrection =
  | { readonly type: 'close' }
  | { readonly type: 'setQuery'; readonly query: string; readonly caseSensitive: boolean }

/**
 * 検索の plugin state は UI の状態（query）を含む。戻した state の検索を、離れる直前の state
 * （＝現在の検索UI）へ合わせる。違うときだけ 1 回の meta transaction（docChanged 0、history 0）。
 */
export function resolveSearchStateCorrection(
  before: SearchStateLike | null,
  restored: SearchStateLike | null,
): SearchStateCorrection | null {
  if (!before || !restored) return null
  if (before.query === restored.query && before.caseSensitive === restored.caseSensitive) return null
  if (!before.query) return restored.query ? { type: 'close' } : null
  return { type: 'setQuery', query: before.query, caseSensitive: before.caseSensitive }
}

/** 試験専用の診断（製品の判断に使わない）。 */
export type DocumentStateDiagnostics = {
  readonly keys: readonly string[]
  readonly lastCapture: { readonly key: string; readonly refusal: DocumentStateCaptureRefusal | null } | null
  readonly lastRestore: {
    readonly key: string
    readonly outcome: 'restored' | 'rejected' | 'post-check-mismatch' | 'blocked'
    readonly reason: DocumentStateRestoreRefusal | string | null
    readonly searchCorrection: SearchStateCorrection['type'] | null
  } | null
}
