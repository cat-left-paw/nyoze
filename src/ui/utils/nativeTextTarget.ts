/**
 * native な text 編集 target の共通判定。
 *
 * `selectAllShortcutRouting.ts`（既存 `Cmd/Ctrl+A` routing）と
 * `editMenuCommandRouting.ts`（P2-G1a の Edit menu target classifier）が
 * 同じ input type 集合を使うための最小 shared helper。
 *
 * ここでは `contenteditable` を扱わない。`contenteditable` は呼び出し側で意味が
 * 異なるため（Select All は generic contenteditable も native 扱いにする一方、
 * Edit menu classifier は `.ProseMirror` / CodeMirror / 局所 IME slot を
 * generic contenteditable へ落としてはいけない）、各 caller が明示的に足す。
 */

/** `<input type>` のうち、native の text 編集意味論を持つもの。 */
export const NATIVE_TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  'text',
  'search',
  'email',
  'password',
  'tel',
  'url',
  'number',
])

export type NativeTextFormControlInfo = {
  /** 小文字の tag 名。 */
  tagName: string | null
  /** `<input>` のときだけ小文字の type。それ以外は `null`。 */
  inputType: string | null
}

/**
 * `<textarea>` か、text 系 `<input>` か。
 *
 * `type` 未指定（`null`）の `<input>` は HTML 既定が `text` なので native 扱いにする。
 */
export function isNativeTextFormControl(info: NativeTextFormControlInfo): boolean {
  if (info.tagName === 'textarea') return true
  if (info.tagName !== 'input') return false
  return info.inputType === null || NATIVE_TEXT_INPUT_TYPES.has(info.inputType)
}
