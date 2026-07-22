import type { ReactNode } from "react";
import type { EditorTab } from "../hooks/useAppUiState";
import { normalizeForCompare } from "../hooks/useFileExplorer";
import type { FileExplorerRole } from "../../project/fileExplorerRoles";
import { ProjectRoleIcon } from "./projectRoleIcons";

export type EditorTabStripProps = {
  tabs: EditorTab[];
  /**
   * `filePath -> FileExplorerRole` の display-only map（`.nyoze/books.json` v3 正本）。
   * タブアイコン表示にだけ使い、`EditorTab` の保存状態には持たせない。
   */
  tabRoles?: ReadonlyMap<string, FileExplorerRole>;
  activeTabId?: string;
  onSetActiveTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onAddTab: () => void;
  tabLimitReached: boolean;
  /**
   * タブ列右端（右ペインが開いていればそのすぐ左側）に固定表示する、非装飾系の
   * エディタアクション。`null` / `undefined` のときは actions 領域自体を描画しない
   * （toolbar 非表示時など）。
   */
  editorTabActionsSlot?: ReactNode;
};

/** 中央エディタ上部のタブ列（開いているタブ一覧 + タブ追加 + 右端の editor tab actions）。 */
export function EditorTabStrip({
  tabs,
  tabRoles,
  activeTabId,
  onSetActiveTab,
  onCloseTab,
  onAddTab,
  tabLimitReached,
  editorTabActionsSlot,
}: EditorTabStripProps) {
  return (
    <div className="editor-tab-strip">
      <div className="editor-tab-list">
        {tabs.map((tab) => {
          const tabRole = tab.filePath
            ? tabRoles?.get(normalizeForCompare(tab.filePath))
            : undefined;
          return (
            <button
              key={tab.id}
              className={`editor-tab${tab.id === activeTabId ? " active" : ""}`}
              onClick={() => onSetActiveTab(tab.id)}
              type="button"
            >
              {tabRole && (
                <span
                  className="editor-tab-role-icon"
                  data-project-role={tabRole}
                  aria-hidden="true"
                >
                  <ProjectRoleIcon role={tabRole} size="xs" />
                </span>
              )}
              <span className="editor-tab-title">{tab.title}</span>
              {tab.dirty && <span className="editor-tab-dirty">●</span>}
              {tabs.length > 1 && (
                <span
                  className="editor-tab-close"
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                  title="タブを閉じる"
                >
                  ×
                </span>
              )}
            </button>
          );
        })}
        <button
          className="editor-tab-add"
          type="button"
          onClick={onAddTab}
          disabled={tabLimitReached}
          title={tabLimitReached ? "タブ数の上限に達しています" : "新しいタブ"}
        >
          +
        </button>
      </div>
      {editorTabActionsSlot && (
        <div className="editor-tab-actions toolbar-btn-scope">{editorTabActionsSlot}</div>
      )}
    </div>
  );
}
