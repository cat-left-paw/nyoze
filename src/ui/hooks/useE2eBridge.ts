import { useEffect } from "react";
import { snapshotSpecialInlineBoundaryCompositionPendingForE2e } from "../../editor-core/extensions/specialInlineBoundarySentinel";
import {
  consumeSpecialInlineDiagLines,
  setSpecialInlineBoundaryDiagEnabled,
} from "../../editor-core/features/specialInlineBoundaryDiagnostics";
import type { SpecialInlineAdjacentPmInspection } from "../../editor-core/types";
import type {
  LocalImeEditMenuCommandResult,
  LocalImeEditMenuOperation,
} from "../../editor-core/features/localImeEditMenuCommandState";
import {
  computeMacosArrowScrollClampOffsets,
  shouldGateMacosArrowScrollClamp,
} from "../../editor-core/features/macosArrowScrollClamp";
import type { MacosArrowScrollClampGateInput } from "../../editor-core/features/macosArrowScrollClamp";
import {
  copyLocalImeLocalWindowRecoveryMarkdown,
  discardLocalImeLocalWindowRecoveryDraft,
  exportLocalImeLocalWindowRecoveryMarkdown,
  getLocalImeLocalEditingStatusDiagnostics,
  notifyLocalImeDraftDirty,
  restartLocalImeLocalWindowRuntime,
  retryLocalImeLocalWindowRecoveryToOff,
} from "../../editor-core/features/localImePilotRuntime";
import { getLocalImeLocalWindowRecoveryPort } from "../../editor-core/features/localImeLocalWindowRecoveryRuntime";
import {
  destroyImeCompositionLatencyProbe,
  isImeCompositionLatencyProbeActive,
  reportImeCompositionLatencyProbe,
  resetImeCompositionLatencyProbe,
  snapshotImeCompositionLatencyProbe,
  startImeCompositionLatencyProbe,
  stopImeCompositionLatencyProbe,
} from "../../editor-core/features/imeCompositionLatencyProbeHost";
import type { SavedFileStat } from "../utils/externalEditConflict";
import { getPathBaseName } from "../utils/path";
import type { ActiveTabLoadResult, TabAddResult } from "./useTabManager";
import type { EditorTab } from "./useAppUiState";
import type { EditorSessionHydrationStatus } from "./useEditorSession";
import { getUiText } from "../i18n/uiText";
import { getShortcutReferenceContent } from "../internalDocs/getShortcutReferenceContent";
import { setChapterBoundaryHideDelayMsForE2e } from "../utils/editorChapterBoundaryVisibility";
import {
  armSavedStatPatchHoldForE2e,
  armTabLeaveSnapshotApplyHoldForE2e,
  releaseSavedStatPatchHoldForE2e,
  releaseTabLeaveSnapshotApplyHoldForE2e,
  snapshotSavedStatPatchHoldForE2e,
  snapshotTabLeaveSnapshotApplyHoldForE2e,
} from "../utils/savedStatPatchLatchForE2e";
import {
  armExplorerTrashHoldForE2e,
  releaseExplorerTrashHoldForE2e,
  snapshotExplorerTrashHoldForE2e,
} from "../utils/fileExplorerTrashLatchForE2e";

/**
 * LOCAL-WINDOW-RECOVERY-RESTART1: 通常のE2Eで共有OS clipboardを変更しないための
 * **test-only** capture writer state。effect再実行をまたいで観測できるよう module
 * scope に置く。production経路からは呼ばない（bridge自体がE2E gate内にしかない）。
 */
let localWindowRecoveryClipboardCapture: string | null = null;
let localWindowRecoveryClipboardWriteCount = 0;

