/**
 * MD-SOURCE-PRESERVE1: 読み込みで作った子に「元の文字列のまとまり」を付け、書き出しへ渡す入口を作る。
 * `EditorCore.ts` は、読み込み（parse → 対応づけ）と書き出し（入口を `serializeMarkdown` へ渡す）をここへ委譲するだけ。
 *
 * 対応は、`schema.nodeFromJSON(content)` が作った子（エディタへ入れる object そのもの）に、作った時点で付ける。
 * 読み込みが終わった後に、エディタの文書の子を順番で記録へ合わせ直すことはしない（plugin が入れ替えた子には対応がつかず、
 * 今の書き方で書かれる）。Undo の後に別の object になった子の対応づけは `resolveChildSlices`（内容の一致を `eq` で
 * 証明できたときだけ）。判定と書き出しの実体は `io/sourcePreservation.ts`（PM の view・DOM・timer に触れない）。
 */
import type { Node as PMNode, Schema } from '@tiptap/pm/model'
import type { LineBreakPolicy, MarkdownDocumentOptions } from '../types'
import { parseMarkdown, type ParseMarkdownOptions } from '../io/parseMarkdown'
import { serializeMarkdown } from '../io/serializeMarkdown'
import {
  createSourceRecorder,
  createSourceRegistry,
  type PendingSourceRecord,
  type SourcePreservationInput,
  type SourcePreservationReport,
} from '../io/sourcePreservation'

/** 試験の起動だけが読む診断（製品の判断に使わない）。 */
export type SourcePreservationDiagnostics = {
  /** 直近の読み込みが記録を作れたか（obsidian-paragraph で、まとまりが行を隙間なく並べていたとき true）。 */
  readonly lastLoadRecorded: boolean
  readonly lastLoadChunks: number
  readonly lastLoadChildren: number
  /** 直近の読み込みで、エディタの文書の子に対応を付けたか（子の数が記録と合わないと false）。 */
  readonly lastAttachOutcome: 'attached' | 'child-count-mismatch' | 'no-record' | 'none'
  /** 書き出し（入口を渡した `serializeMarkdown`）の回数と、直近の結果。 */
  readonly serializeCalls: number
  readonly last: SourcePreservationReport | null
  readonly totals: {
    readonly preserved: number
    readonly fallback: number
    readonly unmapped: number
    readonly boundaryParses: number
    readonly boundaryLines: number
    readonly boundarySkipped: number
  }
}

export function createSourcePreservationController(deps: { readonly isRubyEnabled: () => boolean }) {
  const registry = createSourceRegistry()
  let pending: { readonly json: unknown; readonly record: PendingSourceRecord | null } | null = null
  let lastLoadRecorded = false
  let lastLoadChunks = 0
  let lastLoadChildren = 0
  let lastAttachOutcome: SourcePreservationDiagnostics['lastAttachOutcome'] = 'none'
  let serializeCalls = 0
  let last: SourcePreservationReport | null = null
  let collectRunDetails = false
  let disableBoundarySkip = false
  const totals = { preserved: 0, fallback: 0, unmapped: 0, boundaryParses: 0, boundaryLines: 0, boundarySkipped: 0 }

  const input: SourcePreservationInput = {
    registry,
    get enableRuby(): boolean {
      return deps.isRubyEnabled()
    },
    get collectRunDetails(): boolean {
      return collectRunDetails
    },
    get disableBoundarySkip(): boolean {
      return disableBoundarySkip
    },
    report(report: SourcePreservationReport): void {
      serializeCalls += 1
      last = report
      totals[report.outcome] += 1
      totals.boundaryParses += report.boundaryParses
      totals.boundaryLines += report.boundaryLines
      totals.boundarySkipped += report.boundarySkipped
    },
  }

  return {
    /**
     * Markdown を読んで、エディタへ入れる JSON を返す。記録は直後の `attachToLoadedDoc` が同じ JSON を受け取ったときだけ使う
     * （`reset()` のように別の内容を入れる呼び出しに、前の記録を付けない）。
     */
    parseToJson(
      schema: Schema,
      markdownBody: string,
      lineBreakPolicy: LineBreakPolicy,
      options: ParseMarkdownOptions,
    ): unknown {
      const recorder = lineBreakPolicy === 'obsidian-paragraph' ? createSourceRecorder() : null
      const doc = parseMarkdown(schema, markdownBody, lineBreakPolicy, recorder ? { ...options, sourceRecorder: recorder } : options)
      const json = doc.toJSON()
      const record = recorder
        ? recorder.finish({
            enableRuby: options.enableRuby !== false,
            preserveEmptyParagraphs: options.preserveEmptyParagraphs === true,
          })
        : null
      pending = { json, record }
      lastLoadRecorded = record !== null
      lastLoadChunks = record?.chunks.length ?? 0
      lastLoadChildren = record?.childCount ?? 0
      return json
    },

    /** `setEditorContent` が `nodeFromJSON` で作った文書の子に、作った時点で対応を付ける。 */
    attachToLoadedDoc(content: unknown, nextDoc: PMNode): void {
      const current = pending
      pending = null
      if (!current || current.json !== content || !current.record) {
        lastAttachOutcome = 'no-record'
        return
      }
      const children: PMNode[] = []
      nextDoc.forEach((child) => {
        children.push(child)
      })
      lastAttachOutcome = registry.attach(current.record, children) ? 'attached' : 'child-count-mismatch'
    },

    /** `serializeMarkdown` へ渡す入口（試験の harness が使う）。 */
    serializeInput(): SourcePreservationInput {
      return input
    },

    /**
     * 保存・未保存の判定・capsule の照合・Source Mode など、本文の書き出しの共通の入口（`peekMarkdown` と capsule の `serialize`
     * port が使う）。元の文字列を使えるときだけ使い、迷う場合は `serializeMarkdown` が今どおり書く。
     */
    serialize(doc: PMNode, lineBreakPolicy: LineBreakPolicy, options?: MarkdownDocumentOptions): string {
      return serializeMarkdown(doc, lineBreakPolicy, options, input)
    },

    /**
     * `serialize` と同じ書き出しで、診断（`serializeCalls`・`last`・`totals`）を数えない。保存や未保存の判定ではなく、
     * 「ある変更の前後で、保存される文字列が同じか」を確かめる呼び出し（段落の読み直しの安全網）が使う。
     */
    serializeQuietly(doc: PMNode, lineBreakPolicy: LineBreakPolicy, options?: MarkdownDocumentOptions): string {
      const quiet: SourcePreservationInput = Object.create(input, { report: { value: () => undefined } })
      return serializeMarkdown(doc, lineBreakPolicy, options, quiet)
    },

    /** 試験専用: 書き出しの診断に、元の文字列で書いた連続の範囲と文字列を含める。 */
    collectRunDetailsForE2e(enabled: boolean): void {
      collectRunDetails = enabled
    },

    /** 試験専用: 独立に読まれる行だけの境目の読み直しの省略を止める。 */
    disableBoundarySkipForE2e(disabled: boolean): void {
      disableBoundarySkip = disabled
    },

    diagnosticsForE2e(): SourcePreservationDiagnostics {
      return {
        lastLoadRecorded,
        lastLoadChunks,
        lastLoadChildren,
        lastAttachOutcome,
        serializeCalls,
        last,
        totals: { ...totals },
      }
    },
  }
}

export type SourcePreservationController = ReturnType<typeof createSourcePreservationController>
