import { useCallback, useEffect, useRef, useState } from "react";
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
  applyTabLeaveSnapshotOntoCurrentTab,
} from "./tabLeaveSnapshot";
import {
  deferTabLeaveSnapshotApplyForE2e,
} from "../utils/savedStatPatchLatchForE2e";
import {
  shouldGuardSourceModeBeforeTabClose,
  type GuardResult,
} from "./sourceModeDraftGuard";
import { detectEol } from "../../editor-core/io/eolHelper";
import {
  prepareLocalImeDocumentLeave,
  proveLocalImeDocumentLeaveAfterBarrier,
  resolveLocalImeDocumentLeaveDerivedDirty,
  resolveLocalImeDocumentLeavePromptAuthority,
  type LocalImeDocumentLeaveCapture,
  type LocalImeDocumentLeaveDirtyNotice,
  type LocalImeDocumentLeaveOperation,
  type LocalImeDocumentLeaveProof,
} from "./localImeDocumentLeaveSafety";
import {
  applyFileExplorerDeleteTabFinalizePlan,
  demoteFileExplorerDeleteTabFinalizePlanToDetach,
  proveFileExplorerDeleteTabPlan,
  resolveFileExplorerDeleteTabFinalizePlan,
  resolveFileExplorerDeleteTabPreflight,
  type FileExplorerDeleteTabFinalizePlan,
  type FileExplorerDeleteTabFinalizeResult,
  type FileExplorerDeleteTabPlan,
  type FileExplorerDeleteTabPreflight,
  type FileExplorerDeleteTabState,
} from "../utils/fileExplorerDeleteTabPlan";
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
    localImeDocumentActionPrepared?: boolean;
    proveBeforeDiskWrite?: () => boolean;
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
  /**
   * LOCAL-WINDOW-PACKAGED-REARM-POLISH1: 現在 render 時点の**実効**書字方向
   * （手動切替 > frontmatter > Document Type 既定を解決済みの値）。同一 tab の
   * document 切替完了を、新文書の書字方向が反映された commit で確定するために使う。
   */
  effectiveWritingMode: WritingMode;
  /** New-tab default line break policy from app settings. */
  defaultLineBreakPolicy: LineBreakPolicy;
  /** BETA-SP1: Source Mode ドラフト消失防止ガード。 */
  guardSourceModeDraft: (options?: {
    localImeDocumentActionPrepared?: boolean;
    proveBeforeDiskWrite?: () => boolean;
  }) => Promise<GuardResult>;
  localImeDraftDirtyOwnerTabId: string | null;
  /**
   * FILE-EXPLORER-DELETE-OPEN-TABS1: active 文書の Source Mode draft /
   * Paragraph Plain 未確定 overlay 入力の probe。`tab.dirty` には即時反映されないため、
   * 削除 preflight ではこれも dirty として扱う。
   */
  hasActiveDocumentUncommittedDraft?: () => boolean;
  readLocalImeDraftDirtyNotice: () => LocalImeDocumentLeaveDirtyNotice;
  prepareLocalImeDocumentAction: (
    reason: LocalImeDocumentLeaveOperation,
  ) => { readonly status: string };
  isLocalImeDocumentActionPending: () => boolean;
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
  "id" | "title" | "filePath" | "savedStat" | "eol"
>;

/** Result of addNewTab / openFileInTab to distinguish tab-limit from guard cancel. */
export type TabAddResult = "added" | "tab-limit" | "cancelled";

