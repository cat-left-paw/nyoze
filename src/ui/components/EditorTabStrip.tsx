import type { ReactNode } from "react";
import type { EditorTab } from "../hooks/useAppUiState";
import { normalizeForCompare } from "../hooks/useFileExplorer";
import type { FileExplorerRole } from "../../project/fileExplorerRoles";
import { ProjectRoleIcon } from "./projectRoleIcons";
import { useLocalImeDraftDirtyTabId } from "../hooks/useLocalImeDraftDirty";
import { resolveLocalImeEffectiveTabDirty } from "../../editor-core/features/localImeDraftDirtyState";
import { useEditorTabDrag } from "../hooks/useEditorTabDrag";
import { resolveDropEdge, type TabReorderRequest } from "../utils/tabReorder";

export type EditorTabStripProps = {
  paragraphPlainDraftDirtyTabId?: string | null;
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
  /** tab の drag による並べ替え（共通の tab setter を通す。EDITOR-TAB-REORDER1）。 */
  onReorderTab: (request: TabReorderRequest) => void;
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
  paragraphPlainDraftDirtyTabId,
  tabs,
  tabRoles,
  activeTabId,
  onSetActiveTab,
  onCloseTab,
  onAddTab,
  onReorderTab,
  tabLimitReached,
  editorTabActionsSlot,
}: EditorTabStripProps) {
  /**
   * OVERLAY-DIRTY1: 未commit paragraph overlay draft の contribution。
   * `tab.dirty`（canonical host dirty）は書き換えず、表示時に OR するだけ。
   */
  const draftDirtyTabId = useLocalImeDraftDirtyTabId(activeTabId);
  const drag = useEditorTabDrag(onReorderTab);
  return (
    <div className="editor-tab-strip">
      <div className="editor-tab-list" ref={drag.listRef}>
        {tabs.map((tab, index) => {
          const tabRole = tab.filePath
            ? tabRoles?.get(normalizeForCompare(tab.filePath))
            : undefined;
          const effectiveDirty = resolveLocalImeEffectiveTabDirty({
            canonicalHostDirty: tab.dirty || tab.id === paragraphPlainDraftDirtyTabId,
            tabId: tab.id,
            draftDirtyTabId,
          });
          return (
            <button
              key={tab.id}
              className={`editor-tab${tab.id === activeTabId ? " active" : ""}`}
              data-tab-id={tab.id}
              data-dragging={drag.view.draggingTabId === tab.id ? "true" : undefined}
              data-drop-edge={resolveDropEdge(index, tabs.length, drag.view.target) ?? undefined}
              onPointerDown={(e) => drag.onTabPointerDown(e, tab.id)}
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
              {effectiveDirty && <span className="editor-tab-dirty">●</span>}
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
