import type { FrontmatterFields } from "../../editor-core/io/frontmatter";
import type { UiLanguageMode, WritingMode } from "../../settings/types";
import { getUiText } from "../i18n/uiText";
import { getPathBaseName } from "./path";

/**
 * 左ペイン下部情報の文書 metadata 表示（read-only）用 pure helper。
 *
 * 不変条件:
 * - frontmatter を新規に parse しない。既に parse 済みの {@link FrontmatterFields} と
 *   tab state だけを使う。何も書き込まない。
 * - `book` / `order` / `role` frontmatter は読まない（Role は manifest 由来）。
 */

/** 区切り（既存 frontmatter 表示の複数氏名表記に合わせる）。 */
const PERSON_SEPARATOR = "、";

/**
 * 主氏名 + 共同氏名（co_authors / co_translators）を結合した表示文字列。
 * 空白のみ / 未指定は除外し、すべて空なら `''`（呼び出し側は行ごと非表示にする）。
 */
export function formatPersonDisplay(
  primary: string | undefined,
  rest: string[] | undefined,
): string {
  const names: string[] = [];
  if (primary && primary.trim().length > 0) names.push(primary.trim());
  if (rest) {
    for (const name of rest) {
      if (name && name.trim().length > 0) names.push(name.trim());
    }
  }
  return names.join(PERSON_SEPARATOR);
}

/**
 * canonical credits 配列を表示文字列へ変換する。
 * 空白のみは除外し、すべて空なら `''`。
 */
export function formatCreditsDisplay(names: readonly string[]): string {
  return names
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .join(PERSON_SEPARATOR);
}

/**
 * 表示タイトル: frontmatter `title` 優先。無ければ保存済みファイルの basename、
 * それも無ければ tab title（untitled 等）。すべて空なら `'—'`。
 */
export function formatDocumentTitleDisplay(
  fields: FrontmatterFields,
  filePath: string | null,
  fallbackTitle: string,
): string {
  const title = fields.title?.trim();
  if (title) return title;
  if (filePath) return getPathBaseName(filePath);
  const fallback = fallbackTitle.trim();
  return fallback.length > 0 ? fallback : "—";
}

/**
 * effective writing mode の表示ラベル。frontmatter raw 値ではなく既存 i18n を使う。
 */
export function formatWritingModeLabel(
  writingMode: WritingMode,
  uiLanguageMode: UiLanguageMode,
): string {
  return getUiText(
    uiLanguageMode,
    writingMode === "horizontal-tb"
      ? "documentSettings.writingMode.horizontal"
      : "documentSettings.writingMode.vertical",
  );
}

type ProjectDisplayMetadataLike = {
  title: string;
  authors: readonly string[];
  translators: readonly string[];
};

type ResolveDisplayedDocumentMetadataParams = {
  fields: FrontmatterFields;
  filePath: string | null;
  fallbackTitle: string;
  inProject: boolean;
  projectDisplayMetadata: ProjectDisplayMetadataLike | null;
};

export function resolveDisplayedDocumentMetadata({
  fields,
  filePath,
  fallbackTitle,
  inProject,
  projectDisplayMetadata,
}: ResolveDisplayedDocumentMetadataParams): {
  titleText: string;
  authorText: string;
  translatorText: string;
} {
  const standaloneTitleText = formatDocumentTitleDisplay(
    fields,
    filePath,
    fallbackTitle,
  );
  const standaloneAuthorText = formatPersonDisplay(
    fields.author,
    fields.co_authors,
  );
  const standaloneTranslatorText = formatPersonDisplay(
    fields.translator,
    fields.co_translators,
  );
  if (!inProject) {
    return {
      titleText: standaloneTitleText,
      authorText: standaloneAuthorText,
      translatorText: standaloneTranslatorText,
    };
  }
  return {
    titleText:
      projectDisplayMetadata?.title ??
      (filePath ? getPathBaseName(filePath) : standaloneTitleText),
    authorText: projectDisplayMetadata
      ? formatCreditsDisplay(projectDisplayMetadata.authors)
      : "",
    translatorText: projectDisplayMetadata
      ? formatCreditsDisplay(projectDisplayMetadata.translators)
      : "",
  };
}
