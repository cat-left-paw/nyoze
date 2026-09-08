/**
 * 局所 contenteditable IME slot 製品化 P2-G1a/b — Edit menu command の target 分類（pure）。
 *
 * 正本: `docs/local-contenteditable-ime-productization-design-2026-07.md`
 * §11 Product Slice P2-G1a / P2-G1b、`docs/local-ime-slot-pre-p3-shortcut-clipboard-audit-2026-07.md` §5.1。
 *
 * P2-G1b の renderer router（`useEditMenuCommandRouting` / `editMenuCommandDispatch.ts`）が
 * 「Undo / Redo / Select All をどこへ渡すか」を決めるための pure utility。
 * DOM element 自体をここへ持ち込まず、impure 側（`editMenuCommandTarget.ts`）で
 * 抽出できる固定情報だけを入力にする。
 *
 * App の menu listener からは hook 経由で接続する（本モジュールは pure のまま）。
 *
 * 誤分類してはいけない target:
 * - Source Mode の `.cm-content` を generic contenteditable（`native`）にしない。
 * - Paragraph Plain の overlay textarea を generic native textarea にしない。
 * - `.ProseMirror` を generic contenteditable にしない。
 */

import type { PlainModeKind } from './plainModeCommandGate'
import { isNativeTextFormControl } from './nativeTextTarget'

/** command の行き先。 */
export type EditMenuCommandRoute =
  /** Source Mode の CodeMirror。 */
  | 'source-mode'
  /** Paragraph Plain の overlay textarea。 */
  | 'paragraph-plain'
  /** 検索欄・dialog 内 input 等、native の text 編集 target。 */
  | 'native'
  /** 通常 PM（WYSIWYG 編集）。 */
  | 'editor'
  /** built-in read-only internal document。 */
  | 'read-only-editor'
  /** modal / dialog 内の非 text target。どこへも流さない。 */
  | 'blocked-dialog'
  /** 判定できない / 対象なし。 */
  | 'none'

/**
 * focus target が属する編集領域。impure 側が `closest()` で**内側優先**に 1 つだけ解決する。
 *
 * - Local Window: 通常の`.ProseMirror` routeへ委譲
 * - `source-mode`: `.source-mode-host`（`.cm-content` を含む）
 * - `paragraph-plain`: `textarea.tategaki-plain-overlay`
 * - `prosemirror`: `.ProseMirror`（**`contenteditable` の値は問わない**。read-only の
 *   internal document では `contenteditable="false"` になるため、`[contenteditable="true"]`
 *   で絞ると read-only 経路を取りこぼす。read-only 判定は `internalDocActive` が正本）
 * - `none`: 上記いずれにも属さない
 */
export type EditMenuCommandTargetRegion =
  | 'source-mode'
  | 'paragraph-plain'
  | 'prosemirror'
  | 'none'

export type EditMenuCommandTargetInfo = {
  /** 小文字の tag 名。target が element でなければ `null`。 */
  tagName: string | null
  /** `<input>` のときだけ小文字の type。 */
  inputType: string | null
  /** `HTMLElement.isContentEditable`。 */
  isContentEditable: boolean
  /** `closest()` で解決済みの所属領域。 */
  region: EditMenuCommandTargetRegion
  /** `closest('[role="dialog"]')` 等に一致したか。 */
  inDialog: boolean
}

export type EditMenuCommandRoutingInput = {
  target: EditMenuCommandTargetInfo
  /** Source Mode / Paragraph Plain のいずれが動作中か。 */
  plainModeKind: PlainModeKind | null
  /** built-in read-only internal document を表示中か。 */
  internalDocActive: boolean
  hasEditorCore: boolean
  hasFullPlainEditor: boolean
}

/** focus target が「そのまま native の text 編集へ任せてよい」ものか。 */
function isNativeEditTarget(target: EditMenuCommandTargetInfo): boolean {
  // 既知の編集領域の内側は、たとえ contenteditable / textarea でも native ではない。
  if (target.region !== 'none') return false
  if (isNativeTextFormControl(target)) return true
  // 領域外の generic contenteditable（将来の小さな inline editor 等）は native 扱い。
  return target.isContentEditable
}

/**
 * Edit menu command の行き先を決める（pure）。
 *
 * 優先順位:
 * 1. Source Mode の CodeMirror target
 * 2. Paragraph Plain overlay
 * 3. 検索欄・dialog 内 input 等の native text target
 * 4. modal / dialog 内の非 text target は `blocked-dialog`
 * 5. plain mode の mode fallback（focus を失っている場合）
 * 6. read-only internal document の mode fallback
 * 7. 通常 PM
 * 8. 不明 target は `none`
 *
 * nativeをdialog blockより先に見るのは、dialog内の検索 / 入力欄ではnativeのUndo / Select Allが
 * 正しいため。5 は「dialog は開いているが text target ではない」ケースだけを止める。
 *
 * plain mode fallbackを通常PMより先に見るのは、Paragraph Plain / Source Mode中にoverlayのfocusが
 * 外れても、背後の PM をそのまま編集対象にしてはいけないため（既存
 * `resolveSelectAllShortcutRoute` と同じ優先関係）。
 *
 * read-onlyも同じ理由でregionに依存させない。read-onlyのinternal documentは
 * `contenteditable="false"` なので、menu 操作時の `activeElement` が `<body>` 等へ
 * 落ちて `region: 'none'` になり得る。region だけで判定すると read-only 文書が
 * `none` に紛れて、後続スライスで「read-only なのに編集 command が通る / 逆に
 * Select All まで落ちる」を作りやすい。
 */
export function resolveEditMenuCommandRoute(
  input: EditMenuCommandRoutingInput,
): EditMenuCommandRoute {
  const { target } = input

  if (target.region === 'source-mode') {
    return input.hasFullPlainEditor ? 'source-mode' : 'none'
  }
  if (target.region === 'paragraph-plain') {
    return input.hasEditorCore ? 'paragraph-plain' : 'none'
  }

  if (isNativeEditTarget(target)) return 'native'
  if (target.inDialog) return 'blocked-dialog'

  if (input.plainModeKind === 'full-plain') {
    return input.hasFullPlainEditor ? 'source-mode' : 'none'
  }
  if (input.plainModeKind === 'paragraph-plain') {
    return input.hasEditorCore ? 'paragraph-plain' : 'none'
  }

  // read-only internal document は contenteditable=false で focus が body 等へ
  // 落ちるため、region ではなく mode を正本にする。
  if (input.internalDocActive) {
    return input.hasEditorCore ? 'read-only-editor' : 'none'
  }

  if (target.region === 'prosemirror') {
    return input.hasEditorCore ? 'editor' : 'none'
  }

  return 'none'
}

/**
 * その route が「文書を変更し得る command」を受け付けてよいか。
 *
 * `read-only-editor` と `blocked-dialog` / `none` は受け付けない。P2-G1b の router が
 * Undo / Redo を捨てる判断に使う（Select All のような非破壊 command は別扱いにできる）。
 */
export function isMutatingEditMenuRouteAllowed(route: EditMenuCommandRoute): boolean {
  return (
    route === 'source-mode' ||
    route === 'paragraph-plain' ||
    route === 'native' ||
    route === 'editor'
  )
}
