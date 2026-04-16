/**
 * BETA-SP2: save-before-close の全 dirty tab 対応
 *
 * window close 時に全 dirty tab を順次保存し、全成功時のみ close を許可する。
 * active tab は既存 saveDocument(false) を使い、
 * non-active dirty tab は markdownSnapshot をファイルへ直接書き出す。
 */

import type {
  SavedFileStat,
  SaveErrorKind,
} from "../utils/externalEditConflict";
import {
  detectExternalEditConflict,
  buildConflictAwareWriteFileOptions,
} from "../utils/externalEditConflict";
import { applyEol, type EolKind } from "../../editor-core/io/eolHelper";

// --- Types ---

/** dirty 判定に必要な最小 tab 情報 */
export type DirtyTabInfo = {
  readonly id: string;
  readonly dirty: boolean;
  readonly filePath: string | null;
  readonly title: string;
  readonly markdownSnapshot: string;
  readonly savedStat: SavedFileStat;
  /** BETA-SP11: 読み込み時に検出した改行種別。 */
  readonly eol: EolKind;
};

/** bridge 側のファイル操作 API（テスト時に差し替え可能） */
export type SaveBeforeCloseBridge = {
  writeFile: (
    filePath: string,
    content: string,
    options?: {
      expectedStat?: { mtimeMs: number; size: number } | null;
      allowConflictOverwrite?: boolean;
    },
  ) => Promise<{
    saved: boolean;
    backupWarning?: string;
    conflictKind?: "modified" | "deleted";
    errorKind?: SaveErrorKind;
    errorMessage?: string;
  }>;
  saveAs: (
    content: string,
    defaultPath?: string,
  ) => Promise<{
    saved: boolean;
    filePath?: string;
    backupWarning?: string;
    errorKind?: SaveErrorKind;
    errorMessage?: string;
  }>;
  getFileStat: (
    filePath: string,
  ) => Promise<{
    ctimeMs: number;
    mtimeMs: number;
    size: number;
  } | null>;
};

/**
 * R3.5-2: Reason a save-before-close attempt failed. Mirrors SaveErrorKind
 * plus 'conflict' (external edit detected) and 'canceled' (Save As canceled
 * for an untitled tab during close).
 */
export type SaveBeforeCloseFailureReason =
  | { kind: "conflict"; conflictKind: "modified" | "deleted" }
  | { kind: "canceled" }
  | { kind: "save-error"; errorKind: SaveErrorKind; errorMessage?: string };

export type SaveBeforeCloseTabOutcome =
  | { ok: true; backupWarning?: string }
  | { ok: false; reason: SaveBeforeCloseFailureReason };

/** R3.5-2: Aggregated orchestrator result — which tab failed, if any. */
export type SaveBeforeCloseResult =
  | { ok: true; backupWarnings: Array<{ tabId: string; warning: string }> }
  | {
      ok: false;
      failedTab: { id: string; title: string; filePath: string | null };
      reason: SaveBeforeCloseFailureReason;
      backupWarnings: Array<{ tabId: string; warning: string }>;
    };

/** R3.5-2: active tab 保存の結果を orchestrator へ伝える */
export type ActiveTabSaveOutcome =
  | { ok: true; backupWarning?: string }
  | { ok: false; reason: SaveBeforeCloseFailureReason };

/** orchestrator に渡す deps */
export type SaveAllDirtyTabsDeps = {
  readonly tabs: readonly DirtyTabInfo[];
  readonly activeTabId: string;
  /**
   * active tab は既存 saveDocument(false) で保存する。
   * R3.5-2: boolean も許容するが、可能ならば outcome を返すこと。
   */
  saveActiveTab: () => Promise<boolean | ActiveTabSaveOutcome>;
  /** 保存成功後の clean 化 + savedStat 更新 */
  markTabClean: (tabId: string, markdown: string) => void;
  /** 保存成功後に savedStat を fetch して更新する */
  fetchAndPatchSavedStat: (tabId: string, filePath: string) => void;
  /** tab の filePath / title を更新する（Save As 時） */
  patchTab: (
    tabId: string,
    patch: { title?: string; filePath?: string | null },
  ) => void;
  bridge: SaveBeforeCloseBridge;
};

// --- Pure helpers ---

/** dirty tab の一覧を返す。テスト用に export。 */
export function collectDirtyTabs(
  tabs: readonly DirtyTabInfo[],
): DirtyTabInfo[] {
  return tabs.filter((t) => t.dirty);
}

