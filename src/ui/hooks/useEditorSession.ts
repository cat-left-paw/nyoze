import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type {
  EditorCoreHandle,
  LineBreakPolicy,
} from "../../editor-core/types";
import type { WritingMode } from "../../settings/types";
import type {
  EditorSessionRestoreResult,
  EditorSessionWriteResult,
} from "../../session/editorSessionTypes";
import type {
  EditorTab,
  LineBreakPolicyTargetTab,
} from "./useAppUiState";
import { generateTabId } from "./useAppUiState";
import {
  buildRestoredEditorTabs,
  createEditorSessionPersistRequest,
  deriveEditorSessionTopology,
  editorSessionTopologyKey,
  loadRestoredMarkdownWithDirtySuppression,
  resolvePersistedEditorSessionTopologyKey,
  shouldPersistEditorSessionTopology,
} from "./editorSessionTopology";

export type EditorSessionHydrationStatus = {
  hydrated: boolean;
  source: EditorSessionRestoreResult["source"] | "pending";
  restoredTabCount: number;
  lastPersistedRevision: number;
};

type UseEditorSessionOptions = {
  coreReady: boolean;
  settingsReady: boolean;
  coreRef: RefObject<EditorCoreHandle | null>;
  tabs: EditorTab[];
  activeTabId: string;
  setTabs: React.Dispatch<React.SetStateAction<EditorTab[]>>;
  setActiveTabId: (tabId: string) => void;
  defaultWritingMode: WritingMode;
  defaultLineBreakPolicy: LineBreakPolicy;
  setSuppressNextDirty: (value: boolean) => void;
  ensureSafeLineBreakPolicyBeforeDocumentLoad: (options?: {
    targetTabId?: string;
    targetTabSnapshot?: LineBreakPolicyTargetTab;
  }) => boolean;
  closePlainEditModes: () => void;
  refreshHeadings: () => void;
  resetEditorScroll: () => void;
  notifyActiveDocumentPath: (filePath: string | null) => void;
  onActiveContentLoaded: (characterCount: number) => void;
};

