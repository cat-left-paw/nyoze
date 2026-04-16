import { useEffect } from "react";
import type { SavedFileStat } from "../utils/externalEditConflict";
import { getPathBaseName } from "../utils/path";
import type { ActiveTabLoadResult, TabAddResult } from "./useTabManager";

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
};

export function useE2eBridge({
  loadIntoActiveTab,
  openFileInNewTab,
  flushImeCompositionSideEffects,
  showTabLimitNotice,
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
    };

    return () => {
      delete window.__NYOZE_E2E__;
    };
  }, [
    flushImeCompositionSideEffects,
    loadIntoActiveTab,
    openFileInNewTab,
    showTabLimitNotice,
  ]);
}
