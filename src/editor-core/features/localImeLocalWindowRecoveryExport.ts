/**
 * LOCAL-WINDOW-RECOVERY-RESTART1 — retained draftの**read-only** recovery export と、
 * clipboard writerとの責務境界。
 *
 * 正本: `docs/local-ime-experimental-preview-roadmap-2026-08.md` §3.7。
 *
 * 契約:
 * - SoTはlocal PMの`Doc`だけ。既存canonical `serializeMarkdown()`をそのまま使う。
 * - DOM clone / `textContent`再構築 / Markdown再parse / host本文との自動merge /
 *   attrsの正規化・推測はしない。
 * - この module は controller / runtime state を**一切変更しない**。したがって
 *   copy成功はrecovery解決・discard成功・commit成功・breaker解除のいずれも意味しない。
 * - clipboard APIはcontrollerへ混ぜない。writerは注入依存で、失敗してもdraftと
 *   recovery stateはそのまま残る（この module が何も破棄しないので構造的に保証される）。
 */

import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { serializeMarkdown } from '../io/serializeMarkdown'
import type { LineBreakPolicy, MarkdownDocumentOptions } from '../types'

/** slot seed (`U+2060`) / 旧spikeのZWSP (`U+200B`)。復旧用Markdownへ混入させない。 */
const INVISIBLE_JOINER_PATTERN = /[\u200B\u2060]/g

export function countLocalImeLocalWindowInvisibleJoiners(text: string): number {
  return text.match(INVISIBLE_JOINER_PATTERN)?.length ?? 0
}

export type LocalImeLocalWindowRecoveryExportResult =
  | {
      readonly ok: true
      readonly markdown: string
      readonly blockCount: number
      /** WJ / ZWSPの混入件数。canonical serializerが正しい限り常に0。 */
      readonly invisibleJoinerCount: number
    }
  | {
      readonly ok: false
      readonly reason: 'no-draft' | 'serialize-failed'
    }

/**
 * retained local PM DocをそのままMarkdownへ直列化する。
 *
 * paragraph順序、empty paragraph、bold / italic / strike / highlight / underline /
 * code、link `href` / `title`、Ruby / TCY、split / join後の可変blockはすべて既存
 * serializerの責務であり、ここで前処理・後処理を足さない。
 */
export function buildLocalImeLocalWindowRecoveryMarkdown(input: {
  readonly doc: ProseMirrorNode | null
  readonly lineBreakPolicy?: LineBreakPolicy
  readonly markdownOptions?: MarkdownDocumentOptions
}): LocalImeLocalWindowRecoveryExportResult {
  const doc = input.doc
  if (!doc) return { ok: false, reason: 'no-draft' }
  let markdown: string
  try {
    markdown = serializeMarkdown(doc, input.lineBreakPolicy, input.markdownOptions)
  } catch {
    // 直列化失敗でもdraftは破棄しない。呼び出し側は保持したまま別手段を選べる。
    return { ok: false, reason: 'serialize-failed' }
  }
  return {
    ok: true,
    markdown,
    blockCount: doc.childCount,
    invisibleJoinerCount: countLocalImeLocalWindowInvisibleJoiners(markdown),
  }
}

// --- clipboard boundary ----------------------------------------------------

/**
 * clipboard writerの最小契約。controllerからは呼ばず、runtime portが注入する。
 * 通常のElectron E2Eでは共有OS clipboardを変更しないため、test-only writerを渡す。
 */
export type LocalImeLocalWindowRecoveryClipboardWriter = (
  markdown: string,
) => boolean | Promise<boolean>

export type LocalImeLocalWindowRecoveryCopyResult = {
  readonly ok: boolean
  readonly reason:
    | 'copied'
    | 'no-draft'
    | 'serialize-failed'
    | 'clipboard-unavailable'
    | 'clipboard-write-failed'
  /** 直列化した文字数だけ（本文は返さない）。 */
  readonly markdownLength: number | null
}

/**
 * export → clipboard writeの薄い合成。**draftへは触れない。**
 *
 * write失敗（false / reject / throw）は`clipboard-write-failed`として返すだけで、
 * recovery stateもretained draftも変更しない。
 */
export async function copyLocalImeLocalWindowRecoveryMarkdown(input: {
  readonly exported: LocalImeLocalWindowRecoveryExportResult
  readonly write: LocalImeLocalWindowRecoveryClipboardWriter | null | undefined
}): Promise<LocalImeLocalWindowRecoveryCopyResult> {
  if (!input.exported.ok) {
    return { ok: false, reason: input.exported.reason, markdownLength: null }
  }
  const markdown = input.exported.markdown
  if (typeof input.write !== 'function') {
    return { ok: false, reason: 'clipboard-unavailable', markdownLength: markdown.length }
  }
  let written = false
  try {
    written = (await input.write(markdown)) === true
  } catch {
    written = false
  }
  return {
    ok: written,
    reason: written ? 'copied' : 'clipboard-write-failed',
    markdownLength: markdown.length,
  }
}