type UseE2eBridgeOptions = {
  loadIntoActiveTab: (
    filePath: string | null,
    title: string,
    content: string,
    savedStat?: SavedFileStat,
  ) => Promise<ActiveTabLoadResult>;
  openFileInNewTab: (
    filePath: string | null,
    title: string,
    content: string,
    savedStat?: SavedFileStat,
  ) => Promise<TabAddResult>;
  flushImeCompositionSideEffects: (reason: string) => void;
  showTabLimitNotice: () => void;
  /** When set, E2E can open a fixture directory as the File Explorer root (NYOZE_E2E only). */
  setExplorerRootForE2e?: (rootDir: string) => void;
  /** When set, E2E can sync library registry + explorer after fixture setup. */
  onLibraryActivatedForE2e?: (activeRoot: string) => void;
  reloadLibraryRegistryForE2e?: () => void;
  inspectSpecialInlineAdjacentCaretPm?: () => SpecialInlineAdjacentPmInspection | null;
  /**
   * P2-G2b E2E: `EditorCoreHandle.peekMarkdown()` の読み取り専用入口。
   * live PM state を保存せずに serialize するだけで、PM Doc / file / IPC には
   * 一切触れない。E2E は返り値を診断へ出さず文字列比較にだけ使うこと。
   */
  peekCoreMarkdownForE2e?: () => string | null;
  /**
   * P2-G1a: `EditorCoreHandle.routeLocalImeEditMenuCommand()` の**実経路**入口（NYOZE_E2E only）。
   * integration port → controller port → 既存 P2-D1 adapter を実 instance で通す。
   * 製品の Edit menu はまだ native role なので、この入口が唯一の実経路検証手段になる。
   */
  routeLocalImeEditMenuCommandForE2e?: (
    operation: LocalImeEditMenuOperation,
  ) => LocalImeEditMenuCommandResult | null;
  runEditorUndoRedoForE2e?: (operation: 'undo' | 'redo') => boolean;
  getLocalImeLocalWindowSnapshotForE2e?: () =>
    | import('../../editor-core/features/localImeLocalWindowController').LocalImeLocalWindowSnapshot
    | null;
  getLocalImeNavigationPerformanceSnapshotForE2e?: () => ReturnType<
    import('../../editor-core/features/localImeIntegration').LocalImeIntegrationHandle['getNavigationPerformanceSnapshotForE2e']
  >;
  /** EDITOR-INTERACTION-PERF1: canonical host composition authorityのread-only E2E入口。 */
  getHostImeCompositionActiveForE2e?: () => boolean;
  setLocalImeLocalWindowFailureForE2e?: (
    failure: import('../../editor-core/features/localImeLocalWindowController').LocalImeLocalWindowFailureForTest,
  ) => void;
  /** RECOVERY-RESTART1 test only: restartのStart経路へone-shot failureを仕込む。 */
  injectLocalImeLocalWindowRestartStartFailureForE2e?: (
    kind: 'start-wiring' | 'start-wiring-and-settlement',
  ) => void;
  dispatchLocalImeLocalWindowHostContentChangeForE2e?: (
    kind: import('../../editor-core/features/localImeLocalWindowController').LocalImeLocalWindowHostContentChangeForTest,
  ) => boolean;
  setLocalImeLocalWindowSelectionForE2e?: (anchor: number, head?: number) => boolean;
  dispatchLocalImeLocalWindowGrowthForE2e?: (
    additionalBlocks: number,
    text?: string,
  ) => boolean;
  /** Toggle pseudo caret overlay at runtime (NYOZE_E2E only). */
  setPseudoCaretEnabledForE2e?: (on: boolean) => void;
  /** Set pseudo caret thickness at runtime (NYOZE_E2E only). */
  setPseudoCaretThicknessForE2e?: (px: number) => void;
  /** Toggle pseudo caret blink at runtime (NYOZE_E2E only). */
  setPseudoCaretBlinkEnabledForE2e?: (on: boolean) => void;
  /** Opens or focuses the fixed shortcut-reference tab (NYOZE_E2E). */
  openOrFocusShortcutReferenceTab?: (args: {
    title: string;
    markdown: string;
    bundleKey: "ja" | "en";
  }) => Promise<TabAddResult>;
  documentLeaveTabsForE2e?: {
    tabs: readonly EditorTab[];
    activeTabId: string;
    switchTo: (tabId: string) => Promise<"switched" | "cancelled">;
    add: () => Promise<TabAddResult>;
    close: (tabId: string) => Promise<void>;
  };
  getEditorSessionStatusForE2e?: () => EditorSessionHydrationStatus;
};

