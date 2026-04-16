import type { DocumentType } from "../../editor-core/io/frontmatterDocumentSettings";
import type { WritingMode } from "../../settings/types";
import {
  formatDocumentTypeLabel,
  formatDocumentTypeOverrideHelp,
  formatDocumentTypeSublabel,
} from "../utils/documentTypePresentation";

type DocumentSettingsPanelProps = {
  canEdit: boolean;
  fullPlainEditActive: boolean;
  documentType: DocumentType;
  title: string;
  author: string;
  translator: string;
  hasDocumentBehaviorOverride: boolean;
  writingMode: WritingMode;
  recommendedWritingMode: WritingMode | null;
  writingModeFollowsTypeRecommendation: boolean;
  onChangeSettings: (next: {
    documentType: DocumentType;
    title: string;
    author: string;
    translator: string;
  }) => void;
  onResetWritingModeToRecommendation: () => void;
};

function writingModeLabel(mode: WritingMode | null): string {
  if (mode === "vertical-rl") return "縦書き";
  if (mode === "horizontal-tb") return "横書き";
  return "このタブの設定を使います";
}

export function DocumentSettingsPanel({
  canEdit,
  fullPlainEditActive,
  documentType,
  title,
  author,
  translator,
  hasDocumentBehaviorOverride,
  writingMode,
  recommendedWritingMode,
  writingModeFollowsTypeRecommendation,
  onChangeSettings,
  onResetWritingModeToRecommendation,
}: DocumentSettingsPanelProps) {
  const disableEditing = !canEdit;
  const readOnlyMessage = fullPlainEditActive
    ? "Source Mode 編集中は Document Settings を編集できません。"
    : "この frontmatter は安全に書き換えられないため、Document Settings では read-only です。複雑な frontmatter は Source Mode を使ってください。";
  const writingModeHelp =
    recommendedWritingMode === null
      ? "このタブの設定を使います"
      : writingModeFollowsTypeRecommendation
        ? "Type の推奨に従っています"
        : "Type の推奨をこのタブで上書きしています";

  return (
    <section className="document-settings-panel">
      <div className="document-settings-panel-header">
        <h2 className="document-settings-panel-title">Document Settings</h2>
      </div>

      {disableEditing && (
        <p className="document-settings-panel-readonly">{readOnlyMessage}</p>
      )}

      {hasDocumentBehaviorOverride && (
        <p className="document-settings-panel-warning">
          {formatDocumentTypeOverrideHelp()}
        </p>
      )}

      <div className="document-settings-form">
        <label className="document-settings-field">
          <span className="document-settings-label">Document Type</span>
          <select
            value={documentType ?? ""}
            disabled={disableEditing}
            onChange={(event) =>
              onChangeSettings({
                documentType:
                  event.target.value === ""
                    ? null
                    : (event.target.value as Exclude<DocumentType, null>),
                title,
                author,
                translator,
              })
            }
          >
            <option value="novel">Novel</option>
            <option value="article">Article</option>
            <option value="">未設定</option>
          </select>
          <span className="document-settings-meta">
            {formatDocumentTypeSublabel(documentType)}
          </span>
          <span className="document-settings-type-hint">
            Novel — テキストエディタに近い操作感。Enterで改行
          </span>
          <span className="document-settings-type-hint">
            Article — Markdownエディタの操作感。Enterで段落区切り / Shift+Enterで段落内改行
          </span>
        </label>

        <label className="document-settings-field">
          <span className="document-settings-label">Title</span>
          <input
            type="text"
            value={title}
            disabled={disableEditing}
            onChange={(event) =>
              onChangeSettings({
                documentType,
                title: event.target.value,
                author,
                translator,
              })
            }
          />
        </label>

        <label className="document-settings-field">
          <span className="document-settings-label">Author</span>
          <input
            type="text"
            value={author}
            disabled={disableEditing}
            onChange={(event) =>
              onChangeSettings({
                documentType,
                title,
                author: event.target.value,
                translator,
              })
            }
          />
        </label>

        <label className="document-settings-field">
          <span className="document-settings-label">Translator</span>
          <input
            type="text"
            value={translator}
            disabled={disableEditing}
            onChange={(event) =>
              onChangeSettings({
                documentType,
                title,
                author,
                translator: event.target.value,
              })
            }
          />
        </label>
      </div>

      <div className="document-settings-summary">
        <div className="document-settings-summary-row">
          <span className="document-settings-summary-label">
            Writing Mode Recommendation
          </span>
          <span className="document-settings-summary-value">
            {writingModeLabel(recommendedWritingMode)}
          </span>
          <span className="document-settings-summary-help">{writingModeHelp}</span>
          <span className="document-settings-summary-current">
            現在の Document Type: {formatDocumentTypeLabel(documentType)}
            {" / "}
            現在の表示: {writingModeLabel(writingMode)}
          </span>
          <button
            type="button"
            className="document-settings-reset-button"
            disabled={
              disableEditing ||
              recommendedWritingMode === null ||
              writingModeFollowsTypeRecommendation
            }
            onClick={onResetWritingModeToRecommendation}
          >
            推奨に戻す
          </button>
        </div>
      </div>
    </section>
  );
}
