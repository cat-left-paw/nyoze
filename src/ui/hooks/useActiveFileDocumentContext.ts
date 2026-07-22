import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectBooksResult } from "../../project/projectIpcTypes";
import { resolveCurrentRegisteredFileMetadataFromProjectBooksPayload } from "../../project/bookManifestV3ProjectBooks";
import {
  resolveProjectDocumentStartInfoFromBooksResult,
  type ProjectDocumentStartInfo,
} from "../../project/projectDocumentStartInfo";
import {
  buildDocumentContextInfo,
  type DocumentContextInfo,
} from "../../project/documentContextRole";
import type { LibraryRegistryHookState } from "./useLibraryRegistry";
import { getPathBaseName } from "../utils/path";

/**
 * active file の「書庫 / 作品 / 役割」表示文脈を read-only で解決する hook。
 *
 * 境界:
 * - 書庫名は `useLibraryRegistry` の active library payload から取る（read-only）。
 * - 作品 / 役割は `project:resolveProjectBooks(activeFilePath)` だけを使う。renderer から
 *   projectRoot は渡さず、main 側で active file path から解決させる。frontmatter
 *   `book` / `order` / `role` には fallback しない（manifest 正本）。
 * - Project 内 title / authors / translators も同じ `resolveProjectBooks` 結果から導出する。
 *   Project 外単独文書の frontmatter 表示とは混ぜない。
 * - 書庫外 / internal doc / untitled では作品 / 役割の IPC を呼ばない（誤表示しない）。
 * - 何も書き込まない。Project / Book / Notes / Markdown / frontmatter は不変。
 */
type UseActiveFileDocumentContextOptions = {
  activeFilePath: string | null;
  isInternalDoc: boolean;
  externalFileActive: boolean;
  libraryRegistry: LibraryRegistryHookState;
  /** Project Books が更新されたら bump して再取得する（v3 metadata 編集の保存後など）。 */
  refreshNonce?: number;
};

export type ActiveFileProjectDisplayMetadata = {
  title: string;
  authors: string[];
  translators: string[];
};

export type ActiveFileDocumentContextState = {
  documentContextInfo: DocumentContextInfo;
  projectDisplayMetadata: ActiveFileProjectDisplayMetadata | null;
  projectDocumentStartInfo: ProjectDocumentStartInfo;
};

type BooksResultSlot = {
  requestKey: string;
  result: ProjectBooksResult | null;
};

/** active file / 対象外 / refresh と IPC 結果を対応づける key（render 時の stale 判定用）。 */
export function buildActiveFileBooksResultRequestKey(input: {
  activeFilePath: string | null;
  applicable: boolean;
  refreshNonce: number;
}): string {
  if (!input.applicable || !input.activeFilePath) return "inactive";
  return `${input.refreshNonce}\0${input.activeFilePath}`;
}

export function resolveEffectiveBooksResult(
  slot: BooksResultSlot | null,
  requestKey: string,
): ProjectBooksResult | null {
  if (!slot || slot.requestKey !== requestKey) return null;
  return slot.result;
}

export function useActiveFileDocumentContext({
  activeFilePath,
  isInternalDoc,
  externalFileActive,
  libraryRegistry,
  refreshNonce = 0,
}: UseActiveFileDocumentContextOptions): ActiveFileDocumentContextState {
  // 書庫内のときだけ作品 / 役割を解決する（書庫外では誤表示しないため呼ばない）。
  const applicable =
    Boolean(activeFilePath) && !isInternalDoc && !externalFileActive;
  const booksResultRequestKey = buildActiveFileBooksResultRequestKey({
    activeFilePath,
    applicable,
    refreshNonce,
  });
  const [booksResultSlot, setBooksResultSlot] = useState<BooksResultSlot | null>(
    null,
  );
  const generationRef = useRef(0);

  const effectiveBooksResult = useMemo(
    () => resolveEffectiveBooksResult(booksResultSlot, booksResultRequestKey),
    [booksResultSlot, booksResultRequestKey],
  );

  useEffect(() => {
    const generation = ++generationRef.current;
    if (!applicable || !activeFilePath) return;
    const requestKey = buildActiveFileBooksResultRequestKey({
      activeFilePath,
      applicable,
      refreshNonce,
    });
    const bridge = window.nyozeBridge?.project;
    if (!bridge?.resolveProjectBooks) return;
    bridge
      .resolveProjectBooks(activeFilePath)
      .then((result) => {
        if (generation !== generationRef.current) return;
        setBooksResultSlot({ requestKey, result });
      })
      .catch(() => {
        if (generation !== generationRef.current) return;
        setBooksResultSlot({ requestKey, result: null });
      });
  }, [activeFilePath, applicable, refreshNonce]);

  const activeLibraryName = useMemo(() => {
    if (libraryRegistry.status !== "ready") return null;
    const active = libraryRegistry.registeredLibraries.find(
      (lib) => lib.id === libraryRegistry.activeLibraryId,
    );
    return active?.name ?? null;
  }, [libraryRegistry]);

  const documentContextInfo = useMemo(
    () =>
      buildDocumentContextInfo({
        hasActiveFile: Boolean(activeFilePath),
        isInternalDoc,
        externalFileActive,
        activeLibraryName,
        booksResult: effectiveBooksResult,
      }),
    [
      activeFilePath,
      isInternalDoc,
      externalFileActive,
      activeLibraryName,
      effectiveBooksResult,
    ],
  );

  const projectDisplayMetadata = useMemo<ActiveFileProjectDisplayMetadata | null>(() => {
    if (
      !activeFilePath ||
      !effectiveBooksResult ||
      !effectiveBooksResult.ok ||
      effectiveBooksResult.kind !== "ready"
    ) {
      return null;
    }
    const registered = resolveCurrentRegisteredFileMetadataFromProjectBooksPayload({
      books: effectiveBooksResult.books,
      materialsFlat: effectiveBooksResult.materialsFlat ?? [],
    });
    if (registered) {
      return {
        title: registered.title,
        authors: [...registered.authors],
        translators: [...registered.translators],
      };
    }
    return {
      title: getPathBaseName(activeFilePath),
      authors: [],
      translators: [],
    };
  }, [activeFilePath, effectiveBooksResult]);

  const projectDocumentStartInfo = useMemo(
    () => resolveProjectDocumentStartInfoFromBooksResult(effectiveBooksResult),
    [effectiveBooksResult],
  );

  return useMemo(
    () => ({
      documentContextInfo,
      projectDisplayMetadata,
      projectDocumentStartInfo,
    }),
    [documentContextInfo, projectDisplayMetadata, projectDocumentStartInfo],
  );
}
