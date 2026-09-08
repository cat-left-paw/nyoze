/**
 * PERF2b-2b0 — Ruby decoration 診断の配線だけを持つ薄い glue。
 *
 * `EditorCore.ts` は controller の compose に留めるため、extension option の
 * 組み立てはここへ寄せる。**ここに Ruby のアルゴリズムは無い**。
 *
 * capture OFF（= active flush record が無い）ときのコスト境界:
 * - plugin apply: `beginRubyDecorationApplyDiagnostics()` が `null` を返すので、
 *   件数集計も `DecorationSet.map()` の wrapper も clock も一切走らない。
 * - DOM sync: `readRubyDecorationDomSyncToken()` が `null` を返すので、
 *   `sync()` 内の counter は 1 つも触らず `report()` にも到達しない。
 *   token 取得は **sync 要求 1 回につき 1 回**で、`node-dom-lookup` などの
 *   個別 event 経路には callback を一切足さない。
 * - `instrumentation` は **配線しない**。test / 診断用の event bus を
 *   production の DOM sync hot path へ常設しないためである。
 */

import type {
  RubyPunctuationDomSyncCounts,
  RubyPunctuationDomSyncDiagnostics,
  RubyPunctuationDomSyncToken,
  RubyPunctuationNowrapApplyDiagnostics,
} from '../extensions/rubyPunctuationNowrapState'

/** 必要な port だけを構造的に受ける（integration handle 全体には依存しない）。 */
export type LocalImeRubyDecorationWiringDeps = {
  beginFlushPerfSpan: (span: 'ruby-punctuation') => (() => void) | null
  beginRubyDecorationApplyDiagnostics: () => RubyPunctuationNowrapApplyDiagnostics | null
  readRubyDecorationDomSyncToken: () => RubyPunctuationDomSyncToken | null
  reportRubyDecorationDomSync: (
    token: RubyPunctuationDomSyncToken,
    counts: RubyPunctuationDomSyncCounts,
  ) => void
}

export type LocalImeRubyPunctuationWiring = {
  beginPerfSpan: () => (() => void) | null
  beginApplyDiagnostics: () => RubyPunctuationNowrapApplyDiagnostics | null
  domSyncDiagnostics: RubyPunctuationDomSyncDiagnostics
}

export function buildLocalImeRubyPunctuationWiring(
  integration: LocalImeRubyDecorationWiringDeps,
): LocalImeRubyPunctuationWiring {
  return {
    beginPerfSpan: () => integration.beginFlushPerfSpan('ruby-punctuation'),
    beginApplyDiagnostics: () => integration.beginRubyDecorationApplyDiagnostics(),
    domSyncDiagnostics: {
      readToken: () => integration.readRubyDecorationDomSyncToken(),
      report: (token, counts) =>
        integration.reportRubyDecorationDomSync(token, counts),
    },
  }
}
