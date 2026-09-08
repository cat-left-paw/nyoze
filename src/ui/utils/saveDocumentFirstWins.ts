import { applyEol } from "../../editor-core/io/eolHelper";
import type { SavedFileStat } from "./externalEditConflict";

export type SaveDocumentEol = "lf" | "crlf";

/**
 * save first-wins が barrier 前に固定する owner tab。continuation は
 * この identity へ exact 1 回戻し、後着 tab 切替や再評価で失わない。
 */
export type SaveDocumentTarget = {
  id: string;
  title: string;
  filePath: string | null;
  savedStat: SavedFileStat;
  eol?: SaveDocumentEol;
};

export type SaveDocumentTabRow = {
  id: string;
  savedStat: SavedFileStat;
  eol?: SaveDocumentEol;
  cleanMarkdownSnapshot?: string;
  internalDocId?: unknown;
};

export function captureSaveDocumentTarget(
  override: SaveDocumentTarget | undefined,
  active: SaveDocumentTarget,
): SaveDocumentTarget {
  return override ?? {
    id: active.id,
    title: active.title,
    filePath: active.filePath,
    savedStat: active.savedStat,
    eol: active.eol,
  };
}

/**
 * leave snapshot が古い savedStat を残していても、最新 tab row を優先する。
 * captured target tab の EOL で期待 disk 本文を一意に構成する材料もここで揃える。
 * composition 中の continuation は continuePending が ready を証明したあと
 * prepared=true で再入し、第二 barrier / 二重 save を作らない。
 */
export function resolveSaveDocumentWriteIdentity(input: {
  capturedTarget: SaveDocumentTarget;
  tabs: readonly SaveDocumentTabRow[];
  activeTab: SaveDocumentTarget;
}): {
  targetTabId: string;
  tabForSave: SaveDocumentTabRow | undefined;
  currentFilePath: string | null;
  currentTabTitle: string;
  currentSavedStat: SavedFileStat;
  lastKnownSavedMarkdown: string | null;
  tabEol: SaveDocumentEol;
} {
  const targetTabId = input.capturedTarget.id ?? input.activeTab.id;
  const tabForSave = input.tabs.find((tab) => tab.id === targetTabId);
  return {
    targetTabId,
    tabForSave,
    currentFilePath: input.capturedTarget.filePath ?? input.activeTab.filePath,
    currentTabTitle: input.capturedTarget.title ?? input.activeTab.title,
    currentSavedStat:
      tabForSave?.savedStat ??
      input.capturedTarget.savedStat ??
      input.activeTab.savedStat,
    lastKnownSavedMarkdown: tabForSave?.cleanMarkdownSnapshot ?? null,
    tabEol:
      tabForSave?.eol ?? input.capturedTarget.eol ?? input.activeTab.eol ?? "lf",
  };
}

export function buildExpectedDiskMarkdown(
  lastKnownSavedMarkdown: string | null,
  tabEol: SaveDocumentEol,
): string | null {
  return lastKnownSavedMarkdown !== null
    ? applyEol(lastKnownSavedMarkdown, tabEol)
    : null;
}

export function beginSaveDocumentFirstWins(
  override: SaveDocumentTarget | undefined,
  activeTabId: string,
  activeTab: {
    title: string;
    filePath: string | null;
    savedStat: SavedFileStat;
    eol: SaveDocumentEol;
  },
  tabs: readonly SaveDocumentTabRow[],
): {
  capturedTarget: SaveDocumentTarget;
  targetTabId: string;
  tabForSave: SaveDocumentTabRow | undefined;
  currentFilePath: string | null;
  currentTabTitle: string;
  currentSavedStat: SavedFileStat;
  lastKnownSavedMarkdown: string | null;
  tabEol: SaveDocumentEol;
  isInternalDoc: boolean;
} {
  const active: SaveDocumentTarget = {
    id: activeTabId,
    title: activeTab.title,
    filePath: activeTab.filePath,
    savedStat: activeTab.savedStat,
    eol: activeTab.eol,
  };
  const capturedTarget = captureSaveDocumentTarget(override, active);
  const identity = resolveSaveDocumentWriteIdentity({
    capturedTarget,
    tabs,
    activeTab: active,
  });
  return {
    capturedTarget,
    ...identity,
    isInternalDoc: Boolean(identity.tabForSave?.internalDocId),
  };
}
