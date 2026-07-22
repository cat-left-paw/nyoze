/**
 * 付箋アンカー (note anchor) helpers.
 *
 * 本文 Markdown 内の `<!-- nyoze-note:ID -->` コメントを付箋の位置アンカーとして扱う。
 * 付箋本文・状態は将来 project root の `.nyoze/notes.json` を source of truth とし、
 * 本文側コメントは位置の source of truth のみを担う (Task 3A-1)。
 */

export const NOTE_ANCHOR_NODE_NAME = 'noteAnchor'

/**
 * 厳密一致パターン:
 *   <!-- nyoze-note:ID -->
 *
 * 許容する揺れは `nyoze-note:` 前後と ID 後の ASCII whitespace のみ。
 * ID は UUID v4 / ULID / 将来の短縮 ID を想定した英数字 + `-` / `_`。
 * 複数 field・JSON 風 payload・未閉鎖 comment・類似名 comment は対象外とし、
 * それらは従来どおり汎用 HTML atom として保持される。
 */
const NOTE_ANCHOR_COMMENT_REGEX = /^<!--[ \t]*nyoze-note:[ \t]*([A-Za-z0-9_-]+)[ \t]*-->$/
const NOTE_ANCHOR_ID_REGEX = /^[A-Za-z0-9_-]+$/

/**
 * 新規付箋アンカー ID を生成する。
 * 初期実装は UUID v4。将来 ULID 等へ差し替える場合もこの helper だけを変更し、
 * 既存 ID は形式変更後も書き換えない。
 */
export function createNoteAnchorId(): string {
  return crypto.randomUUID()
}

/**
 * raw inline HTML が付箋アンカー comment に厳密一致すれば ID を返す。
 * 一致しなければ null (呼び出し側は汎用 html_inline_atom として扱う)。
 */
export function matchNoteAnchorComment(raw: string): string | null {
  const match = NOTE_ANCHOR_COMMENT_REGEX.exec(raw)
  return match ? match[1] : null
}

/** noteAnchor node の ID として受け入れる文字列かどうか。 */
export function isValidNoteAnchorId(id: string): boolean {
  return NOTE_ANCHOR_ID_REGEX.test(id)
}

/** 付箋アンカーの正規 Markdown 形式。serializer は必ずこの形式を出す。 */
export function formatNoteAnchorComment(id: string): string {
  return `<!-- nyoze-note:${id} -->`
}
