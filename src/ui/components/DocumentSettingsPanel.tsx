import { IconHelpCircle } from "@tabler/icons-react";
import type { DocumentType } from "../../editor-core/io/frontmatterDocumentSettings";
import type { FileMetadataProjectContext } from "../../project/fileMetadataProjectContext";
import type { UiLanguageMode, WritingMode } from "../../settings/types";
import { createUiTextGetter } from "../i18n/uiText";
import {
  formatDocumentTypeHelpTooltip,
  formatDocumentTypeOverrideHelp,
  formatDocumentTypeSublabel,
} from "../utils/documentTypePresentation";
import { ProjectPaneIconButton } from "./ProjectPaneIconButton";

type DocumentSettingsPanelProps = {
  canEdit: boolean;
  fullPlainEditActive: boolean;
  uiLanguageMode: UiLanguageMode;
  fileMetadataProjectContext: FileMetadataProjectContext;
  onOpenProjectTab: () => void;
  documentType: DocumentType;
  preserveEmptyParagraphs: boolean;
  preserveEmptyParagraphsAutoDetected: boolean;
  title: string;
  author: string;
  translator: string;
  hasDocumentBehaviorOverride: boolean;
  /** 実効表示方向（現在の表示）。 */
  writingMode: WritingMode;
  /** タブが文書タイプ別の既定表示方向に追従しているか。false = 手動切替中。 */
  writingModeFollowsTypeRecommendation: boolean;
  /** 文書 frontmatter の有効な `writingMode` 指定。未設定・無効なら null。 */
  documentWritingMode: WritingMode | null;
  /** frontmatter `writingMode` key は存在するが値が無効（未対応値）な場合 true。 */
  documentWritingModeUnsupported: boolean;
  /** Paragraph Plain 編集中は文書単位 writingMode 操作を無効化する。 */
  paragraphPlainModeActive: boolean;
  onChangeSettings: (next: {
    documentType: DocumentType;
    preserveEmptyParagraphs: boolean;
    persistPreserveEmptyParagraphs?: boolean;
    title: string;
    author: string;
    translator: string;
  }) => void;
  /** タブ単位の手動切替を解除し、frontmatter `writingMode` / 文書タイプ別既定へ戻す。 */
  onClearManualWritingModeOverride: () => void;
  /** 文書 frontmatter の `writingMode` を保存（vertical-rl / horizontal-tb）/ 削除（null）する。 */
  onChangeDocumentWritingMode: (next: WritingMode | null) => void;
  /** active tab が dirty のとき true。保存ボタンの有効化に使う。 */
  isDirty: boolean;
  /** 既存の標準文書保存処理（`saveDocument(false)` 相当）を呼ぶ。 */
  onSaveDocument: () => void | Promise<void>;
};

function writingModeLabel(
  mode: WritingMode,
  uiLanguageMode: UiLanguageMode,
): string {
  const t = createUiTextGetter(uiLanguageMode);
  return mode === "horizontal-tb"
    ? t("documentSettings.writingMode.horizontal")
    : t("documentSettings.writingMode.vertical");
}

function FileMetadataProjectCallout({
  context,
  t,
  onOpenProjectTab,
}: {
  context: FileMetadataProjectContext;
  t: ReturnType<typeof createUiTextGetter>;
  onOpenProjectTab: () => void;
}) {
  if (context.kind === "outside-project") {
    return null;
  }

  const messageKey =
    context.kind === "registered-body" || context.kind === "registered-material"
      ? "documentSettings.projectCallout.registered"
      : context.kind === "unregistered"
        ? "documentSettings.projectCallout.unregistered"
        : "documentSettings.projectCallout.unresolved";
  const buttonKey =
    context.kind === "registered-body" || context.kind === "registered-material"
      ? "documentSettings.projectCallout.editProjectDisplay"
      : "documentSettings.projectCallout.openProjectTab";

  return (
    <div className="document-settings-project-callout">
      <p className="document-settings-project-callout-message">
        {t(messageKey, "helper")}
      </p>
      <div className="document-settings-project-callout-actions">
        <button
          type="button"
          className="document-settings-project-callout-button"
          onClick={onOpenProjectTab}
        >
          {t(buttonKey)}
        </button>
      </div>
    </div>
  );
}

