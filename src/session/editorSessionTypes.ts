export const EDITOR_SESSION_SCHEMA_VERSION = 1 as const;

export type EditorSessionTabPath = {
  filePath: string;
};

export type EditorSessionPersistRequest = {
  version: typeof EDITOR_SESSION_SCHEMA_VERSION;
  revision: number;
  tabs: EditorSessionTabPath[];
  activeFilePath: string | null;
  activeIndex: number;
};

export type EditorSessionRestoredTab = {
  filePath: string;
  content: string;
  savedStat: { mtimeMs: number; size: number };
};

export type EditorSessionRestoreResult = {
  revision: number;
  tabs: EditorSessionRestoredTab[];
  activeIndex: number;
  source: "restored" | "empty" | "invalid";
};

export type EditorSessionWriteResult = {
  accepted: boolean;
  persisted: boolean;
  revision: number;
};
