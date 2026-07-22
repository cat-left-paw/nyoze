import { useCallback, useRef } from "react";
import type { RefObject } from "react";
import type {
  EditorCoreHandle,
  MarkdownDocumentOptions,
} from "../../editor-core/types";
import type { FrontmatterFields } from "../../editor-core/io/frontmatter";
import {
  parseFrontmatterFields,
  splitLeadingFrontmatter,
} from "../../editor-core/io/frontmatter";
import type { LineBreakPolicy } from "../../editor-core/types";
import type { WritingMode } from "../../settings/types";
import type {
  EditorTab,
  ActiveTabPatch,
  LineBreakPolicyTargetTab,
} from "./useAppUiState";
import { generateTabId, generateUntitledName } from "./useAppUiState";
import type { SavedFileStat } from "../utils/externalEditConflict";
import { countBodyCharacters } from "../utils/countBodyCharacters";
import {
  buildTabLeaveContentFields,
  resolveTabLeaveDirtyState,
} from "./tabLeaveSnapshot";
import {
  shouldGuardSourceModeBeforeTabClose,
  type GuardResult,
} from "./sourceModeDraftGuard";
import { detectEol } from "../../editor-core/io/eolHelper";
import {
  createShortcutReferenceEditorTab,
  deriveShortcutReferenceTabCore,
} from "../internalDocs/createShortcutReferenceTab";
import { SHORTCUT_REFERENCE_INTERNAL_DOC_ID } from "../internalDocs/internalDocIds";
import type { ShortcutBundleKey } from "../internalDocs/resolveShortcutBundleKey";

export type TabManagerDeps = {
  coreRef: RefObject<EditorCoreHandle | null>;
  tabs: EditorTab[];
  activeTabId: string;
  activeTab: EditorTab;
  setActiveTabId: (id: string) => void;
  patchActiveTab: (patch: ActiveTabPatch) => void;
  patchTab: (tabId: string, patch: ActiveTabPatch) => void;
  addTab: (tab: EditorTab) => void;
  removeTab: (tabId: string) => void;
  setTabs: React.Dispatch<React.SetStateAction<EditorTab[]>>;
  setSuppressNextDirty: (value: boolean) => void;
  ensureSafeLineBreakPolicyBeforeDocumentLoad: (options?: {
    targetTabId?: string;
    targetTabSnapshot?: LineBreakPolicyTargetTab;
  }) => boolean;
  closePlainEditModes: () => void;
  refreshHeadings: () => void;
  confirmContinueWithUnsavedChanges: (options?: {
    forcePrompt?: boolean;
    saveTargetTab?: UnsavedChangesSaveTargetTab;
  }) => Promise<boolean>;
  onTabContentLoaded: (
    markdown: string,
    frontmatterFields: FrontmatterFields,
    characterCount: number,
    documentMarkdownOptions: MarkdownDocumentOptions,
  ) => void;
  /** SEC-5: Notify main of the active file path before loading a document. */
  notifyActiveDocumentPath?: (filePath: string | null) => void;
  /** Capture the current editor surface scroll before leaving the active tab. */
  captureEditorScroll: () => Pick<EditorTab, "scrollTop" | "scrollLeft">;
  /** BETA-Q1: Reset editor scroll to document start after loading a new document. */
  resetEditorScroll: () => void;
  /** Restore saved editor scroll when returning to the same tab/document. */
  restoreEditorScroll: (
    position: Pick<EditorTab, "scrollTop" | "scrollLeft">,
  ) => void;
  /** New-tab default writing mode from app settings. */
  defaultWritingMode: WritingMode;
  /** New-tab default line break policy from app settings. */
  defaultLineBreakPolicy: LineBreakPolicy;
  /** BETA-SP1: Source Mode ドラフト消失防止ガード。 */
  guardSourceModeDraft: () => Promise<GuardResult>;
};

/** Maximum number of simultaneously open tabs. */
export const MAX_OPEN_TABS = 12;

/** Result of switchTab to propagate Source Mode guard cancellation. */
export type TabSwitchResult = "switched" | "cancelled";
export type ActiveTabLoadResult =
  | "loaded"
  | "activated-existing"
  | "cancelled";