export function useEditorSession(options: UseEditorSessionOptions) {
  const {
    coreReady,
    settingsReady,
    coreRef,
    tabs,
    activeTabId,
    setTabs,
    setActiveTabId,
    defaultWritingMode,
    defaultLineBreakPolicy,
    setSuppressNextDirty,
    ensureSafeLineBreakPolicyBeforeDocumentLoad,
    closePlainEditModes,
    refreshHeadings,
    resetEditorScroll,
    notifyActiveDocumentPath,
    onActiveContentLoaded,
  } = options;
  const hydrationStartedRef = useRef(false);
  const mountedRef = useRef(true);
  const revisionRef = useRef(0);
  const lastPersistedTopologyKeyRef = useRef<string | null>(null);
  const lastPersistedRevisionRef = useRef(0);
  const inFlightWritesRef = useRef(new Map<string, Promise<boolean>>());
  const [status, setStatus] = useState<EditorSessionHydrationStatus>({
    hydrated: false,
    source: "pending",
    restoredTabCount: 0,
    lastPersistedRevision: 0,
  });
  const statusRef = useRef(status);
  statusRef.current = status;
  const hydrationRuntimeRef = useRef({
    coreRef,
    defaultWritingMode,
    defaultLineBreakPolicy,
    setTabs,
    setActiveTabId,
    setSuppressNextDirty,
    ensureSafeLineBreakPolicyBeforeDocumentLoad,
    closePlainEditModes,
    refreshHeadings,
    resetEditorScroll,
    notifyActiveDocumentPath,
    onActiveContentLoaded,
  });
  hydrationRuntimeRef.current = {
    coreRef,
    defaultWritingMode,
    defaultLineBreakPolicy,
    setTabs,
    setActiveTabId,
    setSuppressNextDirty,
    ensureSafeLineBreakPolicyBeforeDocumentLoad,
    closePlainEditModes,
    refreshHeadings,
    resetEditorScroll,
    notifyActiveDocumentPath,
    onActiveContentLoaded,
  };

  useEffect(() => {
    // React.StrictMode intentionally runs setup -> cleanup -> setup in dev.
    // Re-arm the live-instance flag on every setup, not only at ref creation.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const topology = useMemo(
    () => deriveEditorSessionTopology(tabs, activeTabId),
    [activeTabId, tabs],
  );
  const topologyKey = editorSessionTopologyKey(topology);
  const topologyRef = useRef(topology);
  topologyRef.current = topology;

  const persistTopologyValue = useCallback(
    async (nextTopology: typeof topology, force: boolean): Promise<boolean> => {
      if (!statusRef.current.hydrated) return false;
      const bridge = window.nyozeBridge?.editorSession;
      if (!bridge?.write) return false;
      const nextKey = editorSessionTopologyKey(nextTopology);
      if (!force && lastPersistedTopologyKeyRef.current === nextKey) return true;
      const existingWrite = inFlightWritesRef.current.get(nextKey);
      if (!force && existingWrite) return existingWrite;
      const revision = revisionRef.current + 1;
      revisionRef.current = revision;
      const writePromise = (async (): Promise<boolean> => {
        try {
          const result: EditorSessionWriteResult = await bridge.write(
            createEditorSessionPersistRequest(nextTopology, revision),
          );
          if (result.revision >= lastPersistedRevisionRef.current) {
            lastPersistedTopologyKeyRef.current =
              resolvePersistedEditorSessionTopologyKey({
                previousKey: lastPersistedTopologyKeyRef.current,
                attemptedKey: nextKey,
                persisted: result.persisted,
              });
          }
          if (result.persisted && result.revision >= lastPersistedRevisionRef.current) {
            lastPersistedRevisionRef.current = result.revision;
            setStatus((previous) => ({
              ...previous,
              lastPersistedRevision: Math.max(
                previous.lastPersistedRevision,
                result.revision,
              ),
            }));
          }
          return result.persisted;
        } catch {
          return false;
        }
      })();
      if (!force) inFlightWritesRef.current.set(nextKey, writePromise);
      try {
        return await writePromise;
      } finally {
        if (inFlightWritesRef.current.get(nextKey) === writePromise) {
          inFlightWritesRef.current.delete(nextKey);
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!coreReady || !settingsReady || hydrationStartedRef.current) return;
    hydrationStartedRef.current = true;
    const bridge = window.nyozeBridge?.editorSession;
    if (!bridge?.restore) {
      setStatus({
        hydrated: true,
        source: "empty",
        restoredTabCount: 0,
        lastPersistedRevision: 0,
      });
      return;
    }

    void bridge
      .restore()
      .then((result) => {
        if (!mountedRef.current) return;
        const runtime = hydrationRuntimeRef.current;
        revisionRef.current = result.revision;
        lastPersistedRevisionRef.current = result.revision;
        const restoredTabs = buildRestoredEditorTabs(result.tabs, {
          writingMode: runtime.defaultWritingMode,
          lineBreakPolicy: runtime.defaultLineBreakPolicy,
          generateTabId,
        });
        const activeIndex = Math.min(
          Math.max(0, result.activeIndex),
          Math.max(0, restoredTabs.length - 1),
        );
        const activeTab = restoredTabs[activeIndex];
        const core = runtime.coreRef.current;
        let didRestore = false;

        if (activeTab && core) {
          runtime.notifyActiveDocumentPath(activeTab.filePath);
          runtime.ensureSafeLineBreakPolicyBeforeDocumentLoad({
            targetTabSnapshot: activeTab,
          });
          // Startup hydration is intentionally not a document-switch transition.
          // This keeps saved Local Window ON in enabled-waiting with no auto Start.
          const loaded = loadRestoredMarkdownWithDirtySuppression({
            load: () => core.loadMarkdown(activeTab.markdownSnapshot),
            setSuppressNextDirty: runtime.setSuppressNextDirty,
          });
          if (loaded) {
            core.clearHistory();
            core.setReadOnly(false);
            runtime.closePlainEditModes();
            activeTab.documentMarkdownOptions = core.getDocumentMarkdownOptions();
            lastPersistedTopologyKeyRef.current = editorSessionTopologyKey(
              deriveEditorSessionTopology(restoredTabs, activeTab.id),
            );
            runtime.setTabs(restoredTabs);
            runtime.setActiveTabId(activeTab.id);
            runtime.refreshHeadings();
            runtime.resetEditorScroll();
            runtime.onActiveContentLoaded(activeTab.characterCount);
            core.focusEditor();
            core.schedulePseudoCaretUpdate();
            didRestore = true;
          } else {
            runtime.notifyActiveDocumentPath(null);
          }
        }

        setStatus({
          hydrated: true,
          source: didRestore
            ? result.source
            : result.source === "invalid"
              ? "invalid"
              : "empty",
          restoredTabCount: didRestore ? restoredTabs.length : 0,
          lastPersistedRevision: result.revision,
        });
      })
      .catch(() => {
        if (!mountedRef.current) return;
        hydrationRuntimeRef.current.notifyActiveDocumentPath(null);
        setStatus({
          hydrated: true,
          source: "invalid",
          restoredTabCount: 0,
          lastPersistedRevision: 0,
        });
      });
  }, [coreReady, settingsReady]);

  useEffect(() => {
    if (
      !shouldPersistEditorSessionTopology({
        hydrated: status.hydrated,
        previousKey: lastPersistedTopologyKeyRef.current,
        nextKey: topologyKey,
      })
    ) {
      return;
    }
    void persistTopologyValue(topologyRef.current, false);
  }, [persistTopologyValue, status.hydrated, topologyKey]);

  const flush = useCallback(
    (sourceTabs: readonly EditorTab[], sourceActiveTabId: string) =>
      persistTopologyValue(
        deriveEditorSessionTopology(sourceTabs, sourceActiveTabId),
        true,
      ),
    [persistTopologyValue],
  );
  const getStatusForE2e = useCallback(() => statusRef.current, []);

  return { status, flush, getStatusForE2e };
}
