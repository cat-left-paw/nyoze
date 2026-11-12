/**
 * EDITOR-PARAGRAPH-REPARSE1: 明示のコマンド「この段落の記法を反映」（案 2）と、読み直してよい場面の判定の port。
 *
 * コマンドは、選択の from と to が同じ対象の textblock（paragraph / heading）の中にあるとき、その textblock に、
 * 段落を離れたときと同じ読み直し（`buildParagraphReparseTransaction`）を行う。caret は残った文字の対応で置く。
 */
import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import type { LineBreakPolicy } from '../../types'
import type { ParagraphReparseContext } from './reparseCandidate'
import { resolveReparseCommandBlock } from './reparsePlugin'
import { buildParagraphReparseTransaction } from './reparseTransaction'

export type ParagraphReparseCommandResult = 'applied' | 'nothing' | 'unavailable'

export type ParagraphReparsePort = {
  getContext(): ParagraphReparseContext
  canReparseNow(): boolean
  /** 文書全体の保存の文字列（保存と同じ書き出し）。置き換えの前後で同じでなければ置き換えない。 */
  serializeDocument(doc: PMNode): string
}

export type ParagraphReparsePortInput = {
  getLineBreakPolicy(): LineBreakPolicy
  getEnableRuby(): boolean
  getPreserveEmptyParagraphs(): boolean
  /** Host の変換中・PIS の入力面の変換中・Local Window の active（アプリ command の composition 判定と同じ）。 */
  isCompositionActive(): boolean
  isParagraphPlainActive(): boolean
  isSourceModeActive(): boolean
  isEditable(): boolean
  /** PIS の入力面に、確定できなかった文字・変換の確定待ちが残っている（入力面の通知の同期の事実）。 */
  hasPendingInputSurfaceText(): boolean
  /** 保存と同じ書き出し（診断の数を増やさない呼び出し）。最後の安全網に使う。 */
  serializeDocument(doc: PMNode): string
}

/**
 * 読み直してよい場面の port を作る。各機能の状態の名前・要素の種類から推測せず、渡された判定だけを束ねる。
 * 設定（改行のモード・ルビ表示・空段落の保持）は、いまの文書の読み込みと同じものを毎回読む。
 */
export function createParagraphReparsePort(input: ParagraphReparsePortInput): ParagraphReparsePort {
  return {
    serializeDocument: (doc) => input.serializeDocument(doc),
    getContext: () => ({
      lineBreakPolicy: input.getLineBreakPolicy(),
      enableRuby: input.getEnableRuby(),
      preserveEmptyParagraphs: input.getPreserveEmptyParagraphs(),
    }),
    canReparseNow: () =>
      input.isEditable() &&
      !input.isCompositionActive() &&
      !input.isParagraphPlainActive() &&
      !input.isSourceModeActive() &&
      !input.hasPendingInputSurfaceText(),
  }
}

/** メニューの有効・無効に使う、構造だけの判定（読み直しの結果は見ない）。 */
export function canReparseParagraphAtSelection(state: EditorState): boolean {
  return resolveReparseCommandBlock(state) !== null
}

export function runParagraphReparseCommand(view: EditorView, port: ParagraphReparsePort): ParagraphReparseCommandResult {
  if (!port.canReparseNow()) return 'unavailable'
  const target = resolveReparseCommandBlock(view.state)
  if (!target) return 'unavailable'
  const tr = buildParagraphReparseTransaction(view.state, target.pos, port.getContext(), {
    source: 'command',
    mapSelection: true,
    serializeDocument: port.serializeDocument,
  })
  if (!tr) return 'nothing'
  view.dispatch(tr)
  return 'applied'
}