// --- Non-active tab save ---

/**
 * non-active dirty tab の markdownSnapshot をファイルへ保存する（詳細版）。
 *
 * - filePath あり: conflict check → writeFile
 *   - conflict 検出時は save-error ではなく reason: 'conflict' を返す
 * - filePath なし (untitled): saveAs ダイアログ
 *   - キャンセルは reason: 'canceled'
 *
 * 成功時は markTabClean + fetchAndPatchSavedStat を呼ぶ。
 * R3.5-2: outcome を通じて失敗理由 / backupWarning を呼び出し元へ返す。
 */
export async function saveInactiveTabToFileDetailed(
  tab: DirtyTabInfo,
  deps: Pick<
    SaveAllDirtyTabsDeps,
    "bridge" | "markTabClean" | "fetchAndPatchSavedStat" | "patchTab"
  >,
): Promise<SaveBeforeCloseTabOutcome> {
  const { bridge } = deps;
  const md = tab.markdownSnapshot;
  // BETA-SP11: 元の EOL を復元して書き出す
  const mdToWrite = applyEol(md, tab.eol);

  if (tab.filePath) {
    // --- 既存ファイルへの上書き保存 ---
    const baseline = tab.savedStat;

    // conflict check
    if (baseline) {
      const currentStat = await bridge
        .getFileStat(tab.filePath)
        .catch(() => null);
      const conflict = detectExternalEditConflict(
        baseline,
        currentStat
          ? { mtimeMs: currentStat.mtimeMs, size: currentStat.size }
          : null,
      );
      if (conflict) {
        return {
          ok: false,
          reason: { kind: "conflict", conflictKind: conflict },
        };
      }
    }

    const result = await bridge.writeFile(
      tab.filePath,
      mdToWrite,
      buildConflictAwareWriteFileOptions(baseline),
    );

    if (!result?.saved) {
      if (result?.conflictKind) {
        return {
          ok: false,
          reason: { kind: "conflict", conflictKind: result.conflictKind },
        };
      }
      return {
        ok: false,
        reason: {
          kind: "save-error",
          errorKind: result?.errorKind ?? "write-failed",
          errorMessage: result?.errorMessage,
        },
      };
    }

    deps.markTabClean(tab.id, md);
    deps.fetchAndPatchSavedStat(tab.id, tab.filePath);
    return { ok: true, backupWarning: result.backupWarning };
  }

  // --- untitled tab: Save As ---
  const defaultPath = tab.title || "document.md";
  const saveAsResult = await bridge.saveAs(mdToWrite, defaultPath);
  if (!saveAsResult?.saved || !saveAsResult.filePath) {
    if (saveAsResult?.errorKind === "canceled" || !saveAsResult?.errorKind) {
      return { ok: false, reason: { kind: "canceled" } };
    }
    return {
      ok: false,
      reason: {
        kind: "save-error",
        errorKind: saveAsResult.errorKind,
        errorMessage: saveAsResult.errorMessage,
      },
    };
  }

  // Save As 成功 — tab metadata を更新
  const baseName = saveAsResult.filePath.split("/").pop() ??
    saveAsResult.filePath.split("\\").pop() ??
    saveAsResult.filePath;
  deps.patchTab(tab.id, {
    title: baseName,
    filePath: saveAsResult.filePath,
  });
  deps.markTabClean(tab.id, md);
  deps.fetchAndPatchSavedStat(tab.id, saveAsResult.filePath);
  return { ok: true, backupWarning: saveAsResult.backupWarning };
}

/**
 * R3.5-2 P2: close-before-save の Save As アクション用。
 * 任意の tab（active / non-active）の markdownSnapshot を Save As する。
 * saveInactiveTabToFileDetailed の "untitled Save As" 分岐と同じ構造だが、
 * filePath の有無にかかわらず常に Save As ダイアログを使う。
 */
