import { useCallback, useMemo, useState } from "react";
import type { DocumentContextInfo } from "../../project/documentContextRole";
import { getPathBaseName, isPathWithinRoot } from "../utils/path";
import {
  useLibraryRegistry,
  type LibraryRegistryHookState,
} from "./useLibraryRegistry";
import {
  useActiveFileDocumentContext,
  type ActiveFileProjectDisplayMetadata,
} from "./useActiveFileDocumentContext";
import type { ProjectDocumentStartInfo } from "../../project/projectDocumentStartInfo";

type UseLibraryManagerGlueOptions = {
  activeTabFilePath: string | null;
  isInternalDoc: boolean;
  fileExplorerDir: string | null;
  /** Project Books v3 metadata 編集の保存後など、左ペイン文書 metadata を再取得する nonce。 */
  projectRefreshNonce?: number;
  setDisplaySettingsOpen: (open: boolean) => void;
  onLibraryRootActivated: (activeRoot: string) => void;
};

export type UseLibraryManagerGlueResult = {
  libraryManagerOpen: boolean;
  libraryRegistryState: LibraryRegistryHookState;
  reloadLibraryRegistry: () => void;
  handleOpenLibraryManager: () => void;
  handleCloseLibraryManager: () => void;
  handleOpenLibraryManagerFromDisplaySettings: () => void;
  handleLibraryActivated: (activeRoot: string) => void;
  externalFileActive: boolean;
  externalFileName: string;
  documentContextInfo: DocumentContextInfo;
  projectDisplayMetadata: ActiveFileProjectDisplayMetadata | null;
  projectDocumentStartInfo: ProjectDocumentStartInfo;
  showLibraryOnboarding: boolean;
};

/**
 * App-level glue for the Library Manager shell.
 *
 * This hook owns only UI opening state, read-only registry subscription, and
 * display flags derived from the active tab path. Registry mutation remains in
 * LibraryManagerModal; file explorer activation remains in useFileExplorer.
 */
export function useLibraryManagerGlue({
  activeTabFilePath,
  isInternalDoc,
  fileExplorerDir,
  projectRefreshNonce = 0,
  setDisplaySettingsOpen,
  onLibraryRootActivated,
}: UseLibraryManagerGlueOptions): UseLibraryManagerGlueResult {
  const { state: libraryRegistryState, reload: reloadLibraryRegistry } =
    useLibraryRegistry();
  const [libraryManagerOpen, setLibraryManagerOpen] = useState(false);

  const handleOpenLibraryManager = useCallback(() => {
    setLibraryManagerOpen(true);
  }, []);

  const handleCloseLibraryManager = useCallback(() => {
    setLibraryManagerOpen(false);
    reloadLibraryRegistry();
  }, [reloadLibraryRegistry]);

  const handleOpenLibraryManagerFromDisplaySettings = useCallback(() => {
    setDisplaySettingsOpen(false);
    handleOpenLibraryManager();
  }, [handleOpenLibraryManager, setDisplaySettingsOpen]);

  const handleLibraryActivated = useCallback(
    (activeRoot: string) => {
      onLibraryRootActivated(activeRoot);
    },
    [onLibraryRootActivated],
  );

  // 書庫外の保存済み単独ファイルを開いている状態の検出（read-only 表示用）。
  const externalFileActive = useMemo(() => {
    if (!activeTabFilePath || isInternalDoc) return false;
    const libraryRoots: string[] = [];
    if (
      libraryRegistryState.status === "ready" &&
      libraryRegistryState.activeLibraryRoot
    ) {
      libraryRoots.push(libraryRegistryState.activeLibraryRoot);
    }
    if (fileExplorerDir) libraryRoots.push(fileExplorerDir);
    return !libraryRoots.some((root) =>
      isPathWithinRoot(activeTabFilePath, root),
    );
  }, [activeTabFilePath, fileExplorerDir, isInternalDoc, libraryRegistryState]);

  const externalFileName = activeTabFilePath
    ? getPathBaseName(activeTabFilePath)
    : "";

  const { documentContextInfo, projectDisplayMetadata, projectDocumentStartInfo } =
    useActiveFileDocumentContext({
    activeFilePath: activeTabFilePath,
    isInternalDoc,
    externalFileActive,
    libraryRegistry: libraryRegistryState,
    refreshNonce: projectRefreshNonce,
  });

  const showLibraryOnboarding =
    !fileExplorerDir &&
    libraryRegistryState.status === "ready" &&
    libraryRegistryState.registeredLibraries.length === 0;

  return {
    libraryManagerOpen,
    libraryRegistryState,
    reloadLibraryRegistry,
    handleOpenLibraryManager,
    handleCloseLibraryManager,
    handleOpenLibraryManagerFromDisplaySettings,
    handleLibraryActivated,
    externalFileActive,
    externalFileName,
    documentContextInfo,
    projectDisplayMetadata,
    projectDocumentStartInfo,
    showLibraryOnboarding,
  };
}
