/**
 * BETA-SP11: EOL fidelity helper.
 *
 * 読み込んだ文書の改行種別 (LF / CRLF) を検出し、
 * 保存時に元の EOL へ戻すための最小ユーティリティ。
 */

/** 文書の改行種別。 */
export type EolKind = "lf" | "crlf";

/**
 * content 中の最初の改行文字から EOL 種別を判定する。
 * CRLF が 1 つでも見つかれば "crlf" とする。
 * 改行が無い場合は "lf" (既定) を返す。
 */
export function detectEol(content: string): EolKind {
  const idx = content.indexOf("\n");
  if (idx <= 0) return "lf";
  return content[idx - 1] === "\r" ? "crlf" : "lf";
}

/**
 * LF 正規化済みの content を、指定 EOL で書き戻す。
 * eol が "lf" の場合はそのまま返す。
 */
export function applyEol(content: string, eol: EolKind): string {
  if (eol === "lf") return content;
  // TipTap/ProseMirror 経由の content は LF のみのはずだが、
  // 念のため既存 CRLF を二重変換しないよう先に LF 化してから置換する。
  return content.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
}
