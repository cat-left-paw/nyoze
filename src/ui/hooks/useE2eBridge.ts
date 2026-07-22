import { useEffect } from "react";
import { snapshotSpecialInlineBoundaryCompositionPendingForE2e } from "../../editor-core/extensions/specialInlineBoundarySentinel";
import {
  consumeSpecialInlineDiagLines,
  setSpecialInlineBoundaryDiagEnabled,
} from "../../editor-core/features/specialInlineBoundaryDiagnostics";
import type { SpecialInlineAdjacentPmInspection } from "../../editor-core/types";
import {
  computeMacosArrowScrollClampOffsets,
  shouldGateMacosArrowScrollClamp,
} from "../../editor-core/features/macosArrowScrollClamp";
import type { MacosArrowScrollClampGateInput } from "../../editor-core/features/macosArrowScrollClamp";
import type { SavedFileStat } from "../utils/externalEditConflict";
import { getPathBaseName } from "../utils/path";
import type { ActiveTabLoadResult, TabAddResult } from "./useTabManager";
import { getUiText } from "../i18n/uiText";
import { getShortcutReferenceContent } from "../internalDocs/getShortcutReferenceContent";
import { setChapterBoundaryHideDelayMsForE2e } from "../utils/editorChapterBoundaryVisibility";

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
  openOrFocusShortcutReferenceTab,
  setPseudoCaretEnabledForE2e,
  setPseudoCaretThicknessForE2e,
  setPseudoCaretBlinkEnabledForE2e,
}: UseE2eBridgeOptions) {
  useEffect(() => {
    const bridge = window.nyozeBridge?.e2e;
    if (!bridge) return;
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
      setPseudoCaretEnabledForE2e: setPseudoCaretEnabledForE2e ?? (() => {}),
      setPseudoCaretThicknessForE2e: setPseudoCaretThicknessForE2e ?? (() => {}),
      setPseudoCaretBlinkEnabledForE2e: setPseudoCaretBlinkEnabledForE2e ?? (() => {}),
      setChapterBoundaryHideDelayMsForE2e: (delayMs: number) => {
        setChapterBoundaryHideDelayMsForE2e(delayMs);
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
      delete window.__NYOZE_E2E__;
    };
  }, [
    flushImeCompositionSideEffects,
    inspectSpecialInlineAdjacentCaretPm,
    loadIntoActiveTab,
    openFileInNewTab,
    openOrFocusShortcutReferenceTab,
    setExplorerRootForE2e,
    onLibraryActivatedForE2e,
    reloadLibraryRegistryForE2e,
    setPseudoCaretEnabledForE2e,
    setPseudoCaretThicknessForE2e,
    setPseudoCaretBlinkEnabledForE2e,
    showTabLimitNotice,
  ]);
}