export type UnsavedChangesSaveTargetTab = Pick<
  EditorTab,
  "id" | "title" | "filePath" | "savedStat"
>;

type TabLeaveSnapshotPrep = {
  dirty: boolean;
  markdown: string;
  frontmatterFields: FrontmatterFields;
  characterCount: number;
};

/** Result of addNewTab / openFileInTab to distinguish tab-limit from guard cancel. */
export type TabAddResult = "added" | "tab-limit" | "cancelled";


function makeEmptyTab(
  defaultWritingMode: WritingMode,
  defaultLineBreakPolicy: LineBreakPolicy,
): EditorTab {
  return {
    id: generateTabId(),
    title: generateUntitledName(),
    dirty: false,
    filePath: null,
    markdownSnapshot: "",
    cleanMarkdownSnapshot: "",
    frontmatterFields: {},
    documentMarkdownOptions: { preserveEmptyParagraphs: false },
    characterCount: 0,
    savedStat: null,
    writingMode: defaultWritingMode,
    writingModeFollowsTypeRecommendation: true,
    lineBreakPolicy: defaultLineBreakPolicy,
    eol: "lf",
    scrollTop: 0,
    scrollLeft: 0,
    viewportAnchorPmPos: null,
    viewportAnchorTextOffset: null,
    viewportAnchorTextTotal: null,
    sourceModeTopOffset: null,
  };
}

