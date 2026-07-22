import { useCallback, useMemo } from "react";
import type { DocumentContextInfo } from "../../project/documentContextRole";
import {
  resolveFileMetadataProjectContext,
  type FileMetadataProjectContext,
} from "../../project/fileMetadataProjectContext";
import type { RightPaneTab } from "../components/RightPaneTabBar";

type UseFileMetadataPanelGlueOptions = {
  inProject: boolean;
  membershipPending: boolean;
  documentContext: DocumentContextInfo;
  setRightPaneOpen: (open: boolean) => void;
  setRightPaneTab: (tab: RightPaneTab) => void;
  setDisplaySettingsOpen: (open: boolean) => void;
  isDirty: boolean;
  saveDocument: (forceSaveAs: boolean) => Promise<boolean>;
};

export function useFileMetadataPanelGlue({
  inProject,
  membershipPending,
  documentContext,
  setRightPaneOpen,
  setRightPaneTab,
  setDisplaySettingsOpen,
  isDirty,
  saveDocument,
}: UseFileMetadataPanelGlueOptions): {
  documentSettingsGlue: {
    fileMetadataProjectContext: FileMetadataProjectContext;
    onOpenProjectTab: () => void;
    isDirty: boolean;
    onSaveDocument: () => void | Promise<void>;
  };
} {
  const fileMetadataProjectContext = useMemo(
    () =>
      resolveFileMetadataProjectContext({
        inProject,
        membershipPending,
        documentContext,
      }),
    [inProject, membershipPending, documentContext],
  );

  const openProjectTab = useCallback(() => {
    setRightPaneOpen(true);
    setRightPaneTab("project");
    setDisplaySettingsOpen(false);
  }, [setRightPaneOpen, setRightPaneTab, setDisplaySettingsOpen]);

  const onSaveDocument = useCallback(async () => {
    await saveDocument(false);
  }, [saveDocument]);

  return {
    documentSettingsGlue: {
      fileMetadataProjectContext,
      onOpenProjectTab: openProjectTab,
      isDirty,
      onSaveDocument,
    },
  };
}
