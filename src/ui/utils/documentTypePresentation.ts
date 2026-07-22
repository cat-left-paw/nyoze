import type { DocumentType } from "../../editor-core/io/frontmatterDocumentSettings";
import type { UiLanguageMode } from "../../settings/types";
import { createUiTextGetter } from "../i18n/uiText";

type DocumentTypeNoticeOptions = {
  changed: boolean;
  dirty: boolean;
};

function formatDocumentTypeLabelFallback(type: DocumentType): string {
  if (type === "novel") return "Fiction";
  if (type === "article") return "Article / Document";
  return "未設定";
}

export function formatDocumentTypeLabel(
  type: DocumentType,
  mode?: UiLanguageMode,
): string {
  if (!mode) return formatDocumentTypeLabelFallback(type);
  const t = createUiTextGetter(mode);
  if (type === "novel") return t("documentType.label.novel");
  if (type === "article") return t("documentType.label.article");
  return t("documentType.label.unset");
}

function formatDocumentTypeSublabelFallback(type: DocumentType): string {
  // Document Type は文書の性格・改行スタイルを表す（表示方向ではない）。
  if (type === "novel") return "小説・本文向けの文書スタイル";
  if (type === "article") return "記事・文書向けの文書スタイル";
  return "標準の執筆設定を使います";
}

export function formatDocumentTypeSublabel(
  type: DocumentType,
  mode?: UiLanguageMode,
): string {
  if (!mode) return formatDocumentTypeSublabelFallback(type);
  const t = createUiTextGetter(mode);
  if (type === "novel") return t("documentType.sublabel.novel", "helper");
  if (type === "article") return t("documentType.sublabel.article", "helper");
  return t("documentType.sublabel.unset", "helper");
}

/** Document Settings の文書タイプ help icon tooltip 用。 */
function formatTypeHintForTooltip(line: string): string {
  const separator = " — ";
  const index = line.indexOf(separator);
  if (index === -1) return line;
  return `${line.slice(0, index + separator.length - 1)}\n${line.slice(index + separator.length)}`;
}

export function formatDocumentTypeHelpTooltip(mode: UiLanguageMode): string {
  const t = createUiTextGetter(mode);
  return [
    t("documentSettings.documentType", "helper"),
    formatTypeHintForTooltip(t("documentSettings.typeHint.novel")),
    formatTypeHintForTooltip(t("documentSettings.typeHint.article")),
  ].join("\n\n");
}

function formatDocumentTypeOverrideHelpFallback(): string {
  return "この文書は文書内の互換設定により、Document Type とは別の改行解釈が固定されています。必要なら Source Mode で互換設定を編集または削除してください。";
}

export function formatDocumentTypeOverrideHelp(mode?: UiLanguageMode): string {
  if (!mode) return formatDocumentTypeOverrideHelpFallback();
  return createUiTextGetter(mode)("documentType.overrideHelp", "helper");
}

export function formatDocumentTypeHeaderTooltip(
  _type: DocumentType,
  _hasOverride: boolean,
  mode?: UiLanguageMode,
): string {
  if (!mode) return "Open Document Metadata";
  return createUiTextGetter(mode)("documentSettings.openPanel");
}

export function formatDocumentTypeConfirmTitle(type: DocumentType): string {
  if (type === "article") return "記事・文書 に変更しますか？";
  if (type === "novel") return "小説・本文 に変更しますか？";
  return "未設定に変更しますか？";
}

export function formatDocumentTypeConfirmNote(type: DocumentType): string {
  if (type === "article") {
    return "記事・文書 に変更すると、段落の扱いが変わり、『空行区切り』で、一つの段落になります。Paragraph Plain の編集範囲と保存後の見た目が変わる可能性があります。変換は Undo で元に戻せます。";
  }
  if (type === null) {
    return "未設定に変更すると、このタブの既定により段落のまとまり方が変わる場合があります。Paragraph Plain の編集範囲と保存後の見た目が変わる可能性があります。変換は Undo で元に戻せます。";
  }
  return "この変更により、段落のまとまり方が変わる場合があります。Paragraph Plain の編集範囲と保存後の見た目が変わる可能性があります。変換は Undo で元に戻せます。";
}

export function formatDocumentTypeNoticeMessage(
  type: DocumentType,
  options: DocumentTypeNoticeOptions,
): string {
  const subject =
    type === "article"
      ? "記事・文書 向けの改行解釈"
      : type === "novel"
        ? "小説・本文 向けの改行解釈"
        : "未設定文書の現在タブ既定の改行解釈";
  if (options.changed) {
    return `${subject}を適用しました。段落のまとまり方や Paragraph Plain の編集範囲が変わる場合があります。`;
  }
  if (options.dirty) {
    return `${subject}を確認しました。未保存の変更があります。`;
  }
  return `${subject}を確認しました。`;
}
