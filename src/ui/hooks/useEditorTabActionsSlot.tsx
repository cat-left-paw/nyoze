import type { ReactNode } from "react";
import type { CommandAvailability } from "../../editor-core/types";
import { EditorTabUtilityActions } from "../components/EditorTabUtilityActions";
import type { useAppUiState } from "./useAppUiState";
import type { useSearchUiState } from "./useSearchUiState";
import type { useLargeDocumentGuard } from "./useLargeDocumentGuard";
import type { BookPageViewerToolbarAvailability } from "./useBookExportMenuAvailability";
import { isLocalImeDocumentActionAllowed } from "../../editor-core/features/localImeDocumentActionBarrier";
import type { LocalImeExperimentalPreviewView } from "./useLocalImeExperimentalPreview";

type UiState = ReturnType<typeof useAppUiState>;
type SearchUiState = ReturnType<typeof useSearchUiState>;
type LargeDocumentGuard = ReturnType<typeof useLargeDocumentGuard>;

export type UseEditorTabActionsSlotOptions = {
  ui: UiState;
  search: SearchUiState;
  largeDocGuard: LargeDocumentGuard;
  localImeExperimentalPreview: LocalImeExperimentalPreviewView;
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
  localImeExperimentalPreview,
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
        // 局所 IME slot session barrier は `setRubyVisible()` より前に置く。
        // ここで UI state を先に反転させると、中断された切替を 1 回の再操作で
        // 実行できなくなる（UI state だけ反転 → 確定後の再クリックで元へ戻り、
        // core と一致して何も起きない）。effect 側の barrier は防御として残す。
        if (!isLocalImeDocumentActionAllowed("ruby-visibility-toggle")) return;
        largeDocGuard.requestGuardedAction(
          activeDocumentCharacterCount,
          "ルビ表示の切替は、大きな文書では数秒かかる場合があります。続行しますか。",
          () => {
            // 大文書確認ダイアログの間に composition が始まることもあるため再確認する。
            if (!isLocalImeDocumentActionAllowed("ruby-visibility-toggle")) return;
            ui.setRubyVisible((v) => !v);
          },
        );
      }}
      paragraphPlainModeActive={ui.paragraphPlainModeActive}
      onToggleParagraphPlainMode={toggleParagraphPlainMode}
      canParagraphPlain={headerCommandAvailability.canParagraphPlain}
      onToggleFullPlainEdit={toggleFullPlainEdit}
      localImeExperimentalPreviewVisible={localImeExperimentalPreview.settingVisible}
      localImeExperimentalPreviewInteractive={localImeExperimentalPreview.settingInteractive}
      localImeExperimentalPreviewToggleOn={localImeExperimentalPreview.toggleOn}
      localImeExperimentalPreviewNeedsAttention={
        localImeExperimentalPreview.productStatus === "attention"
      }
      onLocalImeExperimentalPreviewChange={localImeExperimentalPreview.onChangeEnabled}
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
