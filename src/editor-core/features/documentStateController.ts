/**
 * EDITOR-TAB-HISTORY1: capsule の保持・復元・破棄の orchestration（`EditorCore.ts` は port を渡して委譲するだけ）。
 *
 * 判定は `documentStateCapsule.ts`（純関数）。ここは `loadMarkdown` と同じ通知の順で、本文の置き換えだけを
 * transaction ではなく `view.updateState()` で行う。timer / rAF を使わず、Doc・Selection・history に触れない。
 */
import type { Schema } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import type { LineBreakPolicy, MarkdownDocumentOptions } from '../types'
import {
  createDocumentStateCapsuleStore,
  resolveDocumentStateCaptureRefusal,
  resolveDocumentStateRestore,
  resolveSearchStateCorrection,
  type DocumentStateCapsule,
  type DocumentStateDiagnostics,
  type SearchStateLike,
} from './documentStateCapsule'

export type DocumentStateControllerPorts = {
  readonly getState: () => EditorState
  readonly getSchema: () => Schema
  readonly getView: () => EditorView
  /** Host / Local Window / 入力面のいずれかの変換中。 */
  readonly isComposing: () => boolean
  readonly isSurfacePayloadBearing: () => boolean
  readonly isCompositionPresented: () => boolean
  readonly isParagraphPlainActive: () => boolean
  /** `markdownIoController.loadMarkdown` と同じく Paragraph Plain を出る（plugin を外す）。 */
  readonly exitParagraphPlain: () => void
  readonly getFrontmatterPrefix: () => string
  readonly setFrontmatterPrefix: (prefix: string) => void
  readonly getLineBreakPolicy: () => LineBreakPolicy
  readonly getDocumentMarkdownOptions: () => MarkdownDocumentOptions
  readonly setDocumentMarkdownOptions: (options: MarkdownDocumentOptions) => void
  readonly isRubyEnabled: () => boolean
  /** `peekMarkdown()` と同じ関数・同じ入力の直列化。 */
  readonly serialize: (doc: EditorState['doc'], lineBreakPolicy: LineBreakPolicy, options: MarkdownDocumentOptions) => string
  readonly joinWithFrontmatter: (prefix: string, body: string) => string
  readonly peekMarkdown: () => string
  /**
   * 本文を置き換える前の処理。`loadMarkdown` と**同じ関数**（guard: PIS の barrier / Local Window、
   * 入力面の deactivate、hover preview を畳む、Home / End の状態）。false なら何もしない。
   */
  readonly prepareDocumentReplace: () => boolean
  readonly readSearchState: () => SearchStateLike | null
  readonly closeSearch: () => void
  readonly setSearchQuery: (query: string, caseSensitive: boolean) => void
  readonly emitSearchStateChange: () => void
  /** 本文を置き換えた後の処理。`loadMarkdown` と**同じ関数**（改行の方針の同期・検索の計算し直し・入力面の `documentLoaded`）。 */
  readonly finishDocumentReplace: () => void
  /** load の transaction が届けていた表示の通知（Typewriter・現在行の帯・擬似キャレット・付箋 preview・selection listener）。 */
  readonly notifyDisplayAfterReplace: () => void
  readonly pushLog: (event: string, detail: string) => void
}