export function useTabManager(deps: TabManagerDeps) {
  const switchingRef = useRef(false);

  // Keep a ref to always access the latest deps without re-creating callbacks
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const prepareTabLeaveSnapshot = useCallback((): TabLeaveSnapshotPrep | null => {
    const d = depsRef.current;
    const core = d.coreRef.current;
    if (!core) return null;

    const paragraphPlainOverlayChanged =
      core.hasParagraphPlainPendingOverlayChanges();
    if (!core.commitParagraphPlainIfActive()) return null;

    const markdown = core.peekMarkdown();
    const { frontmatterFields, characterCount } =
      buildTabLeaveContentFields(markdown);
    const dirty = resolveTabLeaveDirtyState({
      internalDocId: d.activeTab.internalDocId,
      paragraphPlainOverlayChanged,
      currentDirty: d.activeTab.dirty,
      cleanMarkdownSnapshot: d.activeTab.cleanMarkdownSnapshot,
      currentMarkdown: markdown,
    });

    d.patchActiveTab({
      dirty,
      markdownSnapshot: markdown,
      frontmatterFields,
      characterCount,
    });

    return {
      dirty,
      markdown,
      frontmatterFields,
      characterCount,
    };
  }, []);

  /**
   * Read the current active tab plus the live core markdown as a self-contained snapshot.
   * Used when we need to restore the current document after a temporary tab switch.
   */
  const captureActiveTabSnapshot = useCallback((): EditorTab | null => {
    const d = depsRef.current;
    const tabLeaveState = prepareTabLeaveSnapshot();
    if (!tabLeaveState) return null;
    const scrollPosition = d.captureEditorScroll();
    return {
      ...d.activeTab,
      dirty: tabLeaveState.dirty,
      markdownSnapshot: tabLeaveState.markdown,
      frontmatterFields: tabLeaveState.frontmatterFields,
      characterCount: tabLeaveState.characterCount,
      scrollTop: scrollPosition.scrollTop,
      scrollLeft: scrollPosition.scrollLeft,
    };
  }, [prepareTabLeaveSnapshot]);

  /**
   * Snapshot the current active tab's editor content into its tab record.
   * Syncs markdownSnapshot, frontmatterFields, and characterCount atomically.
   */
  const snapshotActiveTab = useCallback((): boolean => {
    const d = depsRef.current;
    const snapshot = captureActiveTabSnapshot();
    if (!snapshot) return false;
    d.patchActiveTab({
      dirty: snapshot.dirty,
      markdownSnapshot: snapshot.markdownSnapshot,
      frontmatterFields: snapshot.frontmatterFields,
      characterCount: snapshot.characterCount,
      scrollTop: snapshot.scrollTop,
      scrollLeft: snapshot.scrollLeft,
    });
    return true;
  }, [captureActiveTabSnapshot]);

  /**
   * Restore a tab's snapshot into the editor.
   * NOTE: Must prepare the core with the target tab's effective policy first,
   * because restore still reparses markdown through core.loadMarkdown().
   */
  const restoreTab = useCallback((tab: EditorTab) => {
    const d = depsRef.current;
    const core = d.coreRef.current;
    if (!core) return;
    d.notifyActiveDocumentPath?.(tab.filePath ?? null);
    d.setSuppressNextDirty(true);
    d.ensureSafeLineBreakPolicyBeforeDocumentLoad({
      targetTabSnapshot: tab,
    });
    core.loadMarkdown(tab.markdownSnapshot);
    core.clearHistory();
    core.setReadOnly(Boolean(tab.internalDocId));
    d.closePlainEditModes();
    d.refreshHeadings();
    d.onTabContentLoaded(
      tab.markdownSnapshot,
      tab.frontmatterFields,
      tab.characterCount,
      core.getDocumentMarkdownOptions(),
    );
    d.restoreEditorScroll({
      scrollTop: tab.scrollTop,
      scrollLeft: tab.scrollLeft,
    });
  }, []);

  /**
   * Switch to a different tab.
   * BETA-SP1: Source Mode ガードを snapshotActiveTab() の前に実行する。
   */
  const switchTab = useCallback(
    async (targetTabId: string,
      /** When the tab row is patched in the same tick, pass the resolved row for restore. */
      overrideTargetTab?: EditorTab,
    ): Promise<TabSwitchResult> => {
      const d = depsRef.current;
      if (targetTabId === d.activeTabId) return "switched";
      if (switchingRef.current) return "cancelled";
      switchingRef.current = true;
      try {
        const smResult = await d.guardSourceModeDraft();
        if (smResult === "cancelled") return "cancelled";
        if (!snapshotActiveTab()) return "cancelled";
        const targetTab =
          overrideTargetTab && overrideTargetTab.id === targetTabId
            ? overrideTargetTab
            : d.tabs.find((t) => t.id === targetTabId);
        if (!targetTab) return "cancelled";
        d.setActiveTabId(targetTabId);
        restoreTab(targetTab);
        return "switched";
      } finally {
        switchingRef.current = false;
      }
    },
    [snapshotActiveTab, restoreTab],
  );

  /**
   * Add a new empty tab and switch to it.
   * Returns 'added', 'tab-limit', or 'cancelled' (Source Mode guard).
   */
  const addNewTab = useCallback(async (): Promise<TabAddResult> => {
    const d = depsRef.current;
    if (d.tabs.length >= MAX_OPEN_TABS) return "tab-limit";
    if (switchingRef.current) return "cancelled";
    switchingRef.current = true;
    try {
      const smResult = await d.guardSourceModeDraft();
      if (smResult === "cancelled") return "cancelled";
      if (!snapshotActiveTab()) return "cancelled";
      const newTab = makeEmptyTab(
        d.defaultWritingMode,
        d.defaultLineBreakPolicy,
      );
      d.addTab(newTab);
      d.setActiveTabId(newTab.id);
      // New tab is an empty document — keep the app default tab policy as-is.
      const core = d.coreRef.current;
      if (core) {
        d.notifyActiveDocumentPath?.(newTab.filePath ?? null);
        d.setSuppressNextDirty(true);
        core.loadMarkdown(newTab.markdownSnapshot);
        core.clearHistory();
        core.setReadOnly(false);
        d.closePlainEditModes();
        d.refreshHeadings();
        d.onTabContentLoaded(
          newTab.markdownSnapshot,
          newTab.frontmatterFields,
          newTab.characterCount,
          core.getDocumentMarkdownOptions(),
        );
        d.resetEditorScroll();
        window.setTimeout(() => {
          depsRef.current.coreRef.current?.focusEditor();
        }, 0);
      }
      return "added";
    } finally {
      switchingRef.current = false;
    }
  }, [snapshotActiveTab]);

  /** Close a tab. If dirty, shows unsaved guard. Last tab cannot be closed. */
  const closeTab = useCallback(
    async (tabId: string) => {
      if (switchingRef.current) return;
      switchingRef.current = true;
      try {
        const d = depsRef.current;

        // Last tab cannot be closed
        if (d.tabs.length <= 1) return;

        const tabToClose = d.tabs.find((t) => t.id === tabId);
        if (!tabToClose) return;
        const wasActiveTab = tabId === d.activeTabId;
        const shouldTemporarilyActivateDirtyTab =
          !wasActiveTab && tabToClose.dirty;
        let previousActiveTabSnapshot: EditorTab | null = null;

        let smResult: GuardResult = "proceed";
        if (
          shouldGuardSourceModeBeforeTabClose({
            activeTabId: d.activeTabId,
            closingTabId: tabId,
            closingTabDirty: tabToClose.dirty,
          })
        ) {
          // BETA-SP1: guard only when closing this tab leaves the current
          // active document. Background clean tab close must not touch the
          // current Source Mode session.
          smResult = await d.guardSourceModeDraft();
          if (smResult === "cancelled") return;
        }

        const activeTabLeaveState =
          wasActiveTab
            ? prepareTabLeaveSnapshot()
            : null;
        if (wasActiveTab && !activeTabLeaveState) return;

        // If closing the active tab and it is dirty, run unsaved guard.
        // When smResult === "resolved", save/discard already handled the draft
        // and the user has been prompted — skip the normal dirty guard to avoid
        // a second prompt.
        if (
          smResult !== "resolved" &&
          wasActiveTab &&
          (activeTabLeaveState?.dirty ?? tabToClose.dirty)
        ) {
          const canProceed = await d.confirmContinueWithUnsavedChanges({
            forcePrompt: true,
          });
          if (!canProceed) return;
        }

        // For non-active dirty tabs: snapshot (safe — guard already ran),
        // switch to the target tab, then show its unsaved guard.
        if (shouldTemporarilyActivateDirtyTab) {
          previousActiveTabSnapshot = captureActiveTabSnapshot();
          if (!previousActiveTabSnapshot) return;
          d.patchActiveTab({
            dirty: previousActiveTabSnapshot.dirty,
            markdownSnapshot: previousActiveTabSnapshot.markdownSnapshot,
            frontmatterFields: previousActiveTabSnapshot.frontmatterFields,
            characterCount: previousActiveTabSnapshot.characterCount,
            scrollTop: previousActiveTabSnapshot.scrollTop,
            scrollLeft: previousActiveTabSnapshot.scrollLeft,
          });
          d.setActiveTabId(tabId);
          restoreTab(tabToClose);
          const canProceed = await d.confirmContinueWithUnsavedChanges({
            forcePrompt: true,
            saveTargetTab: {
              id: tabToClose.id,
              title: tabToClose.title,
              filePath: tabToClose.filePath,
              savedStat: tabToClose.savedStat,
            },
          });
          if (!canProceed) {
            d.setActiveTabId(previousActiveTabSnapshot.id);
            restoreTab(previousActiveTabSnapshot);
            return;
          }
        }

        const remainingTabs = d.tabs.filter((t) => t.id !== tabId);

        if (wasActiveTab) {
          // Find adjacent tab to switch to
          const closedIndex = d.tabs.findIndex((t) => t.id === tabId);
          const nextTab =
            remainingTabs[Math.min(closedIndex, remainingTabs.length - 1)];
          d.removeTab(tabId);
          d.setActiveTabId(nextTab.id);
          restoreTab(nextTab);
        } else if (previousActiveTabSnapshot) {
          d.removeTab(tabId);
          d.setActiveTabId(previousActiveTabSnapshot.id);
          restoreTab(previousActiveTabSnapshot);
        } else {
          d.removeTab(tabId);
        }
      } finally {
        switchingRef.current = false;
      }
    },
    [captureActiveTabSnapshot, prepareTabLeaveSnapshot, restoreTab],
  );

  /**
   * Open a file into a new tab (or activate an existing tab with that path).
   * Returns 'added', 'tab-limit', or 'cancelled' (Source Mode guard).
   * BETA-SP1: Source Mode ガードを snapshotActiveTab() の前に実行する。
   */
  const openFileInTab = useCallback(
    async (
      filePath: string | null,
      title: string,
      content: string,
      savedStat?: SavedFileStat,
    ): Promise<TabAddResult> => {
      const d = depsRef.current;
      const resolvedPath = filePath || null;

      // Check for duplicate: if filePath is already open, just activate that tab
      const existingTab = resolvedPath
        ? d.tabs.find((t) => t.filePath !== null && t.filePath === resolvedPath)
        : undefined;
      if (existingTab) {
        const switchResult = await switchTab(existingTab.id);
        return switchResult === "cancelled" ? "cancelled" : "added";
      }

      // Tab limit guard
      if (d.tabs.length >= MAX_OPEN_TABS) return "tab-limit";

      // BETA-SP1: Source Mode guard before snapshot
      const smResult = await d.guardSourceModeDraft();
      if (smResult === "cancelled") return "cancelled";

      // Snapshot current tab, create new one with the loaded content
      if (!snapshotActiveTab()) return "cancelled";

      const { frontmatterPrefix } = splitLeadingFrontmatter(content);
      const fields = parseFrontmatterFields(frontmatterPrefix);
      const charCount = countBodyCharacters(content);

      const eol = detectEol(content);

      const newTab: EditorTab = {
        id: generateTabId(),
        title,
        dirty: false,
        filePath: resolvedPath,
        markdownSnapshot: content,
        cleanMarkdownSnapshot: content,
        frontmatterFields: fields,
        documentMarkdownOptions: { preserveEmptyParagraphs: false },
        characterCount: charCount,
        savedStat: savedStat ?? null,
        writingMode: d.defaultWritingMode,
        writingModeFollowsTypeRecommendation: true,
        lineBreakPolicy: d.defaultLineBreakPolicy,
        eol,
        scrollTop: 0,
        scrollLeft: 0,
        viewportAnchorPmPos: null,
        viewportAnchorTextOffset: null,
        viewportAnchorTextTotal: null,
        sourceModeTopOffset: null,
      };

      d.addTab(newTab);
      d.setActiveTabId(newTab.id);

      // File load — use ensureSafe for "load document" path
      const core = d.coreRef.current;
      if (core) {
        d.notifyActiveDocumentPath?.(resolvedPath);
        d.setSuppressNextDirty(true);
        d.ensureSafeLineBreakPolicyBeforeDocumentLoad({
          targetTabSnapshot: newTab,
        });
        core.loadMarkdown(content);
        core.clearHistory();
        core.setReadOnly(false);
        d.closePlainEditModes();
        d.refreshHeadings();
        d.onTabContentLoaded(
          content,
          fields,
          charCount,
          core.getDocumentMarkdownOptions(),
        );
        d.resetEditorScroll();
      }
      return "added";
    },
    [snapshotActiveTab, switchTab],
  );

  /**
   * Load a file into the currently active tab (replacing its content).
   * If dirty, runs unsaved guard first. If same filePath is already
   * open in another tab, switches to that tab instead.
   * BETA-SP1: Source Mode ガードを dirty チェックの前に実行する。
   */
  const loadIntoActiveTab = useCallback(
    async (
      filePath: string | null,
      title: string,
      content: string,
      savedStat?: SavedFileStat,
    ): Promise<ActiveTabLoadResult> => {
      const d = depsRef.current;
      const resolvedPath = filePath || null;

      // If another tab already has this file open, switch to it
      // BETA-SP1: switchTab は async 化済み。Source Mode ガードはその中で走る。
      if (resolvedPath) {
        const existingTab = d.tabs.find(
          (t) =>
            t.id !== d.activeTabId &&
            t.filePath !== null &&
            t.filePath === resolvedPath,
        );
        if (existingTab) {
          const switchResult = await switchTab(existingTab.id);
          if (switchResult === "cancelled") return "cancelled";
          return "activated-existing";
        }
      }

      // BETA-SP1: Source Mode guard before dirty check.
      // "resolved" = save/discard で Source Mode draft を解決済み → dirty guard 不要。
      // "proceed"  = Source Mode 非該当 or draft なし → dirty は PM Doc 基準で正確。
      const smResult = await d.guardSourceModeDraft();
      if (smResult === "cancelled") return "cancelled";
      const activeTabLeaveState = prepareTabLeaveSnapshot();
      if (!activeTabLeaveState) return "cancelled";

      // When smResult === "resolved", save/discard already handled the draft
      // and the user has been prompted. Skip the normal dirty guard to avoid
      // a second prompt (depsRef.current is stale within this async continuation).
      if (smResult !== "resolved" && activeTabLeaveState.dirty) {
        const canProceed = await d.confirmContinueWithUnsavedChanges();
        if (!canProceed) return "cancelled";
      }

      const { frontmatterPrefix } = splitLeadingFrontmatter(content);
      const fields = parseFrontmatterFields(frontmatterPrefix);
      const charCount = countBodyCharacters(content);
      const eol = detectEol(content);

      // Update active tab metadata
      d.patchActiveTab({
        title,
        filePath: resolvedPath,
        dirty: false,
        markdownSnapshot: content,
        cleanMarkdownSnapshot: content,
        frontmatterFields: fields,
        documentMarkdownOptions: { preserveEmptyParagraphs: false },
        characterCount: charCount,
        savedStat: savedStat ?? null,
        writingModeFollowsTypeRecommendation: true,
        eol,
        scrollTop: 0,
        scrollLeft: 0,
        viewportAnchorPmPos: null,
        viewportAnchorTextOffset: null,
        viewportAnchorTextTotal: null,
        sourceModeTopOffset: null,
        internalDocId: undefined,
        internalShortcutBundleKey: undefined,
      });

      // Load into editor
      const core = d.coreRef.current;
      if (core) {
        d.notifyActiveDocumentPath?.(resolvedPath);
        d.setSuppressNextDirty(true);
        d.ensureSafeLineBreakPolicyBeforeDocumentLoad({
          targetTabSnapshot: {
            id: d.activeTab.id,
            frontmatterFields: fields,
            lineBreakPolicy: d.activeTab.lineBreakPolicy,
          },
        });
        core.loadMarkdown(content);
        core.clearHistory();
        core.setReadOnly(false);
        d.closePlainEditModes();
        d.refreshHeadings();
        d.onTabContentLoaded(
          content,
          fields,
          charCount,
          core.getDocumentMarkdownOptions(),
        );
        d.resetEditorScroll();
      }
      return "loaded";
    },
    [prepareTabLeaveSnapshot, switchTab],
  );

  const openOrFocusShortcutReferenceTab = useCallback(
    async (args: {
      title: string;
      markdown: string;
      bundleKey: ShortcutBundleKey;
    }): Promise<TabAddResult> => {
      const d = depsRef.current;
      const existing = d.tabs.find(
        (t) => t.internalDocId === SHORTCUT_REFERENCE_INTERNAL_DOC_ID,
      );
      if (existing) {
        const needsContentRefresh =
          existing.internalShortcutBundleKey !== args.bundleKey ||
          existing.markdownSnapshot !== args.markdown ||
          existing.title !== args.title;

        if (needsContentRefresh) {
          const core = deriveShortcutReferenceTabCore(
            args.title,
            args.markdown,
            existing.lineBreakPolicy,
            args.bundleKey,
          );
          const merged: EditorTab = {
            ...existing,
            ...core,
            dirty: false,
          };
          d.patchTab(existing.id, {
            ...core,
            dirty: false,
          });

          if (d.activeTabId === existing.id) {
            restoreTab(merged);
            return "added";
          }

          const r = await switchTab(existing.id, merged);
          return r === "cancelled" ? "cancelled" : "added";
        }

        if (d.activeTabId === existing.id) {
          return "added";
        }

        const r = await switchTab(existing.id);
        return r === "cancelled" ? "cancelled" : "added";
      }

      if (d.tabs.length >= MAX_OPEN_TABS) return "tab-limit";
      const smResult = await d.guardSourceModeDraft();
      if (smResult === "cancelled") return "cancelled";
      if (!snapshotActiveTab()) return "cancelled";
      const newTab = createShortcutReferenceEditorTab(
        args.title,
        args.markdown,
        d.defaultLineBreakPolicy,
        args.bundleKey,
      );
      d.addTab(newTab);
      d.setActiveTabId(newTab.id);
      restoreTab(newTab);
      return "added";
    },
    [restoreTab, snapshotActiveTab, switchTab],
  );

  return {
    switchTab,
    addNewTab,
    closeTab,
    openFileInTab,
    loadIntoActiveTab,
    snapshotActiveTab,
    openOrFocusShortcutReferenceTab,
  };
}
