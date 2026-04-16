import type { DocumentType } from "../../editor-core/io/frontmatterDocumentSettings";

type DocumentTypeNoticeOptions = {
  changed: boolean;
  dirty: boolean;
};

export function formatDocumentTypeLabel(type: DocumentType): string {
  if (type === "novel") return "Novel";
  if (type === "article") return "Article";
  return "未設定";
}

export function formatDocumentTypeSublabel(type: DocumentType): string {
  if (type === "novel") return "縦書き推奨";
  if (type === "article") return "横書き推奨";
  return "標準の執筆設定を使います";
}

export function formatDocumentTypeOverrideHelp(): string {
  return "この文書は文書内の互換設定により、Document Type とは別の改行解釈が固定されています。必要なら Source Mode で互換設定を編集または削除してください。";
}

export function formatDocumentTypeHeaderTooltip(
  type: DocumentType,
  hasOverride: boolean,
): string {
  if (!hasOverride) {
    return `Document Type: ${formatDocumentTypeLabel(type)}\nクリックで Document Settings を開く`;
  }
  return `Document Type: ${formatDocumentTypeLabel(type)}\n文書内の互換設定により改行解釈が固定されています\nクリックで Document Settings を開く`;
}

export function formatDocumentTypeConfirmTitle(type: DocumentType): string {
  if (type === "article") return "Article に変更しますか？";
  if (type === "novel") return "Novel に変更しますか？";
  return "未設定に変更しますか？";
}

export function formatDocumentTypeConfirmNote(type: DocumentType): string {
  if (type === "article") {
    return "Article に変更すると、段落の扱いが変わり、『空行区切り』で、一つの段落になります。Paragraph Plain の編集範囲と保存後の見た目が変わる可能性があります。変換は Undo で元に戻せます。";
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
      ? "Article 向けの改行解釈"
      : type === "novel"
        ? "Novel 向けの改行解釈"
        : "未設定文書の現在タブ既定の改行解釈";
  if (options.changed) {
    return `${subject}を適用しました。段落のまとまり方や Paragraph Plain の編集範囲が変わる場合があります。`;
  }
  if (options.dirty) {
    return `${subject}を確認しました。未保存の変更があります。`;
  }
  return `${subject}を確認しました。`;
}