export async function saveTabWithSaveAsDetailed(
  tab: DirtyTabInfo,
  deps: Pick<
    SaveAllDirtyTabsDeps,
    "bridge" | "markTabClean" | "fetchAndPatchSavedStat" | "patchTab"
  >,
): Promise<SaveBeforeCloseTabOutcome> {
  const { bridge } = deps;
  const md = tab.markdownSnapshot;
  const mdToWrite = applyEol(md, tab.eol);
  const defaultPath = tab.filePath ?? tab.title ?? "document.md";

  const saveAsResult = await bridge.saveAs(mdToWrite, defaultPath);
  if (!saveAsResult?.saved || !saveAsResult.filePath) {
    if (saveAsResult?.errorKind === "canceled" || !saveAsResult?.errorKind) {
      return { ok: false, reason: { kind: "canceled" } };
    }
    return {
      ok: false,
      reason: {
        kind: "save-error",
        errorKind: saveAsResult.errorKind,
        errorMessage: saveAsResult.errorMessage,
      },
    };
  }

  const baseName = saveAsResult.filePath.split("/").pop() ??
    saveAsResult.filePath.split("\\").pop() ??
    saveAsResult.filePath;
  deps.patchTab(tab.id, {
    title: baseName,
    filePath: saveAsResult.filePath,
  });
  deps.markTabClean(tab.id, md);
  deps.fetchAndPatchSavedStat(tab.id, saveAsResult.filePath);
  return { ok: true, backupWarning: saveAsResult.backupWarning };
}

/**
 * 旧インタフェース: boolean のみ返す。既存コード互換のため保持。
 * 新しい呼び出し元は saveInactiveTabToFileDetailed を使うこと。
 */
export async function saveInactiveTabToFile(
  tab: DirtyTabInfo,
  deps: Pick<
    SaveAllDirtyTabsDeps,
    "bridge" | "markTabClean" | "fetchAndPatchSavedStat" | "patchTab"
  >,
): Promise<boolean> {
  const outcome = await saveInactiveTabToFileDetailed(tab, deps);
  return outcome.ok;
}

// --- Orchestrator ---

/**
 * 全 dirty tab を順次保存する。
 *
 * 1. dirty tab が 0 件なら true
 * 2. active dirty tab があれば saveDocument(false) で保存
 * 3. non-active dirty tab を順次 saveInactiveTabToFileDetailed で保存
 * 4. いずれか 1 件でも失敗したら即 false（どの tab がどの理由で失敗したかを返す）
 * 5. 全成功で true（backupWarning があれば全件収集して返す）
 *
 * R3.5-2: 旧 API (boolean 返却) も維持する。既存呼び出しは boolean として評価できる。
 */
export async function saveAllDirtyTabsBeforeCloseDetailed(
  deps: SaveAllDirtyTabsDeps,
): Promise<SaveBeforeCloseResult> {
  const dirtyTabs = collectDirtyTabs(deps.tabs);
  const backupWarnings: Array<{ tabId: string; warning: string }> = [];
  if (dirtyTabs.length === 0) return { ok: true, backupWarnings };

  // active tab を先に保存（Source Mode / Paragraph Plain 対応は saveDocument に任せる）
  const activeDirtyTab = dirtyTabs.find((t) => t.id === deps.activeTabId);
  if (activeDirtyTab) {
    const activeResult = await deps.saveActiveTab();
    const outcome: ActiveTabSaveOutcome = typeof activeResult === "boolean"
      ? activeResult
        ? { ok: true }
        : {
            ok: false,
            reason: {
              kind: "save-error",
              errorKind: "write-failed",
            },
          }
      : activeResult;
    if (!outcome.ok) {
      return {
        ok: false,
        failedTab: {
          id: activeDirtyTab.id,
          title: activeDirtyTab.title,
          filePath: activeDirtyTab.filePath,
        },
        reason: outcome.reason,
        backupWarnings,
      };
    }
    if (outcome.backupWarning) {
      backupWarnings.push({
        tabId: activeDirtyTab.id,
        warning: outcome.backupWarning,
      });
    }
  }

  // non-active dirty tabs を順次保存
  for (const tab of dirtyTabs) {
    if (tab.id === deps.activeTabId) continue;
    const outcome = await saveInactiveTabToFileDetailed(tab, deps);
    if (!outcome.ok) {
      return {
        ok: false,
        failedTab: { id: tab.id, title: tab.title, filePath: tab.filePath },
        reason: outcome.reason,
        backupWarnings,
      };
    }
    if (outcome.backupWarning) {
      backupWarnings.push({ tabId: tab.id, warning: outcome.backupWarning });
    }
  }

  return { ok: true, backupWarnings };
}

/**
 * 旧インタフェース: boolean のみ返す。既存呼び出し互換のため保持。
 * 新しい呼び出し元は saveAllDirtyTabsBeforeCloseDetailed を使うこと。
 */
export async function saveAllDirtyTabsBeforeClose(
  deps: SaveAllDirtyTabsDeps,
): Promise<boolean> {
  const result = await saveAllDirtyTabsBeforeCloseDetailed(deps);
  return result.ok;
}
