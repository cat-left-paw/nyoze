import type { DocumentType } from "../../editor-core/io/frontmatterDocumentSettings";
import type { UiLanguageMode, WritingMode } from "../../settings/types";
import { createUiTextGetter } from "../i18n/uiText";
import {
  formatDocumentTypeLabel,
  formatDocumentTypeOverrideHelp,
  formatDocumentTypeSublabel,
} from "../utils/documentTypePresentation";

type DocumentSettingsPanelProps = {
  canEdit: boolean;
  fullPlainEditActive: boolean;
  uiLanguageMode: UiLanguageMode;
  documentType: DocumentType;
  preserveEmptyParagraphs: boolean;
  preserveEmptyParagraphsAutoDetected: boolean;
  title: string;
  author: string;
  translator: string;
  hasDocumentBehaviorOverride: boolean;
  writingMode: WritingMode;
  recommendedWritingMode: WritingMode | null;
  writingModeFollowsTypeRecommendation: boolean;
  onChangeSettings: (next: {
    documentType: DocumentType;
    preserveEmptyParagraphs: boolean;
    persistPreserveEmptyParagraphs?: boolean;
    title: string;
    author: string;
    translator: string;
  }) => void;
  onResetWritingModeToRecommendation: () => void;
};

function writingModeLabel(
  mode: WritingMode | null,
  uiLanguageMode: UiLanguageMode,
): string {
  const t = createUiTextGetter(uiLanguageMode);
  if (mode === "vertical-rl") return t("documentSettings.writingMode.vertical");
  if (mode === "horizontal-tb") return t("documentSettings.writingMode.horizontal");
  return t("documentSettings.writingMode.useTabSetting");
}

export function DocumentSettingsPanel({
  canEdit,
  fullPlainEditActive,
  uiLanguageMode,
  documentType,
  preserveEmptyParagraphs,
  preserveEmptyParagraphsAutoDetected,
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
  const t = createUiTextGetter(uiLanguageMode);
  const disableEditing = !canEdit;
  const readOnlyMessage = fullPlainEditActive
    ? t("documentSettings.readOnly.sourceMode", "helper")
    : t("documentSettings.readOnly.safePatch", "helper");
  const writingModeHelp =
    recommendedWritingMode === null
      ? t("documentSettings.writingMode.useTabSetting", "helper")
      : writingModeFollowsTypeRecommendation
        ? t("documentSettings.writingMode.following", "helper")
        : t("documentSettings.writingMode.overridden", "helper");

  return (
    <section className="document-settings-panel">
      <div className="document-settings-panel-header">
        <h2 className="document-settings-panel-title">{t("documentSettings.panelTitle")}</h2>
      </div>

      {disableEditing && (
        <p className="document-settings-panel-readonly">{readOnlyMessage}</p>
      )}

      {hasDocumentBehaviorOverride && (
        <p className="document-settings-panel-warning">
          {formatDocumentTypeOverrideHelp(uiLanguageMode)}
        </p>
      )}

      <div className="document-settings-form">
        <label className="document-settings-field">
          <span className="document-settings-label">{t("documentSettings.documentType")}</span>
          <select
            value={documentType ?? ""}
            disabled={disableEditing}
            onChange={(event) =>
              onChangeSettings({
                documentType:
                  event.target.value === ""
                    ? null
                    : (event.target.value as Exclude<DocumentType, null>),
                preserveEmptyParagraphs:
                  event.target.value === "article" && preserveEmptyParagraphs,
                title,
                author,
                translator,
              })
            }
          >
            <option value="novel">{t("documentSettings.option.novel")}</option>
            <option value="article">{t("documentSettings.option.article")}</option>
            <option value="">{t("documentSettings.option.unset")}</option>
          </select>
          <span className="document-settings-meta">
            {formatDocumentTypeSublabel(documentType, uiLanguageMode)}
          </span>
          <span className="document-settings-type-hint">
            {t("documentSettings.typeHint.novel", "helper")}
          </span>
          <span className="document-settings-type-hint">
            {t("documentSettings.typeHint.article", "helper")}
          </span>
        </label>

        {documentType === "article" && (
          <div className="document-settings-field document-settings-checkbox-field">
            <span className="document-settings-label">{t("documentSettings.paragraphSpacing")}</span>
            <label className="document-settings-checkbox-row">
              <input
                type="checkbox"
                checked={preserveEmptyParagraphs}
                disabled={disableEditing}
                onChange={(event) =>
                  onChangeSettings({
                    documentType,
                    preserveEmptyParagraphs: event.target.checked,
                    title,
                    author,
                    translator,
                  })
                }
              />
              <span className="document-settings-checkbox-copy">
                {t("documentSettings.preserveEmptyParagraphs")}
              </span>
            </label>
            <span className="document-settings-meta">
              {t("documentSettings.preserveEmptyParagraphs.meta", "helper")}
            </span>
            <span className="document-settings-type-hint">
              {t("documentSettings.preserveEmptyParagraphs.singleLineBreak", "helper")}
            </span>
            {preserveEmptyParagraphsAutoDetected && (
              <>
                <span className="document-settings-type-hint">
                  {t("documentSettings.preserveEmptyParagraphs.autoDetected", "helper")}
                </span>
                <button
                  type="button"
                  className="document-settings-reset-button"
                  disabled={disableEditing}
                  onClick={() =>
                    onChangeSettings({
                      documentType,
                      preserveEmptyParagraphs: true,
                      persistPreserveEmptyParagraphs: true,
                      title,
                      author,
                      translator,
                    })
                  }
                >
                  {t("documentSettings.preserveEmptyParagraphs.saveAsSetting")}
                </button>
              </>
            )}
          </div>
        )}

        <label className="document-settings-field">
          <span className="document-settings-label">{t("documentSettings.titleField")}</span>
          <input
            type="text"
            value={title}
            disabled={disableEditing}
            onChange={(event) =>
              onChangeSettings({
                documentType,
                preserveEmptyParagraphs,
                title: event.target.value,
                author,
                translator,
              })
            }
          />
        </label>

        <label className="document-settings-field">
          <span className="document-settings-label">{t("documentSettings.authorField")}</span>
          <input
            type="text"
            value={author}
            disabled={disableEditing}
            onChange={(event) =>
              onChangeSettings({
                documentType,
                preserveEmptyParagraphs,
                title,
                author: event.target.value,
                translator,
              })
            }
          />
        </label>

        <label className="document-settings-field">
          <span className="document-settings-label">{t("documentSettings.translatorField")}</span>
          <input
            type="text"
            value={translator}
            disabled={disableEditing}
            onChange={(event) =>
              onChangeSettings({
                documentType,
                preserveEmptyParagraphs,
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
            {t("documentSettings.writingModeRecommendation")}
          </span>
          <span className="document-settings-summary-value">
            {writingModeLabel(recommendedWritingMode, uiLanguageMode)}
          </span>
          <span className="document-settings-summary-help">{writingModeHelp}</span>
          <span className="document-settings-summary-current">
            {t("documentSettings.currentDocumentType")}: {formatDocumentTypeLabel(documentType, uiLanguageMode)}
            {" / "}
            {t("documentSettings.currentDisplay")}: {writingModeLabel(writingMode, uiLanguageMode)}
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
            {t("documentSettings.resetToRecommendation")}
          </button>
        </div>
      </div>
    </section>
  );
}
