import type { ReactNode } from "react";
import type { CommandAvailability } from "../../editor-core/types";
import { EditorTabUtilityActions } from "../components/EditorTabUtilityActions";
import type { useAppUiState } from "./useAppUiState";
import type { useSearchUiState } from "./useSearchUiState";
import type { useLargeDocumentGuard } from "./useLargeDocumentGuard";
import type { BookPageViewerToolbarAvailability } from "./useBookExportMenuAvailability";

type UiState = ReturnType<typeof useAppUiState>;
type SearchUiState = ReturnType<typeof useSearchUiState>;
type LargeDocumentGuard = ReturnType<typeof useLargeDocumentGuard>;

export type UseEditorTabActionsSlotOptions = {
  ui: UiState;
  search: SearchUiState;
  largeDocGuard: LargeDocumentGuard;
  activeDocumentCharacterCount: number;
  toggleParagraphPlainMode: () => void;
  toggleFullPlainEdit: () => void;
  handleToggleWritingMode: () => void;
  headerCommandAvailability: CommandAvailability;
  openPageViewer: () => Promise<void> | void;
  openBookPageViewer: () => Promise<void> | void;
  bookPageViewerToolbarAvailability: BookPageViewerToolbarAvailability;
};

/**
 * タブ列右端の非装飾系エディタアクション。「ツールバーを隠す」に追従して
 * 表示/非表示を切り替える（トグル時に unmount することで、開いていた
 * Typewriter / Page Viewer の portal menu も一緒に閉じる）。
 */
export function useEditorTabActionsSlot({
  ui,
  search,
  largeDocGuard,
  activeDocumentCharacterCount,
  toggleParagraphPlainMode,
  toggleFullPlainEdit,
  handleToggleWritingMode,
  headerCommandAvailability,
  openPageViewer,
  openBookPageViewer,
  bookPageViewerToolbarAvailability,
}: UseEditorTabActionsSlotOptions): ReactNode {
  if (!ui.toolbarVisible) return null;
  return (
    <EditorTabUtilityActions
      uiLanguageMode={ui.uiLanguageMode}
      writingMode={ui.writingMode}
      onToggleWritingMode={handleToggleWritingMode}
      internalDocActive={Boolean(ui.activeTab.internalDocId)}
      searchOpen={search.state.open}
      onOpenSearch={search.openSearch}
      fullPlainEditActive={ui.fullPlainEditActive}
      rubyVisible={ui.rubyVisible}
      onToggleRubyVisible={() => {
        largeDocGuard.requestGuardedAction(
          activeDocumentCharacterCount,
          "ルビ表示の切替は、大きな文書では数秒かかる場合があります。続行しますか。",
          () => ui.setRubyVisible((v) => !v),
        );
      }}
      paragraphPlainModeActive={ui.paragraphPlainModeActive}
      onToggleParagraphPlainMode={toggleParagraphPlainMode}
      canParagraphPlain={headerCommandAvailability.canParagraphPlain}
      onToggleFullPlainEdit={toggleFullPlainEdit}
      displaySettingsOpen={ui.displaySettingsOpen}
      onOpenDisplaySettings={() => ui.setDisplaySettingsOpen(true)}
      onOpenDisplaySettingsForTypewriter={() =>
        ui.setDisplaySettingsOpen(true, { expandSection: "typewriter" })
      }
      typewriterModeEnabled={ui.typewriterModeEnabled}
      onTypewriterModeEnabledChange={ui.setTypewriterModeEnabled}
      visualFocusBlockHighlightEnabled={ui.visualFocusBlockHighlightEnabled}
      onVisualFocusBlockHighlightEnabledChange={
        ui.setVisualFocusBlockHighlightEnabled
      }
      visualFocusDimNonFocusedBlocksEnabled={
        ui.visualFocusDimNonFocusedBlocksEnabled
      }
      onVisualFocusDimNonFocusedBlocksEnabledChange={
        ui.setVisualFocusDimNonFocusedBlocksEnabled
      }
      visualFocusCurrentLineHighlightEnabled={
        ui.visualFocusCurrentLineHighlightEnabled
      }
      onVisualFocusCurrentLineHighlightEnabledChange={
        ui.setVisualFocusCurrentLineHighlightEnabled
      }
      onOpenPageViewer={() => void openPageViewer()}
      onOpenBookPageViewer={() => void openBookPageViewer()}
      bookPageViewerToolbarAvailability={bookPageViewerToolbarAvailability}
    />
  );
}