export function DocumentSettingsPanel({
  canEdit,
  fullPlainEditActive,
  uiLanguageMode,
  fileMetadataProjectContext,
  onOpenProjectTab,
  documentType,
  preserveEmptyParagraphs,
  preserveEmptyParagraphsAutoDetected,
  title,
  author,
  translator,
  hasDocumentBehaviorOverride,
  writingMode,
  writingModeFollowsTypeRecommendation,
  documentWritingMode,
  documentWritingModeUnsupported,
  paragraphPlainModeActive,
  onChangeSettings,
  onClearManualWritingModeOverride,
  onChangeDocumentWritingMode,
  isDirty,
  onSaveDocument,
}: DocumentSettingsPanelProps) {
  const t = createUiTextGetter(uiLanguageMode);
  const panelHelperLabel = t("documentSettings.panelHelper", "helper");
  const documentTypeHelperLabel = formatDocumentTypeHelpTooltip(uiLanguageMode);
  const disableEditing = !canEdit;
  const readOnlyMessage = fullPlainEditActive
    ? t("documentSettings.readOnly.sourceMode", "helper")
    : paragraphPlainModeActive
      ? t("documentSettings.readOnly.paragraphPlain", "helper")
    : t("documentSettings.readOnly.safePatch", "helper");
  // 実効表示方向の「適用元」: 手動切替 > 文書の指定 > 文書タイプ別の既定。
  const writingModeSourceLabel = !writingModeFollowsTypeRecommendation
    ? t("documentSettings.writingModeSource.manual")
    : documentWritingMode !== null
      ? t("documentSettings.writingModeSource.document")
      : t("documentSettings.writingModeSource.typeDefault");
  // 文書単位 writingMode の操作可否（unsafe frontmatter / Source Mode / Paragraph Plain で不可）。
  const disableDocumentWritingMode = disableEditing || paragraphPlainModeActive;
  const documentWritingModeSelectValue: "default" | WritingMode =
    documentWritingMode ?? "default";

  return (
    <section className="document-settings-panel">
      <div className="document-settings-panel-header">
        <div className="document-settings-panel-title-row">
          <h2 className="document-settings-panel-title">{t("documentSettings.panelTitle")}</h2>
          <ProjectPaneIconButton
            icon={IconHelpCircle}
            label={panelHelperLabel}
            className="document-settings-help-btn"
          />
        </div>
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
        <div className="document-settings-field">
          <div className="document-settings-field-header">
            <label className="document-settings-label" htmlFor="document-settings-document-type">
              {t("documentSettings.documentType")}
            </label>
            <ProjectPaneIconButton
              icon={IconHelpCircle}
              label={documentTypeHelperLabel}
              className="document-settings-help-btn"
            />
          </div>
          <select
            id="document-settings-document-type"
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
        </div>

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

        <FileMetadataProjectCallout
          context={fileMetadataProjectContext}
          t={t}
          onOpenProjectTab={onOpenProjectTab}
        />

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
            {t("documentSettings.writingModeSection")}
          </span>
          <span className="document-settings-summary-current">
            {t("documentSettings.currentDisplay")}: {writingModeLabel(writingMode, uiLanguageMode)}
          </span>
          <span className="document-settings-summary-current">
            {t("documentSettings.writingModeSource")}: {writingModeSourceLabel}
          </span>
          {documentWritingModeUnsupported && (
            <span className="document-settings-summary-help">
              {t("documentSettings.writingMode.unsupportedIgnored")}
            </span>
          )}
          <button
            type="button"
            className="document-settings-reset-button"
            disabled={writingModeFollowsTypeRecommendation}
            onClick={onClearManualWritingModeOverride}
          >
            {t("documentSettings.clearManualOverride")}
          </button>
        </div>

        <label className="document-settings-field">
          <span className="document-settings-label">
            {t("documentSettings.documentWritingMode.label")}
          </span>
          <select
            value={documentWritingModeSelectValue}
            disabled={disableDocumentWritingMode}
            onChange={(event) =>
              onChangeDocumentWritingMode(
                event.target.value === "default"
                  ? null
                  : (event.target.value as WritingMode),
              )
            }
          >
            <option value="default">
              {t("documentSettings.documentWritingMode.followDefault")}
            </option>
            <option value="vertical-rl">
              {t("documentSettings.documentWritingMode.fixVertical")}
            </option>
            <option value="horizontal-tb">
              {t("documentSettings.documentWritingMode.fixHorizontal")}
            </option>
          </select>
          <span className="document-settings-meta">
            {t("documentSettings.documentWritingMode.help", "helper")}
          </span>
          {documentWritingModeUnsupported && (
            <span className="document-settings-type-hint">
              {t("documentSettings.documentWritingMode.unsupportedHelp", "helper")}
            </span>
          )}
        </label>
      </div>

      <div className="document-settings-save-footer">
        <p className="document-settings-save-helper">
          {t("documentSettings.saveHelper", "helper")}
        </p>
        <button
          type="button"
          className="document-settings-save-button"
          disabled={!isDirty}
          onClick={() => void onSaveDocument()}
        >
          {t("common.save")}
        </button>
      </div>
    </section>
  );
}