export function createDocumentStateController(ports: DocumentStateControllerPorts) {
  const capsules = createDocumentStateCapsuleStore()
  let lastCapture: DocumentStateDiagnostics['lastCapture'] = null
  let lastRestore: DocumentStateDiagnostics['lastRestore'] = null
  let restoreFailureForE2e: 'post-check' | null = null
  const serializeCapsule = (capsule: DocumentStateCapsule): string =>
    ports.joinWithFrontmatter(
      capsule.frontmatterPrefix,
      ports.serialize(capsule.state.doc, capsule.lineBreakPolicy, capsule.documentMarkdownOptions),
    )

  return {
    /** タブを離れるとき。`markdown` は同じ時点の `peekMarkdown()` の値、`filePath` は離れるタブの path。 */
    capture(key: string, markdown: string, filePath: string | null): boolean {
      const refusal = resolveDocumentStateCaptureRefusal({
        composing: ports.isComposing(),
        surfacePayloadBearing: ports.isSurfacePayloadBearing(),
        compositionPresented: ports.isCompositionPresented(),
        paragraphPlainActive: ports.isParagraphPlainActive(),
      })
      lastCapture = { key, refusal }
      if (refusal) {
        capsules.discard(key)
        ports.pushLog('documentState', `capture refused key=${key} reason=${refusal}`)
        return false
      }
      capsules.put({
        key,
        state: ports.getState(),
        markdown,
        filePath,
        frontmatterPrefix: ports.getFrontmatterPrefix(),
        lineBreakPolicy: ports.getLineBreakPolicy(),
        documentMarkdownOptions: ports.getDocumentMarkdownOptions(),
        rubyEnabled: ports.isRubyEnabled(),
        schema: ports.getSchema(),
      })
      ports.pushLog('documentState', `captured key=${key}`)
      return true
    },

    /**
     * タブへ戻るとき。capsule は成功・失敗を問わず消費する。false なら呼び出し側が従来の `loadMarkdown` を使う。
     * 順序は `loadMarkdown` と同じ: 置き換え前の処理（guard を含む） → Paragraph Plain を出る → prefix / options →
     * `updateState` → post-check → 検索の補正 → 置き換え後の処理 → 表示の通知。
     */
    restore(key: string, expectedMarkdown: string, filePath: string | null): boolean {
      const capsule = capsules.take(key)
      const decision = resolveDocumentStateRestore({
        capsule,
        expected: { markdown: expectedMarkdown, filePath, lineBreakPolicy: ports.getLineBreakPolicy(), rubyEnabled: ports.isRubyEnabled(), schema: ports.getSchema() },
        serialize: serializeCapsule,
      })
      if (!decision.ok) {
        lastRestore = { key, outcome: 'rejected', reason: decision.reason, searchCorrection: null }
        ports.pushLog('documentState', `restore rejected key=${key} reason=${decision.reason}`)
        return false
      }
      if (!ports.prepareDocumentReplace()) {
        lastRestore = { key, outcome: 'blocked', reason: 'document-replace-guard', searchCorrection: null }
        return false
      }
      ports.exitParagraphPlain()
      const searchBefore = ports.readSearchState()
      ports.setFrontmatterPrefix(capsule!.frontmatterPrefix)
      ports.setDocumentMarkdownOptions(capsule!.documentMarkdownOptions)
      // 両方にある plugin の state は capsule の値、新しい plugin は init、外れた plugin の state は捨てる。
      // plugins 配列は必ず新しくなるので、updateState は全 plugin view を作り直す（clearHistory と同じ lifecycle）。
      const view = ports.getView()
      view.updateState(capsule!.state.reconfigure({ plugins: view.state.plugins }))
      const postCheck = ports.peekMarkdown()
      if (postCheck !== expectedMarkdown || restoreFailureForE2e === 'post-check') {
        restoreFailureForE2e = null
        lastRestore = { key, outcome: 'post-check-mismatch', reason: 'serialization-mismatch', searchCorrection: null }
        ports.pushLog('documentState', `restore post-check mismatch key=${key}`)
        return false
      }
      // 検索の plugin state は UI の状態を含むので、離れる直前の state（現在の検索）へ合わせてから計算し直す。
      const correction = resolveSearchStateCorrection(searchBefore, ports.readSearchState())
      if (correction?.type === 'close') ports.closeSearch()
      else if (correction?.type === 'setQuery') ports.setSearchQuery(correction.query, correction.caseSensitive)
      ports.finishDocumentReplace()
      if (correction) ports.emitSearchStateChange()
      ports.notifyDisplayAfterReplace()
      lastRestore = { key, outcome: 'restored', reason: null, searchCorrection: correction?.type ?? null }
      ports.pushLog('io', `restoreDocumentState key=${key}`)
      return true
    },

    discard(key: string): void {
      if (capsules.discard(key)) ports.pushLog('documentState', `discarded key=${key}`)
    },

    diagnosticsForE2e(): DocumentStateDiagnostics {
      return { keys: capsules.keys(), lastCapture, lastRestore }
    },

    injectRestoreFailureForE2e(kind: 'post-check' | null): void {
      restoreFailureForE2e = kind
    },
  }
}

export type DocumentStateController = ReturnType<typeof createDocumentStateController>