/** FILE-EXPLORER-DELETE-OPEN-TABS1: trash 成功後の tab finalize の結果（正本は pure module）。 */
export type { FileExplorerDeleteTabFinalizeResult };


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
  /**
   * FILE-EXPLORER-DELETE-OPEN-TABS1: File Explorer 削除の操作 lease。
   * `trashItem()` の直前から finalize 完了までの間だけ削除対象 path を保持し、
   * `switchingRef` を握って tab lifecycle 操作を止める。
   */
  const deleteTabLeaseRef = useRef<string | null>(null);

  // Keep a ref to always access the latest deps without re-creating callbacks
  const depsRef = useRef(deps);
  depsRef.current = deps;

  /**
   * LOCAL-WINDOW-PACKAGED-REARM-POLISH1: 同一 tab の document 切替の完了通知。
   *
   * `loadMarkdown()` 直後に完了させると、新文書の tab metadata（frontmatter /
   * `writingModeFollowsTypeRecommendation`）と実効書字方向がまだ反映されていないため、
   * 書字方向の異なる文書へ切り替えると旧方向で先に取得してしまう。nonce は
   * `patchActiveTab()` と同じ commit で進めるので、この effect が走る時点では
   * 新 tab row から解決された `--editor-writing-mode` が既に適用済みである
   * （`useAppUiState` の適用 effect は同じ commit の**先**に宣言されている）。
   * timer / rAF は使わず、実 state / DOM 反映に結び付いた typed completion だけを使う。
   */
  const [documentSwitchNonce, setDocumentSwitchNonce] = useState(0);
  const completedDocumentSwitchNonceRef = useRef(0);
  useEffect(() => {
    if (documentSwitchNonce === completedDocumentSwitchNonceRef.current) return;
    completedDocumentSwitchNonceRef.current = documentSwitchNonce;
    const d = depsRef.current;
    d.coreRef.current?.completeLocalImeLocalWindowTransition(
      "document-switch",
      d.effectiveWritingMode,
    );
  }, [documentSwitchNonce]);

  const readLocalImeDocumentLeaveState = useCallback(() => {
    const d = depsRef.current;
    return {
      activeTabId: d.activeTabId,
      dirtyOwnerTabId: d.localImeDraftDirtyOwnerTabId,
      dirtyNotice: d.readLocalImeDraftDirtyNotice(),
      tabs: d.tabs,
      documentActionPending: d.isLocalImeDocumentActionPending(),
    };
  }, []);

  const beginDocumentLeave = useCallback(
    (
      operation: LocalImeDocumentLeaveOperation,
    ): LocalImeDocumentLeaveProof<EditorTab> => {
      const d = depsRef.current;
      return prepareLocalImeDocumentLeave({
        operation,
        readBeforeBarrier: () => ({
          activeTabId: d.activeTabId,
          dirtyOwnerTabId: d.localImeDraftDirtyOwnerTabId,
          dirtyNotice: d.readLocalImeDraftDirtyNotice(),
        }),
        prepareDocumentAction: d.prepareLocalImeDocumentAction,
        readAfterBarrier: readLocalImeDocumentLeaveState,
      });
    },
    [readLocalImeDocumentLeaveState],
  );

  const reproveDocumentLeave = useCallback(
    (capture: LocalImeDocumentLeaveCapture): LocalImeDocumentLeaveProof<EditorTab> =>
      proveLocalImeDocumentLeaveAfterBarrier({
        capture,
        state: readLocalImeDocumentLeaveState(),
      }),
    [readLocalImeDocumentLeaveState],
  );

  const prepareTabLeaveSnapshot = useCallback((
    capture: LocalImeDocumentLeaveCapture,
  ): EditorTab | null => {
    const d = depsRef.current;
    const core = d.coreRef.current;
    if (!core) return null;
    const proofBeforeSnapshot = reproveDocumentLeave(capture);
    if (!proofBeforeSnapshot.ok) return null;

    const paragraphPlainOverlayChanged =
      core.hasParagraphPlainPendingOverlayChanges();
    if (!core.commitParagraphPlainIfActive()) return null;

    let markdown: string;
    try {
      markdown = core.peekMarkdown();
    } catch {
      return null;
    }
    const proofAfterSnapshot = reproveDocumentLeave(capture);
    if (!proofAfterSnapshot.ok) return null;
    const { frontmatterFields, characterCount } =
      buildTabLeaveContentFields(markdown);
    const canonicalDirty = resolveTabLeaveDirtyState({
      internalDocId: proofAfterSnapshot.activeTab.internalDocId,
      paragraphPlainOverlayChanged,
      currentDirty: proofAfterSnapshot.activeTab.dirty,
      cleanMarkdownSnapshot: proofAfterSnapshot.activeTab.cleanMarkdownSnapshot,
      currentMarkdown: markdown,
    });
    const dirty = resolveLocalImeDocumentLeaveDerivedDirty({
      canonicalDirty,
      capture,
      tabId: proofAfterSnapshot.activeTab.id,
      internalDocument: Boolean(proofAfterSnapshot.activeTab.internalDocId),
    });
    const scrollPosition = d.captureEditorScroll();
    const snapshot: EditorTab = {
      ...proofAfterSnapshot.activeTab,
      dirty,
      markdownSnapshot: markdown,
      frontmatterFields,
      characterCount,
      scrollTop: scrollPosition.scrollTop,
      scrollLeft: scrollPosition.scrollLeft,
    };

    // active IDを後から再解決せず、captureしたsource tabへfunctional updateする。
    // setActiveTabIdと同一React batchになっても元tab snapshotを失わない。
    const applySnapshot = () => {
      d.setTabs((tabs) =>
        tabs.map((tab) =>
          tab.id === capture.activeTabId
            ? applyTabLeaveSnapshotOntoCurrentTab(tab, snapshot)
            : tab,
        ),
      );
    };
    // E2E-only: production never arms this, so apply は同期のまま。
    if (!deferTabLeaveSnapshotApplyForE2e(applySnapshot)) {
      applySnapshot();
    }
    return snapshot;
  }, [reproveDocumentLeave]);

  /**
   * Read the current active tab plus the live core markdown as a self-contained snapshot.
   * Used when we need to restore the current document after a temporary tab switch.
   */
  const captureActiveTabSnapshot = useCallback((
    capture: LocalImeDocumentLeaveCapture,
  ): EditorTab | null => prepareTabLeaveSnapshot(capture), [prepareTabLeaveSnapshot]);

  /**
   * Snapshot the current active tab's editor content into its tab record.
   * Syncs markdownSnapshot, frontmatterFields, and characterCount atomically.
   */
  const snapshotActiveTabWithCapture = useCallback((
    capture: LocalImeDocumentLeaveCapture,
  ): boolean => captureActiveTabSnapshot(capture) !== null, [captureActiveTabSnapshot]);

  const snapshotActiveTab = useCallback((): boolean => {
    const prepared = beginDocumentLeave("snapshot-active-tab");
    return prepared.ok && snapshotActiveTabWithCapture(prepared.capture);
  }, [beginDocumentLeave, snapshotActiveTabWithCapture]);

  /**
   * Restore a tab's snapshot into the editor.
   * NOTE: Must prepare the core with the target tab's effective policy first,
   * because restore still reparses markdown through core.loadMarkdown().
   */
  const restoreTab = useCallback((tab: EditorTab): boolean => {
    const d = depsRef.current;
    const core = d.coreRef.current;
    if (!core) return false;
    const previousPath = d.activeTab.filePath ?? null;
    d.notifyActiveDocumentPath?.(tab.filePath ?? null);
    d.setSuppressNextDirty(true);
    d.ensureSafeLineBreakPolicyBeforeDocumentLoad({
      targetTabSnapshot: tab,
    });
    if (!core.loadMarkdown(tab.markdownSnapshot)) {
      d.setSuppressNextDirty(false);
      d.notifyActiveDocumentPath?.(previousPath);
      return false;
    }
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
    return true;
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
      const prepared = beginDocumentLeave("tab-switch");
      if (!prepared.ok) return "cancelled";
      switchingRef.current = true;
      try {
        const smResult = await d.guardSourceModeDraft({
          localImeDocumentActionPrepared: true,
          proveBeforeDiskWrite: () => reproveDocumentLeave(prepared.capture).ok,
        });
        if (smResult === "cancelled") return "cancelled";
        if (!snapshotActiveTabWithCapture(prepared.capture)) return "cancelled";
        const targetTab =
          overrideTargetTab && overrideTargetTab.id === targetTabId
            ? overrideTargetTab
            : d.tabs.find((t) => t.id === targetTabId);
        if (!targetTab) return "cancelled";
        if (!restoreTab(targetTab)) return "cancelled";
        d.setActiveTabId(targetTabId);
        return "switched";
      } finally {
        switchingRef.current = false;
      }
    },
    [beginDocumentLeave, reproveDocumentLeave, snapshotActiveTabWithCapture, restoreTab],
  );

  /**
   * Add a new empty tab and switch to it.
   * Returns 'added', 'tab-limit', or 'cancelled' (Source Mode guard).
   */
  const addNewTab = useCallback(async (): Promise<TabAddResult> => {
    const d = depsRef.current;
    if (d.tabs.length >= MAX_OPEN_TABS) return "tab-limit";
    if (switchingRef.current) return "cancelled";
    const prepared = beginDocumentLeave("tab-add");
    if (!prepared.ok) return "cancelled";
    switchingRef.current = true;
    try {
      const smResult = await d.guardSourceModeDraft({
        localImeDocumentActionPrepared: true,
        proveBeforeDiskWrite: () => reproveDocumentLeave(prepared.capture).ok,
      });
      if (smResult === "cancelled") return "cancelled";
      if (!snapshotActiveTabWithCapture(prepared.capture)) return "cancelled";
      const newTab = makeEmptyTab(
        d.defaultWritingMode,
        d.defaultLineBreakPolicy,
      );
      // New tab is an empty document — keep the app default tab policy as-is.
      const core = d.coreRef.current;
      if (core) {
        d.notifyActiveDocumentPath?.(newTab.filePath ?? null);
        d.setSuppressNextDirty(true);
        if (!core.loadMarkdown(newTab.markdownSnapshot)) {
          d.setSuppressNextDirty(false);
          d.notifyActiveDocumentPath?.(d.activeTab.filePath ?? null);
          return "cancelled";
        }
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
      d.addTab(newTab);
      d.setActiveTabId(newTab.id);
      return "added";
    } finally {
      switchingRef.current = false;
    }
  }, [beginDocumentLeave, reproveDocumentLeave, snapshotActiveTabWithCapture]);

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
        const prepared =
          wasActiveTab || shouldTemporarilyActivateDirtyTab
            ? beginDocumentLeave(
                wasActiveTab
                  ? "tab-close-active"
                  : "tab-close-background-activation",
              )
            : null;
        if (prepared && !prepared.ok) return;

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
          smResult = await d.guardSourceModeDraft({
            localImeDocumentActionPrepared: prepared?.ok === true,
            proveBeforeDiskWrite: prepared?.ok
              ? () => reproveDocumentLeave(prepared.capture).ok
              : undefined,
          });
          if (smResult === "cancelled") return;
        }

        const activeTabLeaveSnapshot =
          wasActiveTab && prepared?.ok
            ? captureActiveTabSnapshot(prepared.capture)
            : null;
        if (wasActiveTab && !activeTabLeaveSnapshot) return;

        // If closing the active tab and it is dirty, run unsaved guard.
        // When smResult === "resolved", save/discard already handled the draft
        // and the user has been prompted — skip the normal dirty guard to avoid
        // a second prompt.
        const activeClosePromptAuthority =
          activeTabLeaveSnapshot
            ? resolveLocalImeDocumentLeavePromptAuthority({
                disposition: "destructive",
                derivedDirty: activeTabLeaveSnapshot.dirty,
              })
            : null;
        if (
          smResult !== "resolved" &&
          wasActiveTab &&
          activeClosePromptAuthority?.mustPrompt
        ) {
          const canProceed = await d.confirmContinueWithUnsavedChanges({
            forcePrompt: activeClosePromptAuthority.forcePrompt,
            saveTargetTab: activeTabLeaveSnapshot
              ? {
                  id: activeTabLeaveSnapshot.id,
                  title: activeTabLeaveSnapshot.title,
                  filePath: activeTabLeaveSnapshot.filePath,
                  savedStat: activeTabLeaveSnapshot.savedStat,
                  eol: activeTabLeaveSnapshot.eol,
                }
              : undefined,
            localImeDocumentActionPrepared: true,
            proveBeforeDiskWrite: prepared?.ok
              ? () => reproveDocumentLeave(prepared.capture).ok
              : () => false,
          });
          if (!canProceed) return;
          if (
            !prepared?.ok ||
            !reproveDocumentLeave(prepared.capture).ok
          ) return;
        }

        // For non-active dirty tabs: snapshot (safe — guard already ran),
        // switch to the target tab, then show its unsaved guard.
        if (shouldTemporarilyActivateDirtyTab) {
          if (!prepared?.ok) return;
          previousActiveTabSnapshot = captureActiveTabSnapshot(prepared.capture);
          if (!previousActiveTabSnapshot) return;
          if (!restoreTab(tabToClose)) return;
          d.setActiveTabId(tabId);
          const canProceed = await d.confirmContinueWithUnsavedChanges({
            forcePrompt: true,
            saveTargetTab: {
              id: tabToClose.id,
              title: tabToClose.title,
              filePath: tabToClose.filePath,
              savedStat: tabToClose.savedStat,
              eol: tabToClose.eol,
            },
          });
          if (!canProceed) {
            if (!restoreTab(previousActiveTabSnapshot)) return;
            d.setActiveTabId(previousActiveTabSnapshot.id);
            return;
          }
        }

        const remainingTabs = d.tabs.filter((t) => t.id !== tabId);

        if (wasActiveTab) {
          if (!prepared?.ok || !reproveDocumentLeave(prepared.capture).ok) return;
          // Find adjacent tab to switch to
          const closedIndex = d.tabs.findIndex((t) => t.id === tabId);
          const nextTab =
            remainingTabs[Math.min(closedIndex, remainingTabs.length - 1)];
          if (!restoreTab(nextTab)) return;
          d.removeTab(tabId);
          d.setActiveTabId(nextTab.id);
        } else if (previousActiveTabSnapshot) {
          if (!restoreTab(previousActiveTabSnapshot)) return;
          d.removeTab(tabId);
          d.setActiveTabId(previousActiveTabSnapshot.id);
        } else {
          d.removeTab(tabId);
        }
      } finally {
        switchingRef.current = false;
      }
    },
    [
      beginDocumentLeave,
      captureActiveTabSnapshot,
      reproveDocumentLeave,
      restoreTab,
    ],
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
      if (switchingRef.current) return "cancelled";
      const prepared = beginDocumentLeave("open-file-new-tab");
      if (!prepared.ok) return "cancelled";
      switchingRef.current = true;
      try {

      // BETA-SP1: Source Mode guard before snapshot
      const smResult = await d.guardSourceModeDraft({
        localImeDocumentActionPrepared: true,
        proveBeforeDiskWrite: () => reproveDocumentLeave(prepared.capture).ok,
      });
      if (smResult === "cancelled") return "cancelled";

      // Snapshot current tab, create new one with the loaded content
      if (!snapshotActiveTabWithCapture(prepared.capture)) return "cancelled";

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

      // File load — use ensureSafe for "load document" path
      const core = d.coreRef.current;
      if (core) {
        d.notifyActiveDocumentPath?.(resolvedPath);
        d.setSuppressNextDirty(true);
        d.ensureSafeLineBreakPolicyBeforeDocumentLoad({
          targetTabSnapshot: newTab,
        });
        if (!core.loadMarkdown(content)) {
          d.setSuppressNextDirty(false);
          d.notifyActiveDocumentPath?.(d.activeTab.filePath ?? null);
          return "cancelled";
        }
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
      d.addTab(newTab);
      d.setActiveTabId(newTab.id);
      return "added";
      } finally {
        switchingRef.current = false;
      }
    },
    [beginDocumentLeave, reproveDocumentLeave, snapshotActiveTabWithCapture, switchTab],
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

      if (switchingRef.current) return "cancelled";
      const prepared = beginDocumentLeave("active-tab-load");
      if (!prepared.ok) return "cancelled";
      switchingRef.current = true;
      try {

      // BETA-SP1: Source Mode guard before dirty check.
      // "resolved" = save/discard で Source Mode draft を解決済み → dirty guard 不要。
      // "proceed"  = Source Mode 非該当 or draft なし → dirty は PM Doc 基準で正確。
      const smResult = await d.guardSourceModeDraft({
        localImeDocumentActionPrepared: true,
        proveBeforeDiskWrite: () => reproveDocumentLeave(prepared.capture).ok,
      });
      if (smResult === "cancelled") return "cancelled";
      const activeTabLeaveSnapshot = captureActiveTabSnapshot(prepared.capture);
      if (!activeTabLeaveSnapshot) return "cancelled";
      // When smResult === "resolved", save/discard already handled the draft
      // and the user has been prompted. Skip the normal dirty guard to avoid
      // a second prompt (depsRef.current is stale within this async continuation).
      const loadPromptAuthority =
        resolveLocalImeDocumentLeavePromptAuthority({
          disposition: "destructive",
          derivedDirty: activeTabLeaveSnapshot.dirty,
        });
      if (smResult !== "resolved" && loadPromptAuthority.mustPrompt) {
        const canProceed = await d.confirmContinueWithUnsavedChanges({
          forcePrompt: loadPromptAuthority.forcePrompt,
          saveTargetTab: {
            id: activeTabLeaveSnapshot.id,
            title: activeTabLeaveSnapshot.title,
            filePath: activeTabLeaveSnapshot.filePath,
            savedStat: activeTabLeaveSnapshot.savedStat,
            eol: activeTabLeaveSnapshot.eol,
          },
          localImeDocumentActionPrepared: true,
          proveBeforeDiskWrite: () => reproveDocumentLeave(prepared.capture).ok,
        });
        if (!canProceed) return "cancelled";
      }
      if (!reproveDocumentLeave(prepared.capture).ok) return "cancelled";

      const { frontmatterPrefix } = splitLeadingFrontmatter(content);
      const fields = parseFrontmatterFields(frontmatterPrefix);
      const charCount = countBodyCharacters(content);
      const eol = detectEol(content);

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
        // LOCAL-WINDOW-PACKAGED-REARM-POLISH1: ここまで到達した「ユーザー操作による
        // 同一タブの document 切替」だけを bounded token にする。dirty ダイアログ /
        // Save As / Source Mode ガードの取消はこの行に来ないので token は作られず、
        // 起動直後の initial load とも typed に分かれる（continuity 未成立なら false）。
        core.beginLocalImeLocalWindowTransition("document-switch");
        if (!core.loadMarkdown(content)) {
          core.cancelLocalImeLocalWindowTransition("document-switch");
          d.setSuppressNextDirty(false);
          d.notifyActiveDocumentPath?.(d.activeTab.filePath ?? null);
          return "cancelled";
        }
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
      // Editor replacement succeeded. Only now publish the new path/tab metadata.
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
      // 同じ commit で完了 nonce を進める。実際の取得は、この tab row から解決された
      // 書字方向が反映された後の effect で最大 1 回だけ行う。
      setDocumentSwitchNonce((previous) => previous + 1);
      return "loaded";
      } finally {
        switchingRef.current = false;
      }
    },
    [
      beginDocumentLeave,
      captureActiveTabSnapshot,
      reproveDocumentLeave,
      switchTab,
    ],
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
          if (d.activeTabId === existing.id) {
            if (!restoreTab(merged)) return "cancelled";
            d.patchTab(existing.id, { ...core, dirty: false });
            return "added";
          }

          const r = await switchTab(existing.id, merged);
          if (r !== "cancelled") {
            d.patchTab(existing.id, { ...core, dirty: false });
          }
          return r === "cancelled" ? "cancelled" : "added";
        }

        if (d.activeTabId === existing.id) {
          return "added";
        }

        const r = await switchTab(existing.id);
        return r === "cancelled" ? "cancelled" : "added";
      }

      if (d.tabs.length >= MAX_OPEN_TABS) return "tab-limit";
      if (switchingRef.current) return "cancelled";
      const prepared = beginDocumentLeave("shortcut-reference");
      if (!prepared.ok) return "cancelled";
      switchingRef.current = true;
      try {
      const smResult = await d.guardSourceModeDraft({
        localImeDocumentActionPrepared: true,
        proveBeforeDiskWrite: () => reproveDocumentLeave(prepared.capture).ok,
      });
      if (smResult === "cancelled") return "cancelled";
      if (!snapshotActiveTabWithCapture(prepared.capture)) return "cancelled";
      const newTab = createShortcutReferenceEditorTab(
        args.title,
        args.markdown,
        d.defaultLineBreakPolicy,
        args.bundleKey,
      );
      if (!restoreTab(newTab)) return "cancelled";
      d.addTab(newTab);
      d.setActiveTabId(newTab.id);
      return "added";
      } finally {
        switchingRef.current = false;
      }
    },
    [
      beginDocumentLeave,
      reproveDocumentLeave,
      restoreTab,
      snapshotActiveTabWithCapture,
      switchTab,
    ],
  );

  /**
   * FILE-EXPLORER-DELETE-OPEN-TABS1
   *
   * Nyoze 自身の File Explorer から削除した項目と open tab を整合させる境界。
   * File Explorer / App はここを呼ぶだけで、`setTabs` / `setActiveTabId` /
   * EditorCore 内部 DOM / Local Window 内部 DOM / dirty flag を直接触らない。
   *
   *   prepare(preflight) → confirm → beginLease(再証明 + 操作 lease)
   *     → trashItem → finalize(close / detach) → release
   *
   * dirty な affected tab が 1 件でもあれば prepare が拒否し、confirm も trash も
   * 起こらない（fail-closed が安全なのは trash 前まで）。lease 取得後は tab 切替 /
   * 追加 / close / load / Shortcut Reference を全て拒否するので、trash 完了待ちの間に
   * tab 構成・active tab・document identity は動かせない。lease で止められない
   * 「active 文書への入力」だけは finalize 側で detach へ収束させる。
   */
  const readFileExplorerDeleteTabState = useCallback((): FileExplorerDeleteTabState => {
    const d = depsRef.current;
    return {
      tabs: d.tabs,
      activeTabId: d.activeTabId,
      localImeDraftDirtyOwnerTabId: d.localImeDraftDirtyOwnerTabId,
      localImeDraftDirtyNotice: d.readLocalImeDraftDirtyNotice(),
      localImeDocumentActionPending: d.isLocalImeDocumentActionPending(),
      activeDocumentHasUncommittedDraft:
        d.hasActiveDocumentUncommittedDraft?.() ?? false,
    };
  }, []);

  /** 削除確認より前の preflight。ok:false なら confirm も trash も行わない。 */
  const prepareFileExplorerDeleteTabPlan = useCallback(
    (targetPath: string): FileExplorerDeleteTabPreflight =>
      resolveFileExplorerDeleteTabPreflight(
        readFileExplorerDeleteTabState(),
        targetPath,
      ),
    [readFileExplorerDeleteTabState],
  );

  /**
   * `trashItem()` の直前に呼ぶ。plan を再証明し、成功したら操作 lease を取る。
   *
   * lease は既存の `switchingRef`（document lifecycle 進行中フラグ）そのもので、
   * `switchTab` / `addNewTab` / `closeTab` / `openFileInTab` / `loadIntoActiveTab` /
   * `openOrFocusShortcutReferenceTab` は全てこれを見て "cancelled" を返す。
   * false（未取得）で返るのは trash 前だけなので、ここでの fail-closed は安全側。
   */
  const beginFileExplorerDeleteTabLease = useCallback(
    (plan: FileExplorerDeleteTabPlan): boolean => {
      if (switchingRef.current) return false;
      if (!proveFileExplorerDeleteTabPlan(plan, readFileExplorerDeleteTabState())) {
        return false;
      }
      deleteTabLeaseRef.current = plan.targetPath;
      switchingRef.current = true;
      return true;
    },
    [readFileExplorerDeleteTabState],
  );

  /** lease の解放。finalize 済み / 未取得でも安全に呼べる（冪等）。 */
  const releaseFileExplorerDeleteTabLease = useCallback((): void => {
    if (deleteTabLeaseRef.current === null) return;
    deleteTabLeaseRef.current = null;
    switchingRef.current = false;
  }, []);

  /**
   * active tab を閉じるために別文書へ切り替える。成立しなければ ok:false を返し、
   * 呼び出し側が detach へ降格する（trash 済みなので「何もしない」は選べない）。
   */
  const switchActiveDocumentForDeleteFinalize = useCallback(
    (
      finalizePlan: FileExplorerDeleteTabFinalizePlan,
    ): { ok: true; newTab: EditorTab | null } | { ok: false } => {
      const d = depsRef.current;
      const prepared = beginDocumentLeave("tab-close-active");
      if (!prepared.ok) return { ok: false };

      // 残る tab が 0 件: Nyoze は最低 1 tab を保つので、既定 policy の空 tab を 1 件作る。
      if (finalizePlan.nextActiveTabId === null) {
        const newTab = makeEmptyTab(
          d.defaultWritingMode,
          d.defaultLineBreakPolicy,
        );
        const core = d.coreRef.current;
        if (core) {
          d.notifyActiveDocumentPath?.(newTab.filePath ?? null);
          d.setSuppressNextDirty(true);
          if (!core.loadMarkdown(newTab.markdownSnapshot)) {
            d.setSuppressNextDirty(false);
            return { ok: false };
          }
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
        }
        return { ok: true, newTab };
      }

      const nextTab = d.tabs.find((tab) => tab.id === finalizePlan.nextActiveTabId);
      if (!nextTab) return { ok: false };
      if (!restoreTab(nextTab)) return { ok: false };
      return { ok: true, newTab: null };
    },
    [beginDocumentLeave, restoreTab],
  );

  /**
   * trash 成功後にだけ呼ぶ。affected tab を exact once で close / detach へ収束させる。
   *
   * ファイルは既にゴミ箱にあるので、ここに「証明できないから何もしない」分岐は無い。
   * - 現在 state から close / detach を決め直す（古い snapshot のままでは閉じない）。
   * - active tab が affected でなければ editor へ一切触れず、background tab だけ外す。
   * - trash 待ちの間に未保存内容が乗った tab は閉じずに detach（本文を残し `filePath` を外す）。
   * - document 切替が成立しない場合も active tab を detach へ降格して収束させる。
   */
  const finalizeFileExplorerDeleteTabPlan = useCallback(
    (plan: FileExplorerDeleteTabPlan): FileExplorerDeleteTabFinalizeResult => {
      const leased = deleteTabLeaseRef.current === plan.targetPath;
      try {
        const d = depsRef.current;
        const live = readFileExplorerDeleteTabState();
        const tabIdOrder = live.tabs.map((tab) => tab.id);
        let finalizePlan = resolveFileExplorerDeleteTabFinalizePlan(
          live,
          plan.targetPath,
        );
        if (
          finalizePlan.closeTabIds.length === 0 &&
          finalizePlan.detachTabIds.length === 0
        ) {
          return "no-affected-tabs";
        }

        // lease を持たない呼び出し（規約違反）では document 切替を証明できない。
        // editor へ触らない detach だけへ降格し、削除済み path は必ず外す。
        if (!leased) {
          finalizePlan = demoteFileExplorerDeleteTabFinalizePlanToDetach(
            finalizePlan,
            live.activeTabId,
            tabIdOrder,
          );
        }

        let newTab: EditorTab | null = null;
        if (finalizePlan.requiresDocumentSwitch) {
          const switched = switchActiveDocumentForDeleteFinalize(finalizePlan);
          if (switched.ok) {
            newTab = switched.newTab;
          } else {
            finalizePlan = demoteFileExplorerDeleteTabFinalizePlanToDetach(
              finalizePlan,
              live.activeTabId,
              tabIdOrder,
            );
          }
        }

        const appliedNewTab = newTab;
        d.setTabs((tabs) => {
          const next = applyFileExplorerDeleteTabFinalizePlan(
            tabs,
            finalizePlan,
            generateUntitledName,
          );
          return appliedNewTab ? [...next, appliedNewTab] : next;
        });
        const nextActiveTabId = appliedNewTab
          ? appliedNewTab.id
          : finalizePlan.nextActiveTabId;
        if (nextActiveTabId !== null && nextActiveTabId !== live.activeTabId) {
          d.setActiveTabId(nextActiveTabId);
        }
        return finalizePlan.detachTabIds.length > 0
          ? "closed-with-detached"
          : "closed";
      } finally {
        if (leased) {
          deleteTabLeaseRef.current = null;
          switchingRef.current = false;
        }
      }
    },
    [
      readFileExplorerDeleteTabState,
      switchActiveDocumentForDeleteFinalize,
    ],
  );

  return {
    switchTab,
    addNewTab,
    closeTab,
    openFileInTab,
    loadIntoActiveTab,
    snapshotActiveTab,
    openOrFocusShortcutReferenceTab,
    prepareFileExplorerDeleteTabPlan,
    beginFileExplorerDeleteTabLease,
    releaseFileExplorerDeleteTabLease,
    finalizeFileExplorerDeleteTabPlan,
  };
}
