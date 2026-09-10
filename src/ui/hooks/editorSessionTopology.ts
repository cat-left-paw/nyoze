import type { LineBreakPolicy } from "../../editor-core/types";
import {
  parseFrontmatterFields,
  splitLeadingFrontmatter,
} from "../../editor-core/io/frontmatter";
import { resolveDocumentMarkdownOptions } from "../../editor-core/io/frontmatterDocumentSettings";
import { detectEol } from "../../editor-core/io/eolHelper";
import type { WritingMode } from "../../settings/types";
import {
  EDITOR_SESSION_SCHEMA_VERSION,
  type EditorSessionPersistRequest,
  type EditorSessionRestoredTab,
} from "../../session/editorSessionTypes";
import { countBodyCharacters } from "../utils/countBodyCharacters";
import { getPathBaseName } from "../utils/path";
import type { EditorTab } from "./useAppUiState";

type PersistableTab = Pick<EditorTab, "id" | "filePath" | "internalDocId">;

export type EditorSessionTopology = Omit<EditorSessionPersistRequest, "revision">;

export function deriveEditorSessionTopology(
  tabs: readonly PersistableTab[],
  activeTabId: string,
): EditorSessionTopology {
  const persisted = tabs
    .map((tab, originalIndex) => ({ tab, originalIndex }))
    .filter(({ tab }) => tab.filePath !== null && !tab.internalDocId);
  const activeFileIndex = persisted.findIndex(({ tab }) => tab.id === activeTabId);
  const activeOriginalIndex = Math.max(0, tabs.findIndex((tab) => tab.id === activeTabId));

  let activeIndex = activeFileIndex;
  if (activeIndex < 0 && persisted.length > 0) {
    activeIndex = 0;
    for (let index = 1; index < persisted.length; index += 1) {
      const candidate = persisted[index]!;
      const current = persisted[activeIndex]!;
      const candidateDistance = Math.abs(candidate.originalIndex - activeOriginalIndex);
      const currentDistance = Math.abs(current.originalIndex - activeOriginalIndex);
      if (
        candidateDistance < currentDistance ||
        (candidateDistance === currentDistance &&
          current.originalIndex < activeOriginalIndex &&
          candidate.originalIndex >= activeOriginalIndex)
      ) {
        activeIndex = index;
      }
    }
  }

  const sessionTabs = persisted.map(({ tab }) => ({ filePath: tab.filePath! }));
  return {
    version: EDITOR_SESSION_SCHEMA_VERSION,
    tabs: sessionTabs,
    activeFilePath:
      activeFileIndex >= 0 ? sessionTabs[activeFileIndex]!.filePath : null,
    activeIndex: Math.max(0, activeIndex),
  };
}

export function editorSessionTopologyKey(topology: EditorSessionTopology): string {
  return JSON.stringify({
    tabs: topology.tabs.map((tab) => tab.filePath),
    activeFilePath: topology.activeFilePath,
    activeIndex: topology.activeIndex,
  });
}

export function shouldPersistEditorSessionTopology(input: {
  hydrated: boolean;
  previousKey: string | null;
  nextKey: string;
}): boolean {
  return input.hydrated && input.previousKey !== input.nextKey;
}

export function resolvePersistedEditorSessionTopologyKey(input: {
  previousKey: string | null;
  attemptedKey: string;
  persisted: boolean;
}): string | null {
  return input.persisted ? input.attemptedKey : input.previousKey;
}

export function loadRestoredMarkdownWithDirtySuppression(input: {
  load: () => boolean;
  setSuppressNextDirty: (value: boolean) => void;
}): boolean {
  let loaded = false;
  input.setSuppressNextDirty(true);
  try {
    loaded = input.load();
    return loaded;
  } finally {
    if (!loaded) input.setSuppressNextDirty(false);
  }
}

export function createEditorSessionPersistRequest(
  topology: EditorSessionTopology,
  revision: number,
): EditorSessionPersistRequest {
  return { ...topology, revision };
}

export function buildRestoredEditorTabs(
  tabs: readonly EditorSessionRestoredTab[],
  defaults: {
    writingMode: WritingMode;
    lineBreakPolicy: LineBreakPolicy;
    generateTabId: () => string;
  },
): EditorTab[] {
  return tabs.map((tab) => {
    const { frontmatterPrefix } = splitLeadingFrontmatter(tab.content);
    const frontmatterFields = parseFrontmatterFields(frontmatterPrefix);
    return {
      id: defaults.generateTabId(),
      title: getPathBaseName(tab.filePath),
      dirty: false,
      filePath: tab.filePath,
      markdownSnapshot: tab.content,
      cleanMarkdownSnapshot: tab.content,
      frontmatterFields,
      documentMarkdownOptions: resolveDocumentMarkdownOptions(frontmatterFields),
      characterCount: countBodyCharacters(tab.content),
      savedStat: tab.savedStat,
      writingMode: defaults.writingMode,
      writingModeFollowsTypeRecommendation: true,
      lineBreakPolicy: defaults.lineBreakPolicy,
      eol: detectEol(tab.content),
      scrollTop: 0,
      scrollLeft: 0,
      viewportAnchorPmPos: null,
      viewportAnchorTextOffset: null,
      viewportAnchorTextTotal: null,
      sourceModeTopOffset: null,
    };
  });
}