export function useE2eBridge({
  loadIntoActiveTab,
  openFileInNewTab,
  flushImeCompositionSideEffects,
  showTabLimitNotice,
  setExplorerRootForE2e,
  onLibraryActivatedForE2e,
  reloadLibraryRegistryForE2e,
  inspectSpecialInlineAdjacentCaretPm,
  peekCoreMarkdownForE2e,
  routeLocalImeEditMenuCommandForE2e,
  runEditorUndoRedoForE2e,
  getLocalImeLocalWindowSnapshotForE2e,
  getLocalImeNavigationPerformanceSnapshotForE2e,
  getHostImeCompositionActiveForE2e,
  setLocalImeLocalWindowFailureForE2e,
  dispatchLocalImeLocalWindowHostContentChangeForE2e,
  setLocalImeLocalWindowSelectionForE2e,
  dispatchLocalImeLocalWindowGrowthForE2e,
  openOrFocusShortcutReferenceTab,
  documentLeaveTabsForE2e,
  setPseudoCaretEnabledForE2e,
  setPseudoCaretThicknessForE2e,
  setPseudoCaretBlinkEnabledForE2e,
  injectLocalImeLocalWindowRestartStartFailureForE2e,
  getEditorSessionStatusForE2e,
}: UseE2eBridgeOptions) {
  useEffect(() => {
    const bridge = window.nyozeBridge?.e2e;
    // main の `MAIN_E2E_ENABLED`（`NYOZE_E2E` かつ非 packaged）が true のときだけ
    // preload が bridge を expose し、`enabled` に true を載せる。packaged build では
    // ここで抜けるため `window.__NYOZE_E2E__` 自体が構築されず、IME latency probe を
    // 含むすべての診断入口が存在しない。
    if (!bridge || bridge.enabled !== true) return;
    const waitForNextPaint = () =>
      new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });

    const readDocumentFixture = async (filePath: string) => {
      const fixture = await bridge.readDocumentFixture(filePath);
      if (!fixture) return null;
      return {
        content: fixture.content,
        savedStat: fixture.savedStat,
        title: getPathBaseName(filePath),
      };
    };

    window.__NYOZE_E2E__ = {
      snapshotSpecialInlineBoundaryCompositionPendingForE2e,
      setSpecialInlineBoundaryDiagEnabled: (on: boolean) => {
        setSpecialInlineBoundaryDiagEnabled(on);
      },
      flushSpecialInlineBoundaryDiagLogs: () => consumeSpecialInlineDiagLines(),
      inspectSpecialInlineAdjacentCaretPm:
        inspectSpecialInlineAdjacentCaretPm ?? (() => null),
      // P2-G2b: live PM markdown の読み取り専用 peek。保存しない・IPC を持たない。
      peekMarkdown: () => peekCoreMarkdownForE2e?.() ?? null,
      // P2-G1a: Edit menu routing port の実経路（integration → controller → P2-D1 adapter）。
      routeLocalImeEditMenuCommand: (operation: LocalImeEditMenuOperation) =>
        routeLocalImeEditMenuCommandForE2e?.(operation) ?? null,
      runEditorUndoRedo: (operation: 'undo' | 'redo') =>
        runEditorUndoRedoForE2e?.(operation) ?? false,
      localImeLocalWindow: {
        snapshot: () => getLocalImeLocalWindowSnapshotForE2e?.() ?? null,
        setFailure: (failure) => setLocalImeLocalWindowFailureForE2e?.(failure),
        dispatchHostContentChange: (kind) =>
          dispatchLocalImeLocalWindowHostContentChangeForE2e?.(kind) ?? false,
        setLocalSelection: (anchor, head) =>
          setLocalImeLocalWindowSelectionForE2e?.(anchor, head) ?? false,
        dispatchLocalGrowth: (additionalBlocks, text) =>
          dispatchLocalImeLocalWindowGrowthForE2e?.(additionalBlocks, text) ?? false,
        /**
         * RECOVERY-RESTART1 typed portの診断入口。E2E bridgeはproduction
         * capabilityではなく、`PUBLIC-ENTRY1`は同じportを直接呼ぶ。
         */
        recovery: {
          epoch: () => getLocalImeLocalWindowRecoveryPort()?.getEpoch() ?? null,
          diagnostics: () =>
            getLocalImeLocalWindowRecoveryPort()?.diagnostics() ?? null,
          requestEnabled: (enabled: boolean, epoch?: number) =>
            getLocalImeLocalWindowRecoveryPort()?.requestEnabled({ enabled, epoch }) ?? null,
          retry: () => retryLocalImeLocalWindowRecoveryToOff(),
          retryAtEpoch: (epoch: number) =>
            getLocalImeLocalWindowRecoveryPort()?.retry({ epoch }) ?? null,
          exportMarkdown: () => exportLocalImeLocalWindowRecoveryMarkdown(),
          copyMarkdown: async (mode: "capture" | "fail" = "capture") =>
            copyLocalImeLocalWindowRecoveryMarkdown((markdown: string) => {
              localWindowRecoveryClipboardWriteCount += 1;
              if (mode === "fail") throw new Error("local-window-recovery-copy-failed");
              localWindowRecoveryClipboardCapture = markdown;
              return true;
            }),
          readCapturedClipboard: () => ({
            markdown: localWindowRecoveryClipboardCapture,
            writeCount: localWindowRecoveryClipboardWriteCount,
          }),
          discard: (confirmed: boolean) =>
            discardLocalImeLocalWindowRecoveryDraft(confirmed),
          // breaker解除とpilot state同期を持つ唯一のrestart入口へ委譲する。
          restart: () => restartLocalImeLocalWindowRuntime(),
          restartAtEpoch: (epoch: number) => restartLocalImeLocalWindowRuntime(epoch),
          // 製品portではなく既存の`...ForE2e`経路（packaging gate対象）を使う。
          injectRestartStartFailure: (kind: 'start-wiring' | 'start-wiring-and-settlement') =>
            injectLocalImeLocalWindowRestartStartFailureForE2e?.(kind),
        },
      },
      longDocNavigationPerformance: {
        snapshot: () => getLocalImeNavigationPerformanceSnapshotForE2e?.() ?? null,
      },
      hostImeComposition: {
        active: () => getHostImeCompositionActiveForE2e?.() ?? false,
      },
      // OVERLAY-STATUS1: coarse status は runtime から直接公開する。
      // 1-block paragraph controller snapshot へ混ぜない。
      localImeLocalEditingStatus: {
        snapshot: () => getLocalImeLocalEditingStatusDiagnostics(),
      },
      setPseudoCaretEnabledForE2e: setPseudoCaretEnabledForE2e ?? (() => {}),
      setPseudoCaretThicknessForE2e: setPseudoCaretThicknessForE2e ?? (() => {}),
      setPseudoCaretBlinkEnabledForE2e: setPseudoCaretBlinkEnabledForE2e ?? (() => {}),
      setChapterBoundaryHideDelayMsForE2e: (delayMs: number) => {
        setChapterBoundaryHideDelayMsForE2e(delayMs);
      },
      savedStatPatchHold: {
        arm: () => armSavedStatPatchHoldForE2e(),
        release: () => releaseSavedStatPatchHoldForE2e(),
        snapshot: () => snapshotSavedStatPatchHoldForE2e(),
      },
      explorerTrashHold: {
        arm: () => armExplorerTrashHoldForE2e(),
        release: () => releaseExplorerTrashHoldForE2e(),
        snapshot: () => snapshotExplorerTrashHoldForE2e(),
      },
      tabLeaveSnapshotApplyHold: {
        arm: () => armTabLeaveSnapshotApplyHoldForE2e(),
        release: () => releaseTabLeaveSnapshotApplyHoldForE2e(),
        snapshot: () => snapshotTabLeaveSnapshotApplyHoldForE2e(),
      },
      establishFixtureWorkspace: async (dir: string) => {
        const establish = window.nyozeBridge?.e2e?.establishWorkspaceRoot;
        if (!establish || !setExplorerRootForE2e) return false;
        const root = await establish(dir);
        if (!root) return false;
        onLibraryActivatedForE2e?.(root);
        reloadLibraryRegistryForE2e?.();
        setExplorerRootForE2e(root);
        return true;
      },
      establishLibrariesFixture: async (payload: {
        libraryRoots: string[];
        activeRoot: string;
      }) => {
        const establish = window.nyozeBridge?.e2e?.establishLibrariesFixture;
        if (!establish || !setExplorerRootForE2e) return false;
        const result = await establish(payload);
        if (!result.ok) return false;
        onLibraryActivatedForE2e?.(result.activeRoot);
        reloadLibraryRegistryForE2e?.();
        setExplorerRootForE2e(result.activeRoot);
        return true;
      },
      queueOpenPathResult: async (payload: {
        kind: "file" | "directory";
        path: string;
      }) => {
        const queue = window.nyozeBridge?.e2e?.queueOpenPathResult;
        if (!queue) return false;
        const result = await queue(payload);
        return result.ok;
      },
      dispatchMenuCommand: async (command: string) => {
        const dispatch = window.nyozeBridge?.e2e?.dispatchMenuCommand;
        if (!dispatch) return false;
        return dispatch(command);
      },
      loadFileIntoActiveTab: async (filePath: string) => {
        const fixture = await readDocumentFixture(filePath);
        if (!fixture) return false;
        flushImeCompositionSideEffects("e2e-load-into-active-tab");
        const result = await loadIntoActiveTab(
          filePath,
          fixture.title,
          fixture.content,
          fixture.savedStat,
        );
        await waitForNextPaint();
        return result;
      },
      openFileInNewTab: async (filePath: string) => {
        const fixture = await readDocumentFixture(filePath);
        if (!fixture) return false;
        flushImeCompositionSideEffects("e2e-open-file-in-new-tab");
        const result = await openFileInNewTab(
          filePath,
          fixture.title,
          fixture.content,
          fixture.savedStat,
        );
        if (result === "tab-limit") showTabLimitNotice();
        await waitForNextPaint();
        return result;
      },
      openShortcutReferenceDoc:
        openOrFocusShortcutReferenceTab === undefined
          ? undefined
          : async () => {
              flushImeCompositionSideEffects("e2e-shortcut-reference");
              const title = getUiText("en", "help.shortcutsReference");
              const { markdown, bundleKey } =
                getShortcutReferenceContent("en");
              const result = await openOrFocusShortcutReferenceTab({
                title,
                markdown,
                bundleKey,
              });
              if (result === "tab-limit") showTabLimitNotice();
              await waitForNextPaint();
              return result;
            },
      documentLeaveTabs: {
        snapshot: () => (documentLeaveTabsForE2e?.tabs ?? []).map((tab) => ({
          id: tab.id,
          title: tab.title,
          dirty: tab.dirty,
          filePath: tab.filePath,
          markdownSnapshot: tab.markdownSnapshot,
          savedStat: tab.savedStat,
          internalDocId: tab.internalDocId,
          active: tab.id === documentLeaveTabsForE2e?.activeTabId,
        })),
        switchTo: (tabId: string) =>
          documentLeaveTabsForE2e?.switchTo(tabId) ?? Promise.resolve("cancelled"),
        add: () => documentLeaveTabsForE2e?.add() ?? Promise.resolve("cancelled"),
        close: async (tabId: string) => {
          await documentLeaveTabsForE2e?.close(tabId);
        },
        injectDocumentIdentity: (documentIdentity: string | null) => {
          notifyLocalImeDraftDirty({ dirty: false, documentIdentity });
        },
      },
      editorSession: {
        snapshot: () =>
          getEditorSessionStatusForE2e?.() ?? {
            hydrated: false,
            source: "pending",
            restoredTabCount: 0,
            lastPersistedRevision: 0,
          },
      },
      // Slice 0: baseline / 将来 PoC 共通の IME composition latency probe。
      // 起動されるまで listener / PerformanceObserver / rAF / timer を作らない。
      imeLatencyProbe: {
        start: (probeOptions?: {
          mode?: string;
          targetSelector?: string;
          maxSamples?: number;
          pendingTimeoutMs?: number;
        }) => startImeCompositionLatencyProbe(probeOptions),
        stop: (reason?: string) => stopImeCompositionLatencyProbe(reason),
        reset: (reason?: string) => resetImeCompositionLatencyProbe(reason),
        snapshot: () => snapshotImeCompositionLatencyProbe(),
        report: (reportOptions?: { pendingTimeoutMs?: number }) =>
          reportImeCompositionLatencyProbe(reportOptions),
        destroy: (reason?: string) => destroyImeCompositionLatencyProbe(reason),
        isActive: () => isImeCompositionLatencyProbeActive(),
      },
      macosArrowScrollClampE2eEvaluate: (payload: {
        gate: MacosArrowScrollClampGateInput;
        beforeTop: number;
        beforeLeft: number;
        afterTop: number;
        afterLeft: number;
        clientWidth: number;
        clientHeight: number;
      }) => {
        const host = {
          scrollTop: payload.afterTop,
          scrollLeft: payload.afterLeft,
          clientWidth: payload.clientWidth,
          clientHeight: payload.clientHeight,
        } as HTMLElement;
        const offsets = computeMacosArrowScrollClampOffsets(
          host,
          payload.beforeTop,
          payload.beforeLeft,
        );
        return {
          shouldGate: shouldGateMacosArrowScrollClamp(payload.gate),
          ...offsets,
        };
      },
    };

    return () => {
      // NOTE: ここで probe を destroy しないこと。この effect は依存 callback の
      // 再生成（dirty 化・タブ操作など）で普通に再実行されるため、cleanup で
      // 破棄すると計測中の session が黙って消える。probe の寿命は E2E からの
      // 明示 start / destroy だけで管理する（start されるまで listener は 0）。
      // savedStat patch latch も同じ理由でここでは解放しない。
      delete window.__NYOZE_E2E__;
    };
  }, [
    flushImeCompositionSideEffects,
    inspectSpecialInlineAdjacentCaretPm,
    peekCoreMarkdownForE2e,
    routeLocalImeEditMenuCommandForE2e,
    runEditorUndoRedoForE2e,
    getLocalImeLocalWindowSnapshotForE2e,
    getLocalImeNavigationPerformanceSnapshotForE2e,
    getHostImeCompositionActiveForE2e,
    setLocalImeLocalWindowFailureForE2e,
    injectLocalImeLocalWindowRestartStartFailureForE2e,
    dispatchLocalImeLocalWindowHostContentChangeForE2e,
    setLocalImeLocalWindowSelectionForE2e,
    dispatchLocalImeLocalWindowGrowthForE2e,
    loadIntoActiveTab,
    openFileInNewTab,
    openOrFocusShortcutReferenceTab,
    documentLeaveTabsForE2e,
    setExplorerRootForE2e,
    onLibraryActivatedForE2e,
    reloadLibraryRegistryForE2e,
    setPseudoCaretEnabledForE2e,
    setPseudoCaretThicknessForE2e,
    setPseudoCaretBlinkEnabledForE2e,
    showTabLimitNotice,
    getEditorSessionStatusForE2e,
  ]);
}
