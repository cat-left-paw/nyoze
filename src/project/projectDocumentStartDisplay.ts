/**
 * Project 内文書冒頭表示の visible / field toggle 解決（pure / read-only）。
 *
 * settings key は追加しない。master は呼び出し側で `frontmatterVisible` を渡す前提。
 */

import type {
  ProjectDocumentStartBook,
  ProjectDocumentStartFile,
  ProjectDocumentStartInfo,
} from "./projectDocumentStartInfo";

export type ProjectDocumentStartBlockDisplay<T> = {
  visible: boolean;
  payload: T | null;
  showTitle: boolean;
  showAuthors: boolean;
  showTranslators: boolean;
};

export type ProjectDocumentStartDisplay = {
  book: ProjectDocumentStartBlockDisplay<ProjectDocumentStartBook>;
  file: ProjectDocumentStartBlockDisplay<ProjectDocumentStartFile>;
};

const hiddenBook = (): ProjectDocumentStartDisplay["book"] => ({
  visible: false,
  payload: null,
  showTitle: false,
  showAuthors: false,
  showTranslators: false,
});

const hiddenFile = (): ProjectDocumentStartDisplay["file"] => ({
  visible: false,
  payload: null,
  showTitle: false,
  showAuthors: false,
  showTranslators: false,
});

/**
 * Project 内 body item の Book / file 冒頭 block 表示を解決する。
 *
 * - master OFF / Project 外 / `none` → 両 block 非表示。
 * - first-body → Book block（master ON 時）+ file block（`showInProjectFiles` 時）。
 * - body → file block のみ（`showInProjectFiles` 時）。
 */
export function resolveProjectDocumentStartDisplay(input: {
  masterVisible: boolean;
  inProject: boolean;
  startInfo: ProjectDocumentStartInfo;
  showBookAuthors: boolean;
  showInProjectFiles: boolean;
  showFileTitle: boolean;
  showFileAuthors: boolean;
  showTranslators: boolean;
}): ProjectDocumentStartDisplay {
  if (!input.masterVisible || !input.inProject || input.startInfo.kind === "none") {
    return { book: hiddenBook(), file: hiddenFile() };
  }

  if (input.startInfo.kind === "first-body") {
    return {
      book: {
        visible: true,
        payload: input.startInfo.book,
        showTitle: true,
        showAuthors: input.showBookAuthors,
        showTranslators: false,
      },
      file: {
        visible: input.showInProjectFiles,
        payload: input.startInfo.file,
        showTitle: input.showFileTitle,
        showAuthors: input.showFileAuthors,
        showTranslators: input.showTranslators,
      },
    };
  }

  return {
    book: hiddenBook(),
    file: {
      visible: input.showInProjectFiles,
      payload: input.startInfo.file,
      showTitle: input.showFileTitle,
      showAuthors: input.showFileAuthors,
      showTranslators: input.showTranslators,
    },
  };
}
